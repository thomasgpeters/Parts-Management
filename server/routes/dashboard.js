const express = require('express');
const router = express.Router();
const { db, toCamelCase, rowsToCamelCase } = require('../db');

// GET /api/dashboard - Get dashboard summary
router.get('/', async (req, res, next) => {
  try {
    // Get counts
    const totalParts = db.prepare('SELECT COUNT(*) as count FROM parts').get().count;
    const activeParts = db.prepare('SELECT COUNT(*) as count FROM parts WHERE is_active = 1').get().count;
    const totalVendors = db.prepare('SELECT COUNT(*) as count FROM vendors').get().count;
    const activeVendors = db.prepare('SELECT COUNT(*) as count FROM vendors WHERE is_active = 1').get().count;
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const pendingOrders = db.prepare(`
      SELECT COUNT(*) as count FROM orders WHERE status IN ('PENDING', 'APPROVED', 'ORDERED', 'SHIPPED')
    `).get().count;

    // Get inventory stats
    const inventoryStats = db.prepare(`
      SELECT
        COUNT(*) as total_items,
        SUM(i.quantity_on_hand * p.unit_price) as total_value,
        SUM(CASE WHEN i.quantity_on_hand <= i.reorder_point AND i.quantity_on_hand > 0 THEN 1 ELSE 0 END) as low_stock_count,
        SUM(CASE WHEN i.quantity_on_hand = 0 THEN 1 ELSE 0 END) as out_of_stock_count,
        SUM(CASE WHEN i.quantity_on_hand > i.reorder_point THEN 1 ELSE 0 END) as healthy_stock_count
      FROM inventory i
      JOIN parts p ON p.id = i.part_id
    `).get();

    // Get recent orders
    const recentOrders = db.prepare(`
      SELECT o.*, v.name as vendor_name,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
      FROM orders o
      LEFT JOIN vendors v ON v.id = o.vendor_id
      ORDER BY o.created_at DESC LIMIT 5
    `).all();

    // Get low stock items
    const lowStockItems = db.prepare(`
      SELECT i.*, p.part_number, p.name as part_name
      FROM inventory i
      JOIN parts p ON p.id = i.part_id
      WHERE i.quantity_on_hand <= i.reorder_point
      ORDER BY (i.quantity_on_hand - i.reorder_point) ASC
      LIMIT 10
    `).all().map(i => ({
      id: i.id,
      partId: i.part_id,
      partNumber: i.part_number,
      partName: i.part_name,
      quantityOnHand: i.quantity_on_hand,
      reorderPoint: i.reorder_point,
      reorderQuantity: i.reorder_quantity,
      shortfall: i.reorder_point - i.quantity_on_hand
    }));

    // Get pending reorder alerts
    const pendingAlerts = db.prepare("SELECT COUNT(*) as count FROM reorder_alerts WHERE status = 'PENDING'").get().count;

    // Get top vendors
    const topVendors = db.prepare(`
      SELECT v.*,
        (SELECT COUNT(*) FROM orders WHERE vendor_id = v.id) as order_count,
        (SELECT COUNT(*) FROM parts WHERE vendor_id = v.id) as parts_count
      FROM vendors v
      ORDER BY order_count DESC
      LIMIT 5
    `).all().map(v => ({
      id: v.id,
      name: v.name,
      code: v.code,
      orderCount: v.order_count,
      partsCount: v.parts_count
    }));

    // Get recent activity
    const recentActivity = db.prepare(`
      SELECT l.*, p.part_number, p.name as part_name
      FROM inventory_logs l
      JOIN parts p ON p.id = l.part_id
      ORDER BY l.created_at DESC
      LIMIT 10
    `).all().map(a => ({
      id: a.id,
      partNumber: a.part_number,
      partName: a.part_name,
      changeType: a.change_type,
      quantityChange: a.quantity_change,
      previousQty: a.previous_qty,
      newQty: a.new_qty,
      reason: a.reason,
      createdAt: a.created_at
    }));

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
        pending: pendingOrders
      },
      inventory: {
        totalItems: inventoryStats.total_items || 0,
        totalValue: Math.round((inventoryStats.total_value || 0) * 100) / 100,
        lowStockCount: inventoryStats.low_stock_count || 0,
        outOfStockCount: inventoryStats.out_of_stock_count || 0,
        healthyStockCount: inventoryStats.healthy_stock_count || 0
      },
      alerts: {
        pendingReorders: pendingAlerts,
        lowStockCount: inventoryStats.low_stock_count || 0,
        outOfStockCount: inventoryStats.out_of_stock_count || 0
      },
      recentOrders: recentOrders.map(o => ({
        ...toCamelCase(o),
        vendor: { id: o.vendor_id, name: o.vendor_name }
      })),
      lowStockItems,
      topVendors,
      recentActivity
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/inventory-value - Get inventory value by category
router.get('/inventory-value', async (req, res, next) => {
  try {
    const parts = db.prepare(`
      SELECT p.*, i.quantity_on_hand, c.name as category_name
      FROM parts p
      LEFT JOIN inventory i ON i.part_id = p.id
      LEFT JOIN categories c ON c.id = p.category_id
    `).all();

    const byCategory = {};
    let totalValue = 0;

    parts.forEach(part => {
      const value = (part.quantity_on_hand || 0) * part.unit_price;
      totalValue += value;

      const categoryName = part.category_name || 'Uncategorized';
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
        percentage: totalValue > 0 ? Math.round((data.value / totalValue) * 10000) / 100 : 0
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

    const orders = db.prepare(`
      SELECT created_at, total, status FROM orders WHERE created_at >= ?
    `).all(startDate.toISOString());

    const byDate = {};
    orders.forEach(order => {
      const date = order.created_at.split('T')[0];
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
