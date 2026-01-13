const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, toCamelCase, rowsToCamelCase } = require('../db');

// Generate unique order number
const generateOrderNumber = () => {
  const date = new Date();
  const prefix = `PO${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;

  const lastOrder = db.prepare(`
    SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1
  `).get(`${prefix}%`);

  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.order_number.slice(-4));
    sequence = lastSequence + 1;
  }

  return `${prefix}${String(sequence).padStart(4, '0')}`;
};

// Calculate order totals
const calculateOrderTotals = (items, tax = 0, shipping = 0) => {
  const subtotal = items.reduce((sum, item) => sum + (item.total_price || item.totalPrice || 0), 0);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    shipping: Math.round(shipping * 100) / 100,
    total: Math.round((subtotal + tax + shipping) * 100) / 100
  };
};

// GET /api/orders - List all orders
router.get('/', async (req, res, next) => {
  try {
    const { status, vendorId, page = 1, limit = 50 } = req.query;

    let sql = `
      SELECT o.*, v.name as vendor_name, v.code as vendor_code,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
      FROM orders o
      LEFT JOIN vendors v ON v.id = o.vendor_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ` AND o.status = ?`;
      params.push(status);
    }
    if (vendorId) {
      sql += ` AND o.vendor_id = ?`;
      params.push(parseInt(vendorId));
    }

    const countSql = sql.replace(/SELECT o\.\*.*FROM/, 'SELECT COUNT(*) as total FROM');
    const totalResult = db.prepare(countSql).get(...params);
    const total = totalResult?.total || 0;

    sql += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const orders = db.prepare(sql).all(...params);

    const result = orders.map(o => {
      const items = db.prepare(`
        SELECT oi.*, p.part_number, p.name as part_name
        FROM order_items oi
        JOIN parts p ON p.id = oi.part_id
        WHERE oi.order_id = ?
      `).all(o.id);

      return {
        ...toCamelCase(o),
        vendor: { id: o.vendor_id, name: o.vendor_name, code: o.vendor_code },
        items: rowsToCamelCase(items)
      };
    });

    res.json({
      data: result,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/orders/summary - Get orders summary
router.get('/summary', async (req, res, next) => {
  try {
    const orders = db.prepare('SELECT * FROM orders').all();

    const summary = {
      total: orders.length,
      byStatus: {},
      totalValue: 0,
      thisMonth: 0,
      thisMonthValue: 0
    };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    orders.forEach(order => {
      summary.byStatus[order.status] = (summary.byStatus[order.status] || 0) + 1;
      summary.totalValue += order.total;

      if (new Date(order.created_at) >= startOfMonth) {
        summary.thisMonth++;
        summary.thisMonthValue += order.total;
      }
    });

    summary.totalValue = Math.round(summary.totalValue * 100) / 100;
    summary.thisMonthValue = Math.round(summary.thisMonthValue * 100) / 100;

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// GET /api/orders/:id - Get order by ID
router.get('/:id', async (req, res, next) => {
  try {
    const order = db.prepare(`
      SELECT o.*, v.name as vendor_name, v.code as vendor_code
      FROM orders o
      LEFT JOIN vendors v ON v.id = o.vendor_id
      WHERE o.id = ?
    `).get(parseInt(req.params.id));

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = db.prepare(`
      SELECT oi.*, p.part_number, p.name as part_name
      FROM order_items oi
      JOIN parts p ON p.id = oi.part_id
      WHERE oi.order_id = ?
    `).all(order.id);

    const logs = db.prepare(`
      SELECT * FROM inventory_logs WHERE order_id = ? ORDER BY created_at DESC
    `).all(order.id);

    const result = {
      ...toCamelCase(order),
      vendor: { id: order.vendor_id, name: order.vendor_name, code: order.vendor_code },
      items: rowsToCamelCase(items),
      inventoryLogs: rowsToCamelCase(logs)
    };

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/orders - Create new order
router.post('/', [
  body('vendorId').isInt().withMessage('Vendor ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { vendorId, items, notes, shippingAddress, tax = 0, shipping = 0, isAutoGenerated = false } = req.body;

    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendorId);
    if (!vendor) {
      return res.status(400).json({ error: 'Vendor not found' });
    }

    const orderItems = items.map(item => {
      const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(item.partId);
      if (!part) {
        throw new Error(`Part with ID ${item.partId} not found`);
      }
      const unitPrice = item.unitPrice || part.unit_price;
      return {
        partId: item.partId,
        quantity: item.quantity,
        unitPrice,
        totalPrice: unitPrice * item.quantity,
        notes: item.notes
      };
    });

    const totals = calculateOrderTotals(orderItems, tax, shipping);
    const orderNumber = generateOrderNumber();

    const createOrder = db.transaction(() => {
      const orderResult = db.prepare(`
        INSERT INTO orders (order_number, vendor_id, status, notes, shipping_address, is_auto_generated, subtotal, tax, shipping, total)
        VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?)
      `).run(orderNumber, vendorId, notes || null, shippingAddress || null, isAutoGenerated ? 1 : 0, totals.subtotal, totals.tax, totals.shipping, totals.total);

      const orderId = orderResult.lastInsertRowid;

      for (const item of orderItems) {
        db.prepare(`
          INSERT INTO order_items (order_id, part_id, quantity, unit_price, total_price, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(orderId, item.partId, item.quantity, item.unitPrice, item.totalPrice, item.notes || null);
      }

      return orderId;
    });

    const orderId = createOrder();

    const order = db.prepare(`
      SELECT o.*, v.name as vendor_name FROM orders o
      JOIN vendors v ON v.id = o.vendor_id WHERE o.id = ?
    `).get(orderId);
    const createdItems = db.prepare(`
      SELECT oi.*, p.part_number, p.name as part_name FROM order_items oi
      JOIN parts p ON p.id = oi.part_id WHERE oi.order_id = ?
    `).all(orderId);

    res.status(201).json({
      ...toCamelCase(order),
      vendor: { id: order.vendor_id, name: order.vendor_name },
      items: rowsToCamelCase(createdItems)
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/orders/:id/status - Update order status
router.patch('/:id/status', [
  body('status').isIn(['DRAFT', 'PENDING', 'APPROVED', 'ORDERED', 'SHIPPED', 'RECEIVED', 'CANCELLED'])
    .withMessage('Invalid status'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const orderId = parseInt(req.params.id);
    const { status, trackingNumber } = req.body;

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const validTransitions = {
      DRAFT: ['PENDING', 'CANCELLED'],
      PENDING: ['APPROVED', 'CANCELLED'],
      APPROVED: ['ORDERED', 'CANCELLED'],
      ORDERED: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['RECEIVED'],
      RECEIVED: [],
      CANCELLED: []
    };

    if (!validTransitions[order.status].includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from ${order.status} to ${status}`
      });
    }

    const updateOrder = db.transaction(() => {
      const updates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
      const params = [status];

      if (status === 'ORDERED') {
        updates.push('order_date = CURRENT_TIMESTAMP');
      }
      if (status === 'SHIPPED' && trackingNumber) {
        updates.push('tracking_number = ?');
        params.push(trackingNumber);
      }
      if (status === 'RECEIVED') {
        updates.push('received_date = CURRENT_TIMESTAMP');

        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
        for (const item of items) {
          const inventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(item.part_id);
          if (inventory) {
            const previousQty = inventory.quantity_on_hand;
            const newQty = previousQty + item.quantity;

            db.prepare('UPDATE inventory SET quantity_on_hand = ?, last_order_date = CURRENT_TIMESTAMP WHERE part_id = ?')
              .run(newQty, item.part_id);

            db.prepare(`
              INSERT INTO inventory_logs (part_id, change_type, quantity_change, previous_qty, new_qty, order_id, reason)
              VALUES (?, 'RECEIVE', ?, ?, ?, ?, ?)
            `).run(item.part_id, item.quantity, previousQty, newQty, orderId, `Received from order ${order.order_number}`);

            db.prepare('UPDATE order_items SET quantity_received = ? WHERE id = ?').run(item.quantity, item.id);
          }
        }
      }

      params.push(orderId);
      db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    });

    updateOrder();

    const updated = db.prepare(`
      SELECT o.*, v.name as vendor_name FROM orders o
      JOIN vendors v ON v.id = o.vendor_id WHERE o.id = ?
    `).get(orderId);
    const updatedItems = db.prepare(`
      SELECT oi.*, p.part_number, p.name as part_name FROM order_items oi
      JOIN parts p ON p.id = oi.part_id WHERE oi.order_id = ?
    `).all(orderId);

    res.json({
      ...toCamelCase(updated),
      vendor: { id: updated.vendor_id, name: updated.vendor_name },
      items: rowsToCamelCase(updatedItems)
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/orders/:id - Delete order (only drafts)
router.delete('/:id', async (req, res, next) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(parseInt(req.params.id));

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Can only delete draft orders' });
    }

    db.prepare('DELETE FROM orders WHERE id = ?').run(parseInt(req.params.id));
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
