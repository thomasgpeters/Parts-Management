const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, toCamelCase, rowsToCamelCase } = require('../db');

// Validation middleware
const categoryValidation = [
  body('name').notEmpty().withMessage('Category name is required'),
];

// GET /api/categories - List all categories
router.get('/', async (req, res, next) => {
  try {
    const categories = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM parts WHERE category_id = c.id) as parts_count,
        p.name as parent_name
      FROM categories c
      LEFT JOIN categories p ON p.id = c.parent_id
      ORDER BY c.name ASC
    `).all();

    res.json(rowsToCamelCase(categories));
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/tree - Get categories as hierarchical tree
router.get('/tree', async (req, res, next) => {
  try {
    const rootCategories = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM parts WHERE category_id = c.id) as parts_count
      FROM categories c
      WHERE c.parent_id IS NULL
      ORDER BY c.name ASC
    `).all();

    const result = rootCategories.map(cat => {
      const children = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM parts WHERE category_id = c.id) as parts_count
        FROM categories c
        WHERE c.parent_id = ?
        ORDER BY c.name ASC
      `).all(cat.id);

      return {
        ...toCamelCase(cat),
        children: rowsToCamelCase(children)
      };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/:id - Get category by ID
router.get('/:id', async (req, res, next) => {
  try {
    const category = db.prepare(`
      SELECT c.*, p.name as parent_name
      FROM categories c
      LEFT JOIN categories p ON p.id = c.parent_id
      WHERE c.id = ?
    `).get(parseInt(req.params.id));

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const children = db.prepare(`
      SELECT * FROM categories WHERE parent_id = ? ORDER BY name ASC
    `).all(category.id);

    const parts = db.prepare(`
      SELECT p.*, i.quantity_on_hand, i.reorder_point, v.name as vendor_name
      FROM parts p
      LEFT JOIN inventory i ON i.part_id = p.id
      LEFT JOIN vendors v ON v.id = p.vendor_id
      WHERE p.category_id = ?
    `).all(category.id);

    const result = toCamelCase(category);
    result.children = rowsToCamelCase(children);
    result.parts = rowsToCamelCase(parts);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/categories - Create new category
router.post('/', categoryValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, parentId } = req.body;

    const result = db.prepare(`
      INSERT INTO categories (name, description, parent_id)
      VALUES (?, ?, ?)
    `).run(name, description || null, parentId || null);

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(toCamelCase(category));
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    next(error);
  }
});

// PUT /api/categories/:id - Update category
router.put('/:id', categoryValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const { name, description, parentId } = req.body;

    db.prepare(`
      UPDATE categories SET name = ?, description = ?, parent_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, description || null, parentId || null, id);

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    res.json(toCamelCase(category));
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    next(error);
  }
});

// DELETE /api/categories/:id - Delete category
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    // Check if category has parts
    const partsCount = db.prepare('SELECT COUNT(*) as count FROM parts WHERE category_id = ?').get(id);
    if (partsCount.count > 0) {
      return res.status(400).json({
        error: 'Cannot delete category with associated parts. Reassign parts first.'
      });
    }

    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
