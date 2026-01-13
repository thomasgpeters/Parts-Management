const express = require('express');
const router = express.Router();
const { db, toCamelCase, rowsToCamelCase } = require('../db');

// GET /api/reorder/alerts - Get all reorder alerts
router.get('/alerts', async (req, res, next) => {
  try {
    const { status, limit = 50 } = req.query;

    let sql = 'SELECT * FROM reorder_alerts WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const alerts = db.prepare(sql).all(...params);
    res.json(rowsToCamelCase(alerts));
  } catch (error) {
    next(error);
  }
});

// GET /api/reorder/alerts/pending - Get pending alerts count
router.get('/alerts/pending', async (req, res, next) => {
  try {
    const count = db.prepare("SELECT COUNT(*) as count FROM reorder_alerts WHERE status = 'PENDING'").get();
    const alerts = db.prepare("SELECT * FROM reorder_alerts WHERE status = 'PENDING' ORDER BY created_at DESC").all();

    res.json({ count: count.count, alerts: rowsToCamelCase(alerts) });
  } catch (error) {
    next(error);
  }
});

// POST /api/reorder/check - Manually trigger reorder check
router.post('/check', async (req, res, next) => {
  try {
    const inventory = db.prepare(`
      SELECT i.*, p.part_number, p.name as part_name, p.vendor_id, v.name as vendor_name
      FROM inventory i
      JOIN parts p ON p.id = i.part_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      WHERE p.is_active = 1
    `).all();

    const newAlerts = [];

    for (const item of inventory) {
      if (item.quantity_on_hand <= item.reorder_point) {
        const existing = db.prepare(`
          SELECT * FROM reorder_alerts WHERE part_id = ? AND status = 'PENDING'
        `).get(item.part_id);

        if (!existing) {
          const result = db.prepare(`
            INSERT INTO reorder_alerts (part_id, part_number, part_name, current_qty, reorder_point, reorder_qty, vendor_id, vendor_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(item.part_id, item.part_number, item.part_name, item.quantity_on_hand, item.reorder_point, item.reorder_quantity, item.vendor_id, item.vendor_name);

          const alert = db.prepare('SELECT * FROM reorder_alerts WHERE id = ?').get(result.lastInsertRowid);
          newAlerts.push(toCamelCase(alert));
        }
      }
    }

    res.json({
      message: `Created ${newAlerts.length} new reorder alerts`,
      alerts: newAlerts
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/reorder/alerts/:id/process - Process a reorder alert (create order)
router.post('/alerts/:id/process', async (req, res, next) => {
  try {
    const alertId = parseInt(req.params.id);
    const alert = db.prepare('SELECT * FROM reorder_alerts WHERE id = ?').get(alertId);

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    if (alert.status !== 'PENDING') {
      return res.status(400).json({ error: 'Alert is not pending' });
    }

    if (!alert.vendor_id) {
      return res.status(400).json({ error: 'No vendor assigned to this part' });
    }

    const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(alert.part_id);
    if (!part) {
      return res.status(400).json({ error: 'Part not found' });
    }

    // Generate order number
    const date = new Date();
    const prefix = `PO${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const lastOrder = db.prepare(`
      SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1
    `).get(`${prefix}%`);

    let sequence = 1;
    if (lastOrder) {
      sequence = parseInt(lastOrder.order_number.slice(-4)) + 1;
    }
    const orderNumber = `${prefix}${String(sequence).padStart(4, '0')}`;
    const totalPrice = alert.reorder_qty * part.unit_price;

    const createOrder = db.transaction(() => {
      const orderResult = db.prepare(`
        INSERT INTO orders (order_number, vendor_id, status, is_auto_generated, subtotal, total, notes)
        VALUES (?, ?, 'PENDING', 1, ?, ?, ?)
      `).run(orderNumber, alert.vendor_id, totalPrice, totalPrice, `Auto-generated from reorder alert #${alertId}`);

      const orderId = orderResult.lastInsertRowid;

      db.prepare(`
        INSERT INTO order_items (order_id, part_id, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?)
      `).run(orderId, alert.part_id, alert.reorder_qty, part.unit_price, totalPrice);

      db.prepare(`
        UPDATE reorder_alerts SET status = 'ORDERED', order_id = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(orderId, alertId);

      return orderId;
    });

    const orderId = createOrder();

    const order = db.prepare(`
      SELECT o.*, v.name as vendor_name FROM orders o
      JOIN vendors v ON v.id = o.vendor_id WHERE o.id = ?
    `).get(orderId);
    const items = db.prepare(`
      SELECT oi.*, p.part_number, p.name as part_name FROM order_items oi
      JOIN parts p ON p.id = oi.part_id WHERE oi.order_id = ?
    `).all(orderId);

    res.json({
      success: true,
      order: {
        ...toCamelCase(order),
        vendor: { id: order.vendor_id, name: order.vendor_name },
        items: rowsToCamelCase(items)
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/reorder/alerts/:id/dismiss - Dismiss a reorder alert
router.post('/alerts/:id/dismiss', async (req, res, next) => {
  try {
    const alertId = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM reorder_alerts WHERE id = ?').get(alertId);

    if (!existing) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    db.prepare(`
      UPDATE reorder_alerts SET status = 'DISMISSED', processed_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(alertId);

    const alert = db.prepare('SELECT * FROM reorder_alerts WHERE id = ?').get(alertId);
    res.json(toCamelCase(alert));
  } catch (error) {
    next(error);
  }
});

// POST /api/reorder/process-all - Process all pending alerts
router.post('/process-all', async (req, res, next) => {
  try {
    const pendingAlerts = db.prepare("SELECT * FROM reorder_alerts WHERE status = 'PENDING'").all();

    const results = [];
    for (const alert of pendingAlerts) {
      if (!alert.vendor_id) {
        results.push({ alertId: alert.id, partNumber: alert.part_number, success: false, error: 'No vendor' });
        continue;
      }

      const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(alert.part_id);
      if (!part) {
        results.push({ alertId: alert.id, partNumber: alert.part_number, success: false, error: 'Part not found' });
        continue;
      }

      const date = new Date();
      const prefix = `PO${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
      const lastOrder = db.prepare(`
        SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1
      `).get(`${prefix}%`);

      let sequence = 1;
      if (lastOrder) {
        sequence = parseInt(lastOrder.order_number.slice(-4)) + 1;
      }
      const orderNumber = `${prefix}${String(sequence).padStart(4, '0')}`;
      const totalPrice = alert.reorder_qty * part.unit_price;

      const createOrder = db.transaction(() => {
        const orderResult = db.prepare(`
          INSERT INTO orders (order_number, vendor_id, status, is_auto_generated, subtotal, total, notes)
          VALUES (?, ?, 'PENDING', 1, ?, ?, ?)
        `).run(orderNumber, alert.vendor_id, totalPrice, totalPrice, `Auto-generated from reorder alert #${alert.id}`);

        const orderId = orderResult.lastInsertRowid;

        db.prepare(`
          INSERT INTO order_items (order_id, part_id, quantity, unit_price, total_price)
          VALUES (?, ?, ?, ?, ?)
        `).run(orderId, alert.part_id, alert.reorder_qty, part.unit_price, totalPrice);

        db.prepare(`
          UPDATE reorder_alerts SET status = 'ORDERED', order_id = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(orderId, alert.id);

        return orderId;
      });

      createOrder();
      results.push({ alertId: alert.id, partNumber: alert.part_number, success: true });
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      message: `Processed ${pendingAlerts.length} alerts: ${successful} successful, ${failed} failed`,
      results
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reorder/suggestions - Get reorder suggestions
router.get('/suggestions', async (req, res, next) => {
  try {
    const inventory = db.prepare(`
      SELECT i.*, p.part_number, p.name as part_name, p.unit_price, p.vendor_id, p.is_active,
        v.name as vendor_name, v.lead_time_days
      FROM inventory i
      JOIN parts p ON p.id = i.part_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
    `).all();

    const suggestions = inventory
      .filter(i => i.quantity_on_hand <= i.reorder_point && i.is_active)
      .map(i => ({
        partId: i.part_id,
        partNumber: i.part_number,
        partName: i.part_name,
        vendorId: i.vendor_id,
        vendorName: i.vendor_name,
        currentQuantity: i.quantity_on_hand,
        reorderPoint: i.reorder_point,
        reorderQuantity: i.reorder_quantity,
        shortfall: i.reorder_point - i.quantity_on_hand,
        estimatedCost: i.reorder_quantity * (i.unit_price || 0),
        leadTimeDays: i.lead_time_days || 7
      }))
      .sort((a, b) => b.shortfall - a.shortfall);

    const byVendor = {};
    suggestions.forEach(s => {
      if (!s.vendorId) return;
      if (!byVendor[s.vendorId]) {
        byVendor[s.vendorId] = {
          vendorId: s.vendorId,
          vendorName: s.vendorName,
          items: [],
          totalEstimatedCost: 0
        };
      }
      byVendor[s.vendorId].items.push(s);
      byVendor[s.vendorId].totalEstimatedCost += s.estimatedCost;
    });

    res.json({
      suggestions,
      byVendor: Object.values(byVendor).sort((a, b) => b.items.length - a.items.length),
      summary: {
        totalItems: suggestions.length,
        totalEstimatedCost: Math.round(suggestions.reduce((sum, s) => sum + s.estimatedCost, 0) * 100) / 100,
        vendorCount: Object.keys(byVendor).length
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/reorder/create-orders - Create orders from suggestions
router.post('/create-orders', async (req, res, next) => {
  try {
    const { vendorIds } = req.body;

    const inventory = db.prepare(`
      SELECT i.*, p.part_number, p.name as part_name, p.unit_price, p.vendor_id, p.is_active,
        v.name as vendor_name
      FROM inventory i
      JOIN parts p ON p.id = i.part_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      WHERE i.quantity_on_hand <= i.reorder_point AND p.is_active = 1 AND p.vendor_id IS NOT NULL
    `).all();

    const lowStockByVendor = {};
    inventory.forEach(i => {
      if (vendorIds && !vendorIds.includes(i.vendor_id)) return;

      if (!lowStockByVendor[i.vendor_id]) {
        lowStockByVendor[i.vendor_id] = {
          vendorName: i.vendor_name,
          items: []
        };
      }
      lowStockByVendor[i.vendor_id].items.push({
        partId: i.part_id,
        quantity: i.reorder_quantity,
        unitPrice: i.unit_price
      });
    });

    const createdOrders = [];

    for (const vendorId of Object.keys(lowStockByVendor)) {
      const { vendorName, items } = lowStockByVendor[vendorId];

      const date = new Date();
      const prefix = `PO${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
      const lastOrder = db.prepare(`
        SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1
      `).get(`${prefix}%`);

      let sequence = 1;
      if (lastOrder) {
        sequence = parseInt(lastOrder.order_number.slice(-4)) + 1;
      }
      const orderNumber = `${prefix}${String(sequence).padStart(4, '0')}`;

      const orderItems = items.map(item => ({
        ...item,
        totalPrice: item.quantity * item.unitPrice
      }));

      const subtotal = orderItems.reduce((sum, i) => sum + i.totalPrice, 0);

      const createOrder = db.transaction(() => {
        const orderResult = db.prepare(`
          INSERT INTO orders (order_number, vendor_id, status, is_auto_generated, subtotal, total)
          VALUES (?, ?, 'PENDING', 1, ?, ?)
        `).run(orderNumber, parseInt(vendorId), subtotal, subtotal);

        const orderId = orderResult.lastInsertRowid;

        for (const item of orderItems) {
          db.prepare(`
            INSERT INTO order_items (order_id, part_id, quantity, unit_price, total_price)
            VALUES (?, ?, ?, ?, ?)
          `).run(orderId, item.partId, item.quantity, item.unitPrice, item.totalPrice);
        }

        return orderId;
      });

      const orderId = createOrder();
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      createdOrders.push({
        ...toCamelCase(order),
        vendor: { id: parseInt(vendorId), name: vendorName }
      });
    }

    res.json({
      message: `Created ${createdOrders.length} orders`,
      orders: createdOrders
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
