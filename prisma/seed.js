const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Categories
  const categories = await Promise.all([
    prisma.category.create({
      data: { name: 'Electronics', description: 'Electronic components and parts' }
    }),
    prisma.category.create({
      data: { name: 'Mechanical', description: 'Mechanical parts and hardware' }
    }),
    prisma.category.create({
      data: { name: 'Fasteners', description: 'Screws, bolts, nuts, and other fasteners' }
    }),
    prisma.category.create({
      data: { name: 'Tools', description: 'Hand and power tools' }
    }),
    prisma.category.create({
      data: { name: 'Safety Equipment', description: 'Personal protective equipment' }
    }),
  ]);
  console.log(`Created ${categories.length} categories`);

  // Create Vendors
  const vendors = await Promise.all([
    prisma.vendor.create({
      data: {
        name: 'TechSupply Co.',
        code: 'TECH001',
        contactName: 'John Smith',
        email: 'john@techsupply.com',
        phone: '555-0101',
        address: '123 Tech Street',
        city: 'San Jose',
        state: 'CA',
        zipCode: '95101',
        website: 'https://techsupply.com',
        rating: 5,
        leadTimeDays: 3
      }
    }),
    prisma.vendor.create({
      data: {
        name: 'Industrial Parts Inc.',
        code: 'IND001',
        contactName: 'Jane Doe',
        email: 'jane@industrialparts.com',
        phone: '555-0102',
        address: '456 Industrial Blvd',
        city: 'Detroit',
        state: 'MI',
        zipCode: '48201',
        rating: 4,
        leadTimeDays: 5
      }
    }),
    prisma.vendor.create({
      data: {
        name: 'FastenerWorld',
        code: 'FAST001',
        contactName: 'Bob Wilson',
        email: 'bob@fastenerworld.com',
        phone: '555-0103',
        address: '789 Bolt Lane',
        city: 'Cleveland',
        state: 'OH',
        zipCode: '44101',
        rating: 4,
        leadTimeDays: 2
      }
    }),
    prisma.vendor.create({
      data: {
        name: 'SafetyFirst Supply',
        code: 'SAFE001',
        contactName: 'Sarah Johnson',
        email: 'sarah@safetyfirst.com',
        phone: '555-0104',
        address: '321 Safety Ave',
        city: 'Chicago',
        state: 'IL',
        zipCode: '60601',
        rating: 5,
        leadTimeDays: 4
      }
    }),
  ]);
  console.log(`Created ${vendors.length} vendors`);

  // Create Parts with Inventory
  const partsData = [
    // Electronics
    { partNumber: 'ELEC-001', name: 'Arduino Uno R3', description: 'Microcontroller board', categoryId: categories[0].id, vendorId: vendors[0].id, unitPrice: 24.99, manufacturer: 'Arduino', qty: 50, reorderPoint: 10, reorderQty: 30 },
    { partNumber: 'ELEC-002', name: 'Raspberry Pi 4 Model B', description: '4GB RAM single-board computer', categoryId: categories[0].id, vendorId: vendors[0].id, unitPrice: 55.00, manufacturer: 'Raspberry Pi', qty: 25, reorderPoint: 5, reorderQty: 20 },
    { partNumber: 'ELEC-003', name: 'LED 5mm Red (100pk)', description: 'Red LEDs pack of 100', categoryId: categories[0].id, vendorId: vendors[0].id, unitPrice: 8.99, manufacturer: 'Generic', qty: 200, reorderPoint: 50, reorderQty: 100 },
    { partNumber: 'ELEC-004', name: 'Resistor Kit 1/4W', description: 'Assorted resistors 1000pcs', categoryId: categories[0].id, vendorId: vendors[0].id, unitPrice: 12.99, manufacturer: 'Generic', qty: 15, reorderPoint: 5, reorderQty: 20 },
    { partNumber: 'ELEC-005', name: 'Capacitor Assortment Kit', description: 'Mixed ceramic capacitors 500pcs', categoryId: categories[0].id, vendorId: vendors[0].id, unitPrice: 15.99, manufacturer: 'Generic', qty: 8, reorderPoint: 10, reorderQty: 15 },

    // Mechanical
    { partNumber: 'MECH-001', name: 'Bearing 608ZZ', description: 'Skateboard bearing 8x22x7mm', categoryId: categories[1].id, vendorId: vendors[1].id, unitPrice: 2.50, manufacturer: 'SKF', qty: 100, reorderPoint: 25, reorderQty: 50 },
    { partNumber: 'MECH-002', name: 'Stepper Motor NEMA 17', description: '1.8 degree stepper motor', categoryId: categories[1].id, vendorId: vendors[1].id, unitPrice: 14.99, manufacturer: 'Generic', qty: 20, reorderPoint: 5, reorderQty: 15 },
    { partNumber: 'MECH-003', name: 'Linear Rail MGN12', description: '300mm linear rail with carriage', categoryId: categories[1].id, vendorId: vendors[1].id, unitPrice: 18.99, manufacturer: 'Hiwin', qty: 12, reorderPoint: 5, reorderQty: 10 },
    { partNumber: 'MECH-004', name: 'Timing Belt GT2 6mm', description: '5 meter GT2 timing belt', categoryId: categories[1].id, vendorId: vendors[1].id, unitPrice: 8.99, manufacturer: 'Generic', qty: 30, reorderPoint: 10, reorderQty: 20 },
    { partNumber: 'MECH-005', name: 'Aluminum Extrusion 2020', description: '500mm V-slot extrusion', categoryId: categories[1].id, vendorId: vendors[1].id, unitPrice: 7.50, manufacturer: 'OpenBuilds', qty: 3, reorderPoint: 10, reorderQty: 25 },

    // Fasteners
    { partNumber: 'FAST-001', name: 'M3 Socket Head Screws (100pk)', description: 'M3x10mm socket head cap screws', categoryId: categories[2].id, vendorId: vendors[2].id, unitPrice: 6.99, manufacturer: 'Generic', qty: 150, reorderPoint: 30, reorderQty: 50 },
    { partNumber: 'FAST-002', name: 'M4 Hex Nuts (100pk)', description: 'M4 stainless steel hex nuts', categoryId: categories[2].id, vendorId: vendors[2].id, unitPrice: 4.99, manufacturer: 'Generic', qty: 200, reorderPoint: 50, reorderQty: 100 },
    { partNumber: 'FAST-003', name: 'M5 Washers (200pk)', description: 'M5 flat washers stainless', categoryId: categories[2].id, vendorId: vendors[2].id, unitPrice: 5.99, manufacturer: 'Generic', qty: 100, reorderPoint: 25, reorderQty: 50 },
    { partNumber: 'FAST-004', name: 'Wood Screws Assortment', description: 'Mixed wood screws 500pcs', categoryId: categories[2].id, vendorId: vendors[2].id, unitPrice: 19.99, manufacturer: 'Hillman', qty: 5, reorderPoint: 8, reorderQty: 15 },
    { partNumber: 'FAST-005', name: 'T-Nuts M5 for 2020 (50pk)', description: 'Hammer head T-nuts for extrusion', categoryId: categories[2].id, vendorId: vendors[2].id, unitPrice: 12.99, manufacturer: 'OpenBuilds', qty: 80, reorderPoint: 20, reorderQty: 40 },

    // Tools
    { partNumber: 'TOOL-001', name: 'Hex Key Set Metric', description: '9-piece metric hex key set', categoryId: categories[3].id, vendorId: vendors[1].id, unitPrice: 12.99, manufacturer: 'Stanley', qty: 15, reorderPoint: 5, reorderQty: 10 },
    { partNumber: 'TOOL-002', name: 'Digital Caliper', description: '6-inch digital caliper 0.01mm', categoryId: categories[3].id, vendorId: vendors[1].id, unitPrice: 24.99, manufacturer: 'Mitutoyo', qty: 8, reorderPoint: 3, reorderQty: 5 },
    { partNumber: 'TOOL-003', name: 'Soldering Iron 60W', description: 'Adjustable temperature soldering iron', categoryId: categories[3].id, vendorId: vendors[0].id, unitPrice: 29.99, manufacturer: 'Weller', qty: 10, reorderPoint: 3, reorderQty: 7 },

    // Safety Equipment
    { partNumber: 'SAFE-001', name: 'Safety Glasses Clear', description: 'ANSI Z87.1 safety glasses', categoryId: categories[4].id, vendorId: vendors[3].id, unitPrice: 5.99, manufacturer: '3M', qty: 50, reorderPoint: 15, reorderQty: 30 },
    { partNumber: 'SAFE-002', name: 'Nitrile Gloves Medium (100pk)', description: 'Disposable nitrile gloves', categoryId: categories[4].id, vendorId: vendors[3].id, unitPrice: 14.99, manufacturer: 'Ansell', qty: 20, reorderPoint: 5, reorderQty: 15 },
    { partNumber: 'SAFE-003', name: 'Ear Plugs (50 pairs)', description: 'Foam ear plugs NRR 32dB', categoryId: categories[4].id, vendorId: vendors[3].id, unitPrice: 12.99, manufacturer: '3M', qty: 2, reorderPoint: 5, reorderQty: 10 },
  ];

  for (const partData of partsData) {
    const { qty, reorderPoint, reorderQty, ...partInfo } = partData;
    await prisma.part.create({
      data: {
        ...partInfo,
        inventory: {
          create: {
            quantityOnHand: qty,
            reorderPoint: reorderPoint,
            reorderQuantity: reorderQty,
            location: `Warehouse A, Section ${partInfo.partNumber.split('-')[0]}`
          }
        }
      }
    });
  }
  console.log(`Created ${partsData.length} parts with inventory`);

  // Create a sample order
  const parts = await prisma.part.findMany({ take: 3 });
  const order = await prisma.order.create({
    data: {
      orderNumber: 'PO202401-0001',
      vendorId: vendors[0].id,
      status: 'RECEIVED',
      orderDate: new Date('2024-01-15'),
      receivedDate: new Date('2024-01-18'),
      subtotal: 94.97,
      total: 94.97,
      notes: 'Initial stock order',
      items: {
        create: parts.map(part => ({
          partId: part.id,
          quantity: 10,
          unitPrice: part.unitPrice,
          totalPrice: part.unitPrice * 10,
          quantityReceived: 10
        }))
      }
    }
  });
  console.log('Created sample order');

  // Create some inventory logs
  for (const part of parts) {
    await prisma.inventoryLog.create({
      data: {
        partId: part.id,
        changeType: 'RECEIVE',
        quantityChange: 10,
        previousQty: 0,
        newQty: 10,
        orderId: order.id,
        reason: 'Initial stock from order PO202401-0001'
      }
    });
  }
  console.log('Created inventory logs');

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
