const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, toCamelCase, rowsToCamelCase } = require('../db');

// Validation middleware
const vendorValidation = [
  body('name').notEmpty().withMessage('Vendor name is required'),
  body('code').notEmpty().withMessage('Vendor code is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('rating').optional().isInt({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
  body('leadTimeDays').optional().isInt({ min: 0 }).withMessage('Lead time must be a positive number'),
];

// GET /api/vendors - List all vendors
router.get('/', async (req, res, next) => {
  try {
    const { search, isActive, sortBy = 'name', order = 'asc' } = req.query;

    let sql = `
      SELECT v.*,
        (SELECT COUNT(*) FROM parts WHERE vendor_id = v.id) as parts_count,
        (SELECT COUNT(*) FROM orders WHERE vendor_id = v.id) as orders_count
      FROM vendors v
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ` AND (v.name LIKE ? OR v.code LIKE ? OR v.email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (isActive !== undefined) {
      sql += ` AND v.is_active = ?`;
      params.push(isActive === 'true' ? 1 : 0);
    }

    const sortColumn = sortBy === 'name' ? 'v.name' : `v.${sortBy.replace(/([A-Z])/g, '_$1').toLowerCase()}`;
    sql += ` ORDER BY ${sortColumn} ${order.toUpperCase()}`;

    const vendors = db.prepare(sql).all(...params);
    res.json(rowsToCamelCase(vendors));
  } catch (error) {
    next(error);
  }
});

// GET /api/vendors/:id - Get vendor by ID
router.get('/:id', async (req, res, next) => {
  try {
    const vendor = db.prepare(`
      SELECT v.*,
        (SELECT COUNT(*) FROM parts WHERE vendor_id = v.id) as parts_count,
        (SELECT COUNT(*) FROM orders WHERE vendor_id = v.id) as orders_count
      FROM vendors v WHERE v.id = ?
    `).get(parseInt(req.params.id));

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const parts = db.prepare(`
      SELECT p.*, i.quantity_on_hand, i.reorder_point
      FROM parts p
      LEFT JOIN inventory i ON i.part_id = p.id
      WHERE p.vendor_id = ?
    `).all(vendor.id);

    const orders = db.prepare(`
      SELECT * FROM orders WHERE vendor_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(vendor.id);

    const result = toCamelCase(vendor);
    result.parts = rowsToCamelCase(parts);
    result.orders = rowsToCamelCase(orders);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/vendors - Create new vendor
router.post('/', vendorValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, code, contactName, email, phone, address, city, state, zipCode, country, website, notes, isActive, rating, leadTimeDays } = req.body;

    const stmt = db.prepare(`
      INSERT INTO vendors (name, code, contact_name, email, phone, address, city, state, zip_code, country, website, notes, is_active, rating, lead_time_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name, code, contactName || null, email || null, phone || null,
      address || null, city || null, state || null, zipCode || null,
      country || 'USA', website || null, notes || null,
      isActive !== false ? 1 : 0, rating || 0, leadTimeDays || 7
    );

    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(toCamelCase(vendor));
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Vendor code already exists' });
    }
    next(error);
  }
});

// PUT /api/vendors/:id - Update vendor
router.put('/:id', vendorValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const { name, code, contactName, email, phone, address, city, state, zipCode, country, website, notes, isActive, rating, leadTimeDays } = req.body;

    db.prepare(`
      UPDATE vendors SET
        name = ?, code = ?, contact_name = ?, email = ?, phone = ?,
        address = ?, city = ?, state = ?, zip_code = ?, country = ?,
        website = ?, notes = ?, is_active = ?, rating = ?, lead_time_days = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name, code, contactName || null, email || null, phone || null,
      address || null, city || null, state || null, zipCode || null,
      country || 'USA', website || null, notes || null,
      isActive !== false ? 1 : 0, rating || 0, leadTimeDays || 7, id
    );

    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id);
    res.json(toCamelCase(vendor));
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Vendor code already exists' });
    }
    next(error);
  }
});

// DELETE /api/vendors/:id - Delete vendor
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    db.prepare('DELETE FROM vendors WHERE id = ?').run(id);
    res.json({ message: 'Vendor deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/vendors/:id/toggle-active - Toggle vendor active status
router.patch('/:id/toggle-active', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id);

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    db.prepare('UPDATE vendors SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(vendor.is_active ? 0 : 1, id);

    const updated = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id);
    res.json(toCamelCase(updated));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
