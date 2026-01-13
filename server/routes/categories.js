const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const prisma = require('../db');

// Validation middleware
const categoryValidation = [
  body('name').notEmpty().withMessage('Category name is required'),
];

// GET /api/categories - List all categories
router.get('/', async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        parent: true,
        children: true,
        _count: {
          select: { parts: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(categories);
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/tree - Get categories as hierarchical tree
router.get('/tree', async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          include: {
            children: true,
            _count: { select: { parts: true } }
          }
        },
        _count: { select: { parts: true } }
      },
      orderBy: { name: 'asc' }
    });

    res.json(categories);
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/:id - Get category by ID
router.get('/:id', async (req, res, next) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        parent: true,
        children: true,
        parts: {
          include: {
            inventory: true,
            vendor: true
          }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(category);
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

    const category = await prisma.category.create({
      data: req.body
    });

    res.status(201).json(category);
  } catch (error) {
    if (error.code === 'P2002') {
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

    const category = await prisma.category.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });

    res.json(category);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    next(error);
  }
});

// DELETE /api/categories/:id - Delete category
router.delete('/:id', async (req, res, next) => {
  try {
    // Check if category has parts
    const partsCount = await prisma.part.count({
      where: { categoryId: parseInt(req.params.id) }
    });

    if (partsCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete category with associated parts. Reassign parts first.'
      });
    }

    await prisma.category.delete({
      where: { id: parseInt(req.params.id) }
    });

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    next(error);
  }
});

module.exports = router;
