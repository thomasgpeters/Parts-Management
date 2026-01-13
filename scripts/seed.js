// Seed script for Parts Management System
const path = require('path');

// Set up environment
process.env.DATABASE_PATH = path.join(__dirname, '..', 'data', 'parts.db');

const { db } = require('../server/db');

console.log('Seeding database...');

// Clear existing data
db.exec(`
  DELETE FROM inventory_logs;
  DELETE FROM order_items;
  DELETE FROM orders;
  DELETE FROM reorder_alerts;
  DELETE FROM inventory;
  DELETE FROM parts;
  DELETE FROM categories;
  DELETE FROM vendors;
`);

// Seed vendors
const vendors = [
  { name: 'Acme Industrial Supply', code: 'ACME', contactName: 'John Smith', email: 'john@acme.com', phone: '555-0101', address: '123 Industrial Blvd', city: 'Detroit', state: 'MI', zipCode: '48201', rating: 5, leadTimeDays: 5 },
  { name: 'Global Parts Co', code: 'GPC', contactName: 'Sarah Johnson', email: 'sarah@globalparts.com', phone: '555-0102', address: '456 Commerce St', city: 'Chicago', state: 'IL', zipCode: '60601', rating: 4, leadTimeDays: 7 },
  { name: 'FastTrack Components', code: 'FTC', contactName: 'Mike Brown', email: 'mike@fasttrack.com', phone: '555-0103', address: '789 Express Way', city: 'Houston', state: 'TX', zipCode: '77001', rating: 4, leadTimeDays: 3 },
  { name: 'Quality Parts Inc', code: 'QPI', contactName: 'Lisa Davis', email: 'lisa@qualityparts.com', phone: '555-0104', address: '321 Quality Lane', city: 'Phoenix', state: 'AZ', zipCode: '85001', rating: 5, leadTimeDays: 10 },
  { name: 'Budget Parts Warehouse', code: 'BPW', contactName: 'Tom Wilson', email: 'tom@budgetparts.com', phone: '555-0105', address: '654 Discount Dr', city: 'Las Vegas', state: 'NV', zipCode: '89101', rating: 3, leadTimeDays: 14 },
];

const vendorIds = {};
for (const v of vendors) {
  const result = db.prepare(`
    INSERT INTO vendors (name, code, contact_name, email, phone, address, city, state, zip_code, rating, lead_time_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(v.name, v.code, v.contactName, v.email, v.phone, v.address, v.city, v.state, v.zipCode, v.rating, v.leadTimeDays);
  vendorIds[v.code] = result.lastInsertRowid;
}
console.log(`Created ${vendors.length} vendors`);

// Seed categories
const categories = [
  { name: 'Fasteners', description: 'Bolts, nuts, screws, and washers' },
  { name: 'Bearings', description: 'Ball bearings, roller bearings, and bushings' },
  { name: 'Electrical', description: 'Electrical components and wiring' },
  { name: 'Hydraulics', description: 'Hydraulic components and fittings' },
  { name: 'Pneumatics', description: 'Pneumatic components and fittings' },
  { name: 'Seals', description: 'O-rings, gaskets, and seals' },
  { name: 'Motors', description: 'Electric motors and drives' },
  { name: 'Sensors', description: 'Industrial sensors and switches' },
];

const categoryIds = {};
for (const c of categories) {
  const result = db.prepare(`
    INSERT INTO categories (name, description) VALUES (?, ?)
  `).run(c.name, c.description);
  categoryIds[c.name] = result.lastInsertRowid;
}
console.log(`Created ${categories.length} categories`);

// Seed parts with inventory
const parts = [
  { partNumber: 'FST-001', name: 'Hex Bolt M10x50', description: 'Grade 8.8 hex bolt', categoryId: categoryIds['Fasteners'], vendorId: vendorIds['ACME'], unitPrice: 0.45, reorderPoint: 100, reorderQuantity: 500, quantityOnHand: 250 },
  { partNumber: 'FST-002', name: 'Hex Nut M10', description: 'Grade 8 hex nut', categoryId: categoryIds['Fasteners'], vendorId: vendorIds['ACME'], unitPrice: 0.15, reorderPoint: 200, reorderQuantity: 1000, quantityOnHand: 500 },
  { partNumber: 'FST-003', name: 'Flat Washer M10', description: 'Stainless steel flat washer', categoryId: categoryIds['Fasteners'], vendorId: vendorIds['ACME'], unitPrice: 0.08, reorderPoint: 200, reorderQuantity: 1000, quantityOnHand: 150 },
  { partNumber: 'BRG-001', name: '6205-2RS Bearing', description: 'Deep groove ball bearing, sealed', categoryId: categoryIds['Bearings'], vendorId: vendorIds['GPC'], unitPrice: 12.50, reorderPoint: 20, reorderQuantity: 50, quantityOnHand: 35 },
  { partNumber: 'BRG-002', name: '6206-2RS Bearing', description: 'Deep groove ball bearing, sealed', categoryId: categoryIds['Bearings'], vendorId: vendorIds['GPC'], unitPrice: 14.75, reorderPoint: 15, reorderQuantity: 40, quantityOnHand: 8 },
  { partNumber: 'BRG-003', name: 'Bronze Bushing 1"', description: 'Oil-impregnated bronze bushing', categoryId: categoryIds['Bearings'], vendorId: vendorIds['GPC'], unitPrice: 8.25, reorderPoint: 25, reorderQuantity: 100, quantityOnHand: 45 },
  { partNumber: 'ELC-001', name: 'Contactor 3-Pole 40A', description: '3-pole AC contactor, 40 amp', categoryId: categoryIds['Electrical'], vendorId: vendorIds['FTC'], unitPrice: 85.00, reorderPoint: 5, reorderQuantity: 10, quantityOnHand: 12 },
  { partNumber: 'ELC-002', name: 'Overload Relay 25-40A', description: 'Thermal overload relay', categoryId: categoryIds['Electrical'], vendorId: vendorIds['FTC'], unitPrice: 45.00, reorderPoint: 5, reorderQuantity: 15, quantityOnHand: 3 },
  { partNumber: 'ELC-003', name: 'Push Button Green', description: 'Momentary push button, green', categoryId: categoryIds['Electrical'], vendorId: vendorIds['FTC'], unitPrice: 8.50, reorderPoint: 20, reorderQuantity: 50, quantityOnHand: 28 },
  { partNumber: 'HYD-001', name: 'Hydraulic Hose 1/2" x 6ft', description: 'High pressure hydraulic hose', categoryId: categoryIds['Hydraulics'], vendorId: vendorIds['QPI'], unitPrice: 32.00, reorderPoint: 10, reorderQuantity: 25, quantityOnHand: 15 },
  { partNumber: 'HYD-002', name: 'Quick Coupler 1/2"', description: 'Hydraulic quick disconnect', categoryId: categoryIds['Hydraulics'], vendorId: vendorIds['QPI'], unitPrice: 18.50, reorderPoint: 15, reorderQuantity: 30, quantityOnHand: 22 },
  { partNumber: 'HYD-003', name: 'Hydraulic Filter', description: '10 micron spin-on filter', categoryId: categoryIds['Hydraulics'], vendorId: vendorIds['QPI'], unitPrice: 24.00, reorderPoint: 8, reorderQuantity: 20, quantityOnHand: 5 },
  { partNumber: 'PNU-001', name: 'Air Cylinder 2"x6"', description: 'Double acting pneumatic cylinder', categoryId: categoryIds['Pneumatics'], vendorId: vendorIds['BPW'], unitPrice: 65.00, reorderPoint: 5, reorderQuantity: 10, quantityOnHand: 8 },
  { partNumber: 'PNU-002', name: 'Solenoid Valve 1/4"', description: '5/2 way solenoid valve', categoryId: categoryIds['Pneumatics'], vendorId: vendorIds['BPW'], unitPrice: 42.00, reorderPoint: 8, reorderQuantity: 15, quantityOnHand: 10 },
  { partNumber: 'SEL-001', name: 'O-Ring Kit Imperial', description: 'Assorted O-ring kit, 407 pcs', categoryId: categoryIds['Seals'], vendorId: vendorIds['ACME'], unitPrice: 28.00, reorderPoint: 5, reorderQuantity: 10, quantityOnHand: 7 },
  { partNumber: 'SEL-002', name: 'Gasket Material 12"x12"', description: 'Compressed fiber gasket sheet', categoryId: categoryIds['Seals'], vendorId: vendorIds['ACME'], unitPrice: 15.00, reorderPoint: 10, reorderQuantity: 25, quantityOnHand: 18 },
  { partNumber: 'MTR-001', name: 'AC Motor 5HP', description: '5HP 3-phase AC motor, 1750 RPM', categoryId: categoryIds['Motors'], vendorId: vendorIds['GPC'], unitPrice: 450.00, reorderPoint: 2, reorderQuantity: 5, quantityOnHand: 3 },
  { partNumber: 'MTR-002', name: 'Gear Motor 1/2HP', description: '1/2HP gear motor, 60 RPM', categoryId: categoryIds['Motors'], vendorId: vendorIds['GPC'], unitPrice: 285.00, reorderPoint: 2, reorderQuantity: 4, quantityOnHand: 1 },
  { partNumber: 'SNS-001', name: 'Proximity Sensor M18', description: 'Inductive proximity sensor, NPN', categoryId: categoryIds['Sensors'], vendorId: vendorIds['FTC'], unitPrice: 35.00, reorderPoint: 10, reorderQuantity: 25, quantityOnHand: 15 },
  { partNumber: 'SNS-002', name: 'Photoelectric Sensor', description: 'Diffuse reflective sensor', categoryId: categoryIds['Sensors'], vendorId: vendorIds['FTC'], unitPrice: 55.00, reorderPoint: 8, reorderQuantity: 20, quantityOnHand: 6 },
];

const insertPart = db.transaction((p) => {
  const partResult = db.prepare(`
    INSERT INTO parts (part_number, name, description, category_id, vendor_id, unit_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(p.partNumber, p.name, p.description, p.categoryId, p.vendorId, p.unitPrice);

  db.prepare(`
    INSERT INTO inventory (part_id, quantity_on_hand, reorder_point, reorder_quantity, location)
    VALUES (?, ?, ?, ?, ?)
  `).run(partResult.lastInsertRowid, p.quantityOnHand, p.reorderPoint, p.reorderQuantity, `Warehouse A, Bin ${Math.floor(Math.random() * 100) + 1}`);
});

for (const p of parts) {
  insertPart(p);
}
console.log(`Created ${parts.length} parts with inventory`);

// Create a sample order
const date = new Date();
const orderNumber = `PO${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}0001`;

const orderResult = db.prepare(`
  INSERT INTO orders (order_number, vendor_id, status, subtotal, total, notes)
  VALUES (?, ?, 'PENDING', 177.00, 177.00, 'Initial sample order')
`).run(orderNumber, vendorIds['GPC']);

db.prepare(`
  INSERT INTO order_items (order_id, part_id, quantity, unit_price, total_price)
  VALUES (?, (SELECT id FROM parts WHERE part_number = 'BRG-001'), 10, 12.50, 125.00)
`).run(orderResult.lastInsertRowid);

db.prepare(`
  INSERT INTO order_items (order_id, part_id, quantity, unit_price, total_price)
  VALUES (?, (SELECT id FROM parts WHERE part_number = 'BRG-002'), 4, 14.75, 52.00)
`).run(orderResult.lastInsertRowid);

console.log('Created sample order');

console.log('Database seeding complete!');
console.log('\nSummary:');
console.log(`- ${vendors.length} vendors`);
console.log(`- ${categories.length} categories`);
console.log(`- ${parts.length} parts with inventory`);
console.log('- 1 sample order');
