const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const prisma = require('../db');

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
      sortBy = 'partNumber',
      order = 'asc',
      page = 1,
      limit = 50
    } = req.query;

    const where = {};

    if (search) {
      where.OR = [
        { partNumber: { contains: search } },
        { name: { contains: search } },
        { description: { contains: search } },
        { manufacturer: { contains: search } },
        { manufacturerPN: { contains: search } },
      ];
    }
    if (categoryId) where.categoryId = parseInt(categoryId);
    if (vendorId) where.vendorId = parseInt(vendorId);
    if (isActive !== undefined) where.isActive = isActive === 'true';

    let parts = await prisma.part.findMany({
      where,
      include: {
        category: true,
        vendor: true,
        inventory: true
      },
      orderBy: { [sortBy]: order },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    // Filter for low stock if requested
    if (lowStock === 'true') {
      parts = parts.filter(p =>
        p.inventory && p.inventory.quantityOnHand <= p.inventory.reorderPoint
      );
    }

    const total = await prisma.part.count({ where });

    res.json({
      data: parts,
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
    const part = await prisma.part.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        category: true,
        vendor: true,
        inventory: true,
        orderItems: {
          include: {
            order: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        inventoryLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });

    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    res.json(part);
  } catch (error) {
    next(error);
  }
});

// GET /api/parts/by-number/:partNumber - Get part by part number
router.get('/by-number/:partNumber', async (req, res, next) => {
  try {
    const part = await prisma.part.findUnique({
      where: { partNumber: req.params.partNumber },
      include: {
        category: true,
        vendor: true,
        inventory: true
      }
    });

    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    res.json(part);
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

    const part = await prisma.part.create({
      data: {
        ...partData,
        inventory: {
          create: inventoryData || {
            quantityOnHand: 0,
            reorderPoint: 10,
            reorderQuantity: 50
          }
        }
      },
      include: {
        category: true,
        vendor: true,
        inventory: true
      }
    });

    res.status(201).json(part);
  } catch (error) {
    if (error.code === 'P2002') {
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

    const { inventory: inventoryData, ...partData } = req.body;

    const part = await prisma.part.update({
      where: { id: parseInt(req.params.id) },
      data: partData,
      include: {
        category: true,
        vendor: true,
        inventory: true
      }
    });

    // Update inventory if provided
    if (inventoryData && part.inventory) {
      await prisma.inventory.update({
        where: { id: part.inventory.id },
        data: inventoryData
      });
    }

    res.json(part);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Part not found' });
    }
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Part number already exists' });
    }
    next(error);
  }
});

// DELETE /api/parts/:id - Delete part
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.part.delete({
      where: { id: parseInt(req.params.id) }
    });

    res.json({ message: 'Part deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Part not found' });
    }
    next(error);
  }
});

// PATCH /api/parts/:id/toggle-active - Toggle part active status
router.patch('/:id/toggle-active', async (req, res, next) => {
  try {
    const part = await prisma.part.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const updated = await prisma.part.update({
      where: { id: parseInt(req.params.id) },
      data: { isActive: !part.isActive },
      include: {
        category: true,
        vendor: true,
        inventory: true
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
