const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const prisma = require('../db');

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

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { email: { contains: search } },
      ];
    }
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const vendors = await prisma.vendor.findMany({
      where,
      orderBy: { [sortBy]: order },
      include: {
        _count: {
          select: { parts: true, orders: true }
        }
      }
    });

    res.json(vendors);
  } catch (error) {
    next(error);
  }
});

// GET /api/vendors/:id - Get vendor by ID
router.get('/:id', async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        parts: {
          include: {
            inventory: true
          }
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        _count: {
          select: { parts: true, orders: true }
        }
      }
    });

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.json(vendor);
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

    const vendor = await prisma.vendor.create({
      data: req.body
    });

    res.status(201).json(vendor);
  } catch (error) {
    if (error.code === 'P2002') {
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

    const vendor = await prisma.vendor.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });

    res.json(vendor);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Vendor code already exists' });
    }
    next(error);
  }
});

// DELETE /api/vendors/:id - Delete vendor
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.vendor.delete({
      where: { id: parseInt(req.params.id) }
    });

    res.json({ message: 'Vendor deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    next(error);
  }
});

// PATCH /api/vendors/:id/toggle-active - Toggle vendor active status
router.patch('/:id/toggle-active', async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const updated = await prisma.vendor.update({
      where: { id: parseInt(req.params.id) },
      data: { isActive: !vendor.isActive }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
