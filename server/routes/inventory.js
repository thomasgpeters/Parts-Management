const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, toCamelCase, rowsToCamelCase } = require('../db');

// GET /api/inventory - List all inventory with part details
router.get('/', async (req, res, next) => {
  try {
    const { lowStock, location } = req.query;

    let sql = `
      SELECT i.*, p.part_number, p.name as part_name, p.unit_price,
        v.id as vendor_id, v.name as vendor_name,
        c.id as category_id, c.name as category_name
      FROM inventory i
      JOIN parts p ON p.id = i.part_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE 1=1
    `;
    const params = [];

    if (lowStock === 'true') {
      sql += ` AND i.quantity_on_hand <= i.reorder_point`;
    }
    if (location) {
      sql += ` AND i.location LIKE ?`;
      params.push(`%${location}%`);
    }

    sql += ` ORDER BY p.part_number ASC`;

    const inventory = db.prepare(sql).all(...params);

    const result = inventory.map(i => ({
      ...toCamelCase(i),
      part: {
        id: i.part_id,
        partNumber: i.part_number,
        name: i.part_name,
        unitPrice: i.unit_price,
        vendor: i.vendor_id ? { id: i.vendor_id, name: i.vendor_name } : null,
        category: i.category_id ? { id: i.category_id, name: i.category_name } : null
      }
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/low-stock - Get items below reorder point
router.get('/low-stock', async (req, res, next) => {
  try {
    const inventory = db.prepare(`
      SELECT i.*, p.part_number, p.name as part_name, p.unit_price,
        v.id as vendor_id, v.name as vendor_name
      FROM inventory i
      JOIN parts p ON p.id = i.part_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      WHERE i.quantity_on_hand <= i.reorder_point
      ORDER BY (i.quantity_on_hand - i.reorder_point) ASC
    `).all();

    const result = inventory.map(i => ({
      ...toCamelCase(i),
      shortfall: i.reorder_point - i.quantity_on_hand,
      available: i.quantity_on_hand - i.quantity_reserved,
      part: {
        id: i.part_id,
        partNumber: i.part_number,
        name: i.part_name,
        unitPrice: i.unit_price,
        vendor: i.vendor_id ? { id: i.vendor_id, name: i.vendor_name } : null
      }
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/summary - Get inventory summary stats
router.get('/summary', async (req, res, next) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_items,
        SUM(i.quantity_on_hand * p.unit_price) as total_value,
        SUM(CASE WHEN i.quantity_on_hand <= i.reorder_point THEN 1 ELSE 0 END) as low_stock_count,
        SUM(CASE WHEN i.quantity_on_hand = 0 THEN 1 ELSE 0 END) as out_of_stock_count
      FROM inventory i
      JOIN parts p ON p.id = i.part_id
    `).get();

    res.json({
      totalItems: stats.total_items || 0,
      totalValue: Math.round((stats.total_value || 0) * 100) / 100,
      lowStockCount: stats.low_stock_count || 0,
      outOfStockCount: stats.out_of_stock_count || 0,
      healthyStockCount: (stats.total_items || 0) - (stats.low_stock_count || 0)
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/:partId - Get inventory for specific part
router.get('/:partId', async (req, res, next) => {
  try {
    const inventory = db.prepare(`
      SELECT i.*, p.part_number, p.name as part_name, p.unit_price,
        v.id as vendor_id, v.name as vendor_name,
        c.id as category_id, c.name as category_name
      FROM inventory i
      JOIN parts p ON p.id = i.part_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE i.part_id = ?
    `).get(parseInt(req.params.partId));

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    const result = {
      ...toCamelCase(inventory),
      part: {
        id: inventory.part_id,
        partNumber: inventory.part_number,
        name: inventory.part_name,
        unitPrice: inventory.unit_price,
        vendor: inventory.vendor_id ? { id: inventory.vendor_id, name: inventory.vendor_name } : null,
        category: inventory.category_id ? { id: inventory.category_id, name: inventory.category_name } : null
      }
    };

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// PUT /api/inventory/:partId - Update inventory settings
router.put('/:partId', async (req, res, next) => {
  try {
    const { reorderPoint, reorderQuantity, maxQuantity, location } = req.body;
    const partId = parseInt(req.params.partId);

    const existing = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(partId);
    if (!existing) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    db.prepare(`
      UPDATE inventory SET
        reorder_point = ?, reorder_quantity = ?, max_quantity = ?, location = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE part_id = ?
    `).run(
      reorderPoint ?? existing.reorder_point,
      reorderQuantity ?? existing.reorder_quantity,
      maxQuantity ?? existing.max_quantity,
      location ?? existing.location,
      partId
    );

    const inventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(partId);
    res.json(toCamelCase(inventory));
  } catch (error) {
    next(error);
  }
});

// POST /api/inventory/:partId/adjust - Adjust inventory quantity
router.post('/:partId/adjust', [
  body('quantity').isInt().withMessage('Quantity must be an integer'),
  body('reason').notEmpty().withMessage('Reason is required'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { quantity, reason, performedBy } = req.body;
    const partId = parseInt(req.params.partId);

    const inventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(partId);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    const previousQty = inventory.quantity_on_hand;
    const newQty = previousQty + quantity;

    if (newQty < 0) {
      return res.status(400).json({ error: 'Cannot adjust below zero' });
    }

    const adjustInventory = db.transaction(() => {
      db.prepare('UPDATE inventory SET quantity_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE part_id = ?')
        .run(newQty, partId);

      const logResult = db.prepare(`
        INSERT INTO inventory_logs (part_id, change_type, quantity_change, previous_qty, new_qty, reason, performed_by)
        VALUES (?, 'ADJUST', ?, ?, ?, ?, ?)
      `).run(partId, quantity, previousQty, newQty, reason, performedBy || null);

      return logResult.lastInsertRowid;
    });

    const logId = adjustInventory();
    const updatedInventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(partId);
    const log = db.prepare('SELECT * FROM inventory_logs WHERE id = ?').get(logId);

    res.json({
      inventory: toCamelCase(updatedInventory),
      log: toCamelCase(log)
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/inventory/:partId/receive - Receive inventory
router.post('/:partId/receive', [
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { quantity, orderId, performedBy } = req.body;
    const partId = parseInt(req.params.partId);

    const inventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(partId);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    const previousQty = inventory.quantity_on_hand;
    const newQty = previousQty + quantity;

    const receiveInventory = db.transaction(() => {
      db.prepare(`
        UPDATE inventory SET quantity_on_hand = ?, last_order_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE part_id = ?
      `).run(newQty, partId);

      const logResult = db.prepare(`
        INSERT INTO inventory_logs (part_id, change_type, quantity_change, previous_qty, new_qty, order_id, reason, performed_by)
        VALUES (?, 'RECEIVE', ?, ?, ?, ?, ?, ?)
      `).run(partId, quantity, previousQty, newQty, orderId || null, orderId ? `Received from order #${orderId}` : 'Manual receipt', performedBy || null);

      return logResult.lastInsertRowid;
    });

    const logId = receiveInventory();
    const updatedInventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(partId);
    const log = db.prepare('SELECT * FROM inventory_logs WHERE id = ?').get(logId);

    res.json({
      inventory: toCamelCase(updatedInventory),
      log: toCamelCase(log)
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/inventory/:partId/ship - Ship/consume inventory
router.post('/:partId/ship', [
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { quantity, reason, performedBy } = req.body;
    const partId = parseInt(req.params.partId);

    const inventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(partId);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    const previousQty = inventory.quantity_on_hand;
    const newQty = previousQty - quantity;

    if (newQty < 0) {
      return res.status(400).json({ error: 'Insufficient inventory' });
    }

    const shipInventory = db.transaction(() => {
      db.prepare('UPDATE inventory SET quantity_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE part_id = ?')
        .run(newQty, partId);

      const logResult = db.prepare(`
        INSERT INTO inventory_logs (part_id, change_type, quantity_change, previous_qty, new_qty, reason, performed_by)
        VALUES (?, 'SHIP', ?, ?, ?, ?, ?)
      `).run(partId, -quantity, previousQty, newQty, reason || 'Shipped/consumed', performedBy || null);

      return logResult.lastInsertRowid;
    });

    const logId = shipInventory();
    const updatedInventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(partId);
    const log = db.prepare('SELECT * FROM inventory_logs WHERE id = ?').get(logId);

    res.json({
      inventory: toCamelCase(updatedInventory),
      log: toCamelCase(log)
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/:partId/logs - Get inventory logs for a part
router.get('/:partId/logs', async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const logs = db.prepare(`
      SELECT l.*, o.order_number
      FROM inventory_logs l
      LEFT JOIN orders o ON o.id = l.order_id
      WHERE l.part_id = ?
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `).all(parseInt(req.params.partId), parseInt(limit), parseInt(offset));

    res.json(rowsToCamelCase(logs));
  } catch (error) {
    next(error);
  }
});

// POST /api/inventory/:partId/count - Record physical count
router.post('/:partId/count', [
  body('actualQuantity').isInt({ min: 0 }).withMessage('Actual quantity must be a non-negative integer'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { actualQuantity, performedBy } = req.body;
    const partId = parseInt(req.params.partId);

    const inventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(partId);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    const previousQty = inventory.quantity_on_hand;
    const variance = actualQuantity - previousQty;

    const countInventory = db.transaction(() => {
      db.prepare(`
        UPDATE inventory SET quantity_on_hand = ?, last_count_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE part_id = ?
      `).run(actualQuantity, partId);

      const logResult = db.prepare(`
        INSERT INTO inventory_logs (part_id, change_type, quantity_change, previous_qty, new_qty, reason, performed_by)
        VALUES (?, 'ADJUST', ?, ?, ?, ?, ?)
      `).run(partId, variance, previousQty, actualQuantity, `Physical count adjustment (variance: ${variance})`, performedBy || null);

      return logResult.lastInsertRowid;
    });

    const logId = countInventory();
    const updatedInventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(partId);
    const log = db.prepare('SELECT * FROM inventory_logs WHERE id = ?').get(logId);

    res.json({
      inventory: toCamelCase(updatedInventory),
      log: toCamelCase(log),
      variance
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
