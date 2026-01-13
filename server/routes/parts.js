const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, toCamelCase, rowsToCamelCase } = require('../db');

// Validation middleware
const partValidation = [
  body('partNumber').notEmpty().withMessage('Part number is required'),
  body('name').notEmpty().withMessage('Part name is required'),
  body('unitPrice').optional().isFloat({ min: 0 }).withMessage('Unit price must be a positive number'),
];

// GET /api/parts - List all parts with filtering
router.get('/', async (req, res, next) => {
  try {
    const {
      search,
      categoryId,
      vendorId,
      isActive,
      lowStock,
      sortBy = 'part_number',
      order = 'asc',
      page = 1,
      limit = 50
    } = req.query;

    let sql = `
      SELECT p.*, c.name as category_name, v.name as vendor_name,
        i.quantity_on_hand, i.quantity_reserved, i.reorder_point, i.reorder_quantity, i.location
      FROM parts p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      LEFT JOIN inventory i ON i.part_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ` AND (p.part_number LIKE ? OR p.name LIKE ? OR p.description LIKE ? OR p.manufacturer LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (categoryId) {
      sql += ` AND p.category_id = ?`;
      params.push(parseInt(categoryId));
    }
    if (vendorId) {
      sql += ` AND p.vendor_id = ?`;
      params.push(parseInt(vendorId));
    }
    if (isActive !== undefined) {
      sql += ` AND p.is_active = ?`;
      params.push(isActive === 'true' ? 1 : 0);
    }
    if (lowStock === 'true') {
      sql += ` AND i.quantity_on_hand <= i.reorder_point`;
    }

    // Count total
    const countSql = sql.replace(/SELECT p\.\*.*FROM/, 'SELECT COUNT(*) as total FROM');
    const totalResult = db.prepare(countSql).get(...params);
    const total = totalResult?.total || 0;

    // Add sorting and pagination
    const sortColumn = sortBy.replace(/([A-Z])/g, '_$1').toLowerCase();
    sql += ` ORDER BY p.${sortColumn} ${order.toUpperCase()}`;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const parts = db.prepare(sql).all(...params);

    // Transform to include nested objects
    const transformed = parts.map(p => {
      const part = toCamelCase(p);
      part.category = p.category_name ? { id: p.category_id, name: p.category_name } : null;
      part.vendor = p.vendor_name ? { id: p.vendor_id, name: p.vendor_name } : null;
      part.inventory = {
        quantityOnHand: p.quantity_on_hand || 0,
        quantityReserved: p.quantity_reserved || 0,
        reorderPoint: p.reorder_point || 10,
        reorderQuantity: p.reorder_quantity || 50,
        location: p.location
      };
      return part;
    });

    res.json({
      data: transformed,
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

// GET /api/parts/:id - Get part by ID
router.get('/:id', async (req, res, next) => {
  try {
    const part = db.prepare(`
      SELECT p.*, c.name as category_name, v.name as vendor_name
      FROM parts p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      WHERE p.id = ?
    `).get(parseInt(req.params.id));

    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const inventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(part.id);
    const inventoryLogs = db.prepare(`
      SELECT * FROM inventory_logs WHERE part_id = ? ORDER BY created_at DESC LIMIT 20
    `).all(part.id);
    const orderItems = db.prepare(`
      SELECT oi.*, o.order_number, o.status as order_status
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.part_id = ?
      ORDER BY oi.created_at DESC LIMIT 10
    `).all(part.id);

    const result = toCamelCase(part);
    result.category = part.category_name ? { id: part.category_id, name: part.category_name } : null;
    result.vendor = part.vendor_name ? { id: part.vendor_id, name: part.vendor_name } : null;
    result.inventory = inventory ? toCamelCase(inventory) : null;
    result.inventoryLogs = rowsToCamelCase(inventoryLogs);
    result.orderItems = rowsToCamelCase(orderItems);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/parts/by-number/:partNumber - Get part by part number
router.get('/by-number/:partNumber', async (req, res, next) => {
  try {
    const part = db.prepare(`
      SELECT p.*, c.name as category_name, v.name as vendor_name
      FROM parts p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      WHERE p.part_number = ?
    `).get(req.params.partNumber);

    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const inventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(part.id);

    const result = toCamelCase(part);
    result.category = part.category_name ? { id: part.category_id, name: part.category_name } : null;
    result.vendor = part.vendor_name ? { id: part.vendor_id, name: part.vendor_name } : null;
    result.inventory = inventory ? toCamelCase(inventory) : null;

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/parts - Create new part with inventory
router.post('/', partValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { inventory: inventoryData, ...partData } = req.body;

    const insertPart = db.transaction(() => {
      const partResult = db.prepare(`
        INSERT INTO parts (part_number, name, description, category_id, vendor_id, unit_price, unit_of_measure, weight, dimensions, manufacturer, manufacturer_pn, barcode, specifications, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        partData.partNumber,
        partData.name,
        partData.description || null,
        partData.categoryId || null,
        partData.vendorId || null,
        partData.unitPrice || 0,
        partData.unitOfMeasure || 'EA',
        partData.weight || null,
        partData.dimensions || null,
        partData.manufacturer || null,
        partData.manufacturerPN || null,
        partData.barcode || null,
        partData.specifications || null,
        partData.isActive !== false ? 1 : 0
      );

      const inv = inventoryData || {};
      db.prepare(`
        INSERT INTO inventory (part_id, quantity_on_hand, reorder_point, reorder_quantity, location)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        partResult.lastInsertRowid,
        inv.quantityOnHand || 0,
        inv.reorderPoint || 10,
        inv.reorderQuantity || 50,
        inv.location || null
      );

      return partResult.lastInsertRowid;
    });

    const partId = insertPart();

    const part = db.prepare(`
      SELECT p.*, c.name as category_name, v.name as vendor_name
      FROM parts p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      WHERE p.id = ?
    `).get(partId);
    const inventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(partId);

    const result = toCamelCase(part);
    result.category = part.category_name ? { id: part.category_id, name: part.category_name } : null;
    result.vendor = part.vendor_name ? { id: part.vendor_id, name: part.vendor_name } : null;
    result.inventory = inventory ? toCamelCase(inventory) : null;

    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Part number already exists' });
    }
    next(error);
  }
});

// PUT /api/parts/:id - Update part
router.put('/:id', partValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM parts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const { inventory: inventoryData, ...partData } = req.body;

    db.prepare(`
      UPDATE parts SET
        part_number = ?, name = ?, description = ?, category_id = ?, vendor_id = ?,
        unit_price = ?, unit_of_measure = ?, weight = ?, dimensions = ?,
        manufacturer = ?, manufacturer_pn = ?, barcode = ?, specifications = ?,
        is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      partData.partNumber,
      partData.name,
      partData.description || null,
      partData.categoryId || null,
      partData.vendorId || null,
      partData.unitPrice || 0,
      partData.unitOfMeasure || 'EA',
      partData.weight || null,
      partData.dimensions || null,
      partData.manufacturer || null,
      partData.manufacturerPN || null,
      partData.barcode || null,
      partData.specifications || null,
      partData.isActive !== false ? 1 : 0,
      id
    );

    if (inventoryData) {
      db.prepare(`
        UPDATE inventory SET
          reorder_point = ?, reorder_quantity = ?, location = ?, updated_at = CURRENT_TIMESTAMP
        WHERE part_id = ?
      `).run(
        inventoryData.reorderPoint || 10,
        inventoryData.reorderQuantity || 50,
        inventoryData.location || null,
        id
      );
    }

    const part = db.prepare(`
      SELECT p.*, c.name as category_name, v.name as vendor_name
      FROM parts p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      WHERE p.id = ?
    `).get(id);
    const inventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(id);

    const result = toCamelCase(part);
    result.category = part.category_name ? { id: part.category_id, name: part.category_name } : null;
    result.vendor = part.vendor_name ? { id: part.vendor_id, name: part.vendor_name } : null;
    result.inventory = inventory ? toCamelCase(inventory) : null;

    res.json(result);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Part number already exists' });
    }
    next(error);
  }
});

// DELETE /api/parts/:id - Delete part
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM parts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Part not found' });
    }

    db.prepare('DELETE FROM parts WHERE id = ?').run(id);
    res.json({ message: 'Part deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/parts/:id/toggle-active - Toggle part active status
router.patch('/:id/toggle-active', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(id);

    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    db.prepare('UPDATE parts SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(part.is_active ? 0 : 1, id);

    const updated = db.prepare(`
      SELECT p.*, c.name as category_name, v.name as vendor_name
      FROM parts p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      WHERE p.id = ?
    `).get(id);
    const inventory = db.prepare('SELECT * FROM inventory WHERE part_id = ?').get(id);

    const result = toCamelCase(updated);
    result.category = updated.category_name ? { id: updated.category_id, name: updated.category_name } : null;
    result.vendor = updated.vendor_name ? { id: updated.vendor_id, name: updated.vendor_name } : null;
    result.inventory = inventory ? toCamelCase(inventory) : null;

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
