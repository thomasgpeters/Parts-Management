const cron = require('node-cron');
const { db, toCamelCase } = require('../db');

// Check inventory levels and create reorder alerts
function checkAndCreateReorderAlerts() {
  console.log('Running auto-reorder check...');

  const inventory = db.prepare(`
    SELECT i.*, p.part_number, p.name as part_name, p.vendor_id, p.is_active,
      v.name as vendor_name
    FROM inventory i
    JOIN parts p ON p.id = i.part_id
    LEFT JOIN vendors v ON v.id = p.vendor_id
  `).all();

  const newAlerts = [];

  for (const item of inventory) {
    if (!item.is_active) continue;

    if (item.quantity_on_hand <= item.reorder_point) {
      const existingAlert = db.prepare(`
        SELECT * FROM reorder_alerts WHERE part_id = ? AND status = 'PENDING'
      `).get(item.part_id);

      if (!existingAlert) {
        const result = db.prepare(`
          INSERT INTO reorder_alerts (part_id, part_number, part_name, current_qty, reorder_point, reorder_qty, vendor_id, vendor_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.part_id, item.part_number, item.part_name,
          item.quantity_on_hand, item.reorder_point, item.reorder_quantity,
          item.vendor_id, item.vendor_name
        );

        const alert = db.prepare('SELECT * FROM reorder_alerts WHERE id = ?').get(result.lastInsertRowid);
        newAlerts.push(toCamelCase(alert));
        console.log(`Created reorder alert for ${item.part_number}`);
      }
    }
  }

  console.log(`Auto-reorder check complete. Created ${newAlerts.length} new alerts.`);
  return newAlerts;
}

// Process a single reorder alert - create an order
function processReorderAlert(alertId) {
  const alert = db.prepare('SELECT * FROM reorder_alerts WHERE id = ?').get(alertId);

  if (!alert) {
    return { success: false, error: 'Alert not found' };
  }

  if (alert.status !== 'PENDING') {
    return { success: false, error: 'Alert is not pending' };
  }

  if (!alert.vendor_id) {
    return { success: false, error: 'No vendor assigned to this part' };
  }

  const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(alert.part_id);
  if (!part) {
    return { success: false, error: 'Part not found' };
  }

  // Generate order number
  const date = new Date();
  const prefix = `PO${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const lastOrder = db.prepare(`
    SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1
  `).get(`${prefix}%`);

  let sequence = 1;
  if (lastOrder) {
    sequence = parseInt(lastOrder.order_number.slice(-4)) + 1;
  }
  const orderNumber = `${prefix}${String(sequence).padStart(4, '0')}`;
  const totalPrice = alert.reorder_qty * part.unit_price;

  const createOrder = db.transaction(() => {
    const orderResult = db.prepare(`
      INSERT INTO orders (order_number, vendor_id, status, is_auto_generated, subtotal, total, notes)
      VALUES (?, ?, 'PENDING', 1, ?, ?, ?)
    `).run(orderNumber, alert.vendor_id, totalPrice, totalPrice, `Auto-generated from reorder alert #${alertId}`);

    const orderId = orderResult.lastInsertRowid;

    db.prepare(`
      INSERT INTO order_items (order_id, part_id, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?)
    `).run(orderId, alert.part_id, alert.reorder_qty, part.unit_price, totalPrice);

    db.prepare(`
      UPDATE reorder_alerts SET status = 'ORDERED', order_id = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(orderId, alertId);

    return orderId;
  });

  const orderId = createOrder();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

  console.log(`Processed reorder alert #${alertId}, created order ${orderNumber}`);

  return { success: true, order: toCamelCase(order) };
}

// Initialize the auto-reorder scheduler
function initializeAutoReorder() {
  const cronSchedule = process.env.AUTO_REORDER_CRON || '0 */6 * * *';

  cron.schedule(cronSchedule, () => {
    try {
      checkAndCreateReorderAlerts();
    } catch (error) {
      console.error('Auto-reorder check failed:', error);
    }
  });

  console.log(`Auto-reorder scheduler started with schedule: ${cronSchedule}`);

  // Run initial check on startup
  setTimeout(() => {
    try {
      checkAndCreateReorderAlerts();
    } catch (error) {
      console.error('Initial auto-reorder check failed:', error);
    }
  }, 5000);
}

module.exports = {
  checkAndCreateReorderAlerts,
  processReorderAlert,
  initializeAutoReorder
};
