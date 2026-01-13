const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const prisma = require('../db');

// GET /api/inventory - List all inventory with part details
router.get('/', async (req, res, next) => {
  try {
    const { lowStock, location, sortBy = 'partId', order = 'asc' } = req.query;

    let inventory = await prisma.inventory.findMany({
      include: {
        part: {
          include: {
            vendor: true,
            category: true
          }
        }
      },
      orderBy: { [sortBy]: order }
    });

    // Filter for low stock
    if (lowStock === 'true') {
      inventory = inventory.filter(i => i.quantityOnHand <= i.reorderPoint);
    }

    // Filter by location
    if (location) {
      inventory = inventory.filter(i =>
        i.location && i.location.toLowerCase().includes(location.toLowerCase())
      );
    }

    res.json(inventory);
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/low-stock - Get items below reorder point
router.get('/low-stock', async (req, res, next) => {
  try {
    const inventory = await prisma.inventory.findMany({
      include: {
        part: {
          include: {
            vendor: true,
            category: true
          }
        }
      }
    });

    const lowStock = inventory.filter(i =>
      i.quantityOnHand <= i.reorderPoint
    ).map(i => ({
      ...i,
      shortfall: i.reorderPoint - i.quantityOnHand,
      available: i.quantityOnHand - i.quantityReserved
    }));

    res.json(lowStock);
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/summary - Get inventory summary stats
router.get('/summary', async (req, res, next) => {
  try {
    const inventory = await prisma.inventory.findMany({
      include: {
        part: true
      }
    });

    const totalItems = inventory.length;
    const totalValue = inventory.reduce((sum, i) =>
      sum + (i.quantityOnHand * (i.part?.unitPrice || 0)), 0
    );
    const lowStockCount = inventory.filter(i =>
      i.quantityOnHand <= i.reorderPoint
    ).length;
    const outOfStockCount = inventory.filter(i =>
      i.quantityOnHand === 0
    ).length;

    res.json({
      totalItems,
      totalValue: Math.round(totalValue * 100) / 100,
      lowStockCount,
      outOfStockCount,
      healthyStockCount: totalItems - lowStockCount
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/:partId - Get inventory for specific part
router.get('/:partId', async (req, res, next) => {
  try {
    const inventory = await prisma.inventory.findUnique({
      where: { partId: parseInt(req.params.partId) },
      include: {
        part: {
          include: {
            vendor: true,
            category: true
          }
        }
      }
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    res.json(inventory);
  } catch (error) {
    next(error);
  }
});

// PUT /api/inventory/:partId - Update inventory settings
router.put('/:partId', async (req, res, next) => {
  try {
    const { reorderPoint, reorderQuantity, maxQuantity, location } = req.body;

    const inventory = await prisma.inventory.update({
      where: { partId: parseInt(req.params.partId) },
      data: {
        reorderPoint,
        reorderQuantity,
        maxQuantity,
        location
      },
      include: {
        part: true
      }
    });

    res.json(inventory);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Inventory record not found' });
    }
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

    const inventory = await prisma.inventory.findUnique({
      where: { partId }
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    const previousQty = inventory.quantityOnHand;
    const newQty = previousQty + quantity;

    if (newQty < 0) {
      return res.status(400).json({ error: 'Cannot adjust below zero' });
    }

    // Update inventory and create log in transaction
    const result = await prisma.$transaction([
      prisma.inventory.update({
        where: { partId },
        data: { quantityOnHand: newQty }
      }),
      prisma.inventoryLog.create({
        data: {
          partId,
          changeType: 'ADJUST',
          quantityChange: quantity,
          previousQty,
          newQty,
          reason,
          performedBy
        }
      })
    ]);

    res.json({
      inventory: result[0],
      log: result[1]
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/inventory/:partId/receive - Receive inventory (from order or manual)
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

    const inventory = await prisma.inventory.findUnique({
      where: { partId }
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    const previousQty = inventory.quantityOnHand;
    const newQty = previousQty + quantity;

    const result = await prisma.$transaction([
      prisma.inventory.update({
        where: { partId },
        data: {
          quantityOnHand: newQty,
          lastOrderDate: new Date()
        }
      }),
      prisma.inventoryLog.create({
        data: {
          partId,
          changeType: 'RECEIVE',
          quantityChange: quantity,
          previousQty,
          newQty,
          orderId: orderId ? parseInt(orderId) : null,
          reason: orderId ? `Received from order #${orderId}` : 'Manual receipt',
          performedBy
        }
      })
    ]);

    res.json({
      inventory: result[0],
      log: result[1]
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

    const inventory = await prisma.inventory.findUnique({
      where: { partId }
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    const previousQty = inventory.quantityOnHand;
    const newQty = previousQty - quantity;

    if (newQty < 0) {
      return res.status(400).json({ error: 'Insufficient inventory' });
    }

    const result = await prisma.$transaction([
      prisma.inventory.update({
        where: { partId },
        data: { quantityOnHand: newQty }
      }),
      prisma.inventoryLog.create({
        data: {
          partId,
          changeType: 'SHIP',
          quantityChange: -quantity,
          previousQty,
          newQty,
          reason: reason || 'Shipped/consumed',
          performedBy
        }
      })
    ]);

    res.json({
      inventory: result[0],
      log: result[1]
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/:partId/logs - Get inventory logs for a part
router.get('/:partId/logs', async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const logs = await prisma.inventoryLog.findMany({
      where: { partId: parseInt(req.params.partId) },
      include: {
        order: true
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    res.json(logs);
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

    const inventory = await prisma.inventory.findUnique({
      where: { partId }
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory record not found' });
    }

    const previousQty = inventory.quantityOnHand;
    const variance = actualQuantity - previousQty;

    const result = await prisma.$transaction([
      prisma.inventory.update({
        where: { partId },
        data: {
          quantityOnHand: actualQuantity,
          lastCountDate: new Date()
        }
      }),
      prisma.inventoryLog.create({
        data: {
          partId,
          changeType: 'ADJUST',
          quantityChange: variance,
          previousQty,
          newQty: actualQuantity,
          reason: `Physical count adjustment (variance: ${variance})`,
          performedBy
        }
      })
    ]);

    res.json({
      inventory: result[0],
      log: result[1],
      variance
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
