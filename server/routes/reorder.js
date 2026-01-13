const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { checkAndCreateReorderAlerts, processReorderAlert } = require('../services/autoReorder');

// GET /api/reorder/alerts - Get all reorder alerts
router.get('/alerts', async (req, res, next) => {
  try {
    const { status, limit = 50 } = req.query;

    const where = {};
    if (status) where.status = status;

    const alerts = await prisma.reorderAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json(alerts);
  } catch (error) {
    next(error);
  }
});

// GET /api/reorder/alerts/pending - Get pending alerts count
router.get('/alerts/pending', async (req, res, next) => {
  try {
    const count = await prisma.reorderAlert.count({
      where: { status: 'PENDING' }
    });

    const alerts = await prisma.reorderAlert.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ count, alerts });
  } catch (error) {
    next(error);
  }
});

// POST /api/reorder/check - Manually trigger reorder check
router.post('/check', async (req, res, next) => {
  try {
    const alerts = await checkAndCreateReorderAlerts();
    res.json({
      message: `Created ${alerts.length} new reorder alerts`,
      alerts
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/reorder/alerts/:id/process - Process a reorder alert (create order)
router.post('/alerts/:id/process', async (req, res, next) => {
  try {
    const alertId = parseInt(req.params.id);
    const result = await processReorderAlert(alertId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/reorder/alerts/:id/dismiss - Dismiss a reorder alert
router.post('/alerts/:id/dismiss', async (req, res, next) => {
  try {
    const alert = await prisma.reorderAlert.update({
      where: { id: parseInt(req.params.id) },
      data: {
        status: 'DISMISSED',
        processedAt: new Date()
      }
    });

    res.json(alert);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Alert not found' });
    }
    next(error);
  }
});

// POST /api/reorder/process-all - Process all pending alerts
router.post('/process-all', async (req, res, next) => {
  try {
    const pendingAlerts = await prisma.reorderAlert.findMany({
      where: { status: 'PENDING' }
    });

    const results = [];
    for (const alert of pendingAlerts) {
      const result = await processReorderAlert(alert.id);
      results.push({
        alertId: alert.id,
        partNumber: alert.partNumber,
        ...result
      });
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

// GET /api/reorder/suggestions - Get reorder suggestions (items below reorder point)
router.get('/suggestions', async (req, res, next) => {
  try {
    const inventory = await prisma.inventory.findMany({
      include: {
        part: {
          include: {
            vendor: true
          }
        }
      }
    });

    const suggestions = inventory
      .filter(i => i.quantityOnHand <= i.reorderPoint && i.part?.isActive)
      .map(i => ({
        partId: i.partId,
        partNumber: i.part?.partNumber,
        partName: i.part?.name,
        vendorId: i.part?.vendorId,
        vendorName: i.part?.vendor?.name,
        currentQuantity: i.quantityOnHand,
        reorderPoint: i.reorderPoint,
        reorderQuantity: i.reorderQuantity,
        shortfall: i.reorderPoint - i.quantityOnHand,
        estimatedCost: i.reorderQuantity * (i.part?.unitPrice || 0),
        leadTimeDays: i.part?.vendor?.leadTimeDays || 7
      }))
      .sort((a, b) => b.shortfall - a.shortfall);

    // Group by vendor for bulk ordering
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
    const { vendorIds } = req.body; // Optional: specific vendors to create orders for

    const inventory = await prisma.inventory.findMany({
      include: {
        part: {
          include: { vendor: true }
        }
      }
    });

    const lowStockByVendor = {};
    inventory
      .filter(i => i.quantityOnHand <= i.reorderPoint && i.part?.isActive && i.part?.vendorId)
      .forEach(i => {
        const vendorId = i.part.vendorId;
        if (vendorIds && !vendorIds.includes(vendorId)) return;

        if (!lowStockByVendor[vendorId]) {
          lowStockByVendor[vendorId] = {
            vendor: i.part.vendor,
            items: []
          };
        }
        lowStockByVendor[vendorId].items.push({
          partId: i.partId,
          quantity: i.reorderQuantity,
          unitPrice: i.part.unitPrice
        });
      });

    const createdOrders = [];
    for (const vendorId of Object.keys(lowStockByVendor)) {
      const { vendor, items } = lowStockByVendor[vendorId];

      // Generate order number
      const date = new Date();
      const prefix = `PO${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
      const lastOrder = await prisma.order.findFirst({
        where: { orderNumber: { startsWith: prefix } },
        orderBy: { orderNumber: 'desc' }
      });
      let sequence = 1;
      if (lastOrder) {
        sequence = parseInt(lastOrder.orderNumber.slice(-4)) + 1;
      }
      const orderNumber = `${prefix}${String(sequence).padStart(4, '0')}`;

      const orderItems = items.map(item => ({
        partId: item.partId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice
      }));

      const subtotal = orderItems.reduce((sum, i) => sum + i.totalPrice, 0);

      const order = await prisma.order.create({
        data: {
          orderNumber,
          vendorId: parseInt(vendorId),
          status: 'PENDING',
          isAutoGenerated: true,
          subtotal,
          total: subtotal,
          items: {
            create: orderItems
          }
        },
        include: {
          vendor: true,
          items: { include: { part: true } }
        }
      });

      createdOrders.push(order);
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
