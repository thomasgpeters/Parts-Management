const express = require('express');
const router = express.Router();
const prisma = require('../db');

// GET /api/dashboard - Get dashboard summary
router.get('/', async (req, res, next) => {
  try {
    // Get counts
    const [
      totalParts,
      activeParts,
      totalVendors,
      activeVendors,
      totalOrders,
      pendingOrders
    ] = await Promise.all([
      prisma.part.count(),
      prisma.part.count({ where: { isActive: true } }),
      prisma.vendor.count(),
      prisma.vendor.count({ where: { isActive: true } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: { in: ['PENDING', 'APPROVED', 'ORDERED', 'SHIPPED'] } } })
    ]);

    // Get inventory stats
    const inventory = await prisma.inventory.findMany({
      include: { part: true }
    });

    const inventoryStats = {
      totalItems: inventory.length,
      totalValue: inventory.reduce((sum, i) =>
        sum + (i.quantityOnHand * (i.part?.unitPrice || 0)), 0
      ),
      lowStockCount: inventory.filter(i => i.quantityOnHand <= i.reorderPoint && i.quantityOnHand > 0).length,
      outOfStockCount: inventory.filter(i => i.quantityOnHand === 0).length,
      healthyStockCount: inventory.filter(i => i.quantityOnHand > i.reorderPoint).length
    };

    // Get recent orders
    const recentOrders = await prisma.order.findMany({
      include: {
        vendor: true,
        _count: { select: { items: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // Get low stock items
    const lowStockItems = inventory
      .filter(i => i.quantityOnHand <= i.reorderPoint)
      .sort((a, b) => (a.quantityOnHand - a.reorderPoint) - (b.quantityOnHand - b.reorderPoint))
      .slice(0, 10)
      .map(i => ({
        id: i.id,
        partId: i.partId,
        partNumber: i.part?.partNumber,
        partName: i.part?.name,
        quantityOnHand: i.quantityOnHand,
        reorderPoint: i.reorderPoint,
        reorderQuantity: i.reorderQuantity,
        shortfall: i.reorderPoint - i.quantityOnHand
      }));

    // Get pending reorder alerts
    const pendingAlerts = await prisma.reorderAlert.count({
      where: { status: 'PENDING' }
    });

    // Get order totals by status
    const ordersByStatus = await prisma.order.groupBy({
      by: ['status'],
      _count: { id: true },
      _sum: { total: true }
    });

    // Get top vendors by order count
    const topVendors = await prisma.vendor.findMany({
      include: {
        _count: { select: { orders: true, parts: true } }
      },
      orderBy: {
        orders: { _count: 'desc' }
      },
      take: 5
    });

    // Get recent inventory activity
    const recentActivity = await prisma.inventoryLog.findMany({
      include: {
        part: true,
        order: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    res.json({
      parts: {
        total: totalParts,
        active: activeParts,
        inactive: totalParts - activeParts
      },
      vendors: {
        total: totalVendors,
        active: activeVendors,
        inactive: totalVendors - activeVendors
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        byStatus: ordersByStatus.reduce((acc, s) => {
          acc[s.status] = { count: s._count.id, value: s._sum.total || 0 };
          return acc;
        }, {})
      },
      inventory: {
        ...inventoryStats,
        totalValue: Math.round(inventoryStats.totalValue * 100) / 100
      },
      alerts: {
        pendingReorders: pendingAlerts,
        lowStockCount: inventoryStats.lowStockCount,
        outOfStockCount: inventoryStats.outOfStockCount
      },
      recentOrders,
      lowStockItems,
      topVendors: topVendors.map(v => ({
        id: v.id,
        name: v.name,
        code: v.code,
        orderCount: v._count.orders,
        partsCount: v._count.parts
      })),
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        partNumber: a.part?.partNumber,
        partName: a.part?.name,
        changeType: a.changeType,
        quantityChange: a.quantityChange,
        previousQty: a.previousQty,
        newQty: a.newQty,
        reason: a.reason,
        createdAt: a.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/inventory-value - Get inventory value by category
router.get('/inventory-value', async (req, res, next) => {
  try {
    const parts = await prisma.part.findMany({
      include: {
        inventory: true,
        category: true
      }
    });

    const byCategory = {};
    let totalValue = 0;

    parts.forEach(part => {
      const value = (part.inventory?.quantityOnHand || 0) * part.unitPrice;
      totalValue += value;

      const categoryName = part.category?.name || 'Uncategorized';
      if (!byCategory[categoryName]) {
        byCategory[categoryName] = { value: 0, count: 0 };
      }
      byCategory[categoryName].value += value;
      byCategory[categoryName].count++;
    });

    res.json({
      totalValue: Math.round(totalValue * 100) / 100,
      byCategory: Object.entries(byCategory).map(([name, data]) => ({
        category: name,
        value: Math.round(data.value * 100) / 100,
        itemCount: data.count,
        percentage: Math.round((data.value / totalValue) * 10000) / 100
      })).sort((a, b) => b.value - a.value)
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/order-trends - Get order trends
router.get('/order-trends', async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: startDate }
      },
      select: {
        createdAt: true,
        total: true,
        status: true
      }
    });

    // Group by date
    const byDate = {};
    orders.forEach(order => {
      const date = order.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) {
        byDate[date] = { count: 0, value: 0 };
      }
      byDate[date].count++;
      byDate[date].value += order.total;
    });

    res.json({
      period: `Last ${days} days`,
      data: Object.entries(byDate).map(([date, data]) => ({
        date,
        orderCount: data.count,
        orderValue: Math.round(data.value * 100) / 100
      })).sort((a, b) => a.date.localeCompare(b.date))
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
