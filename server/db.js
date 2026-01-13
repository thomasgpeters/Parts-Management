const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'parts.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
  db.exec(`
    -- Vendors table
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      country TEXT DEFAULT 'USA',
      website TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      rating INTEGER DEFAULT 0,
      lead_time_days INTEGER DEFAULT 7,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Categories table
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      parent_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    );

    -- Parts table
    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category_id INTEGER,
      vendor_id INTEGER,
      unit_price REAL DEFAULT 0,
      unit_of_measure TEXT DEFAULT 'EA',
      weight REAL,
      dimensions TEXT,
      manufacturer TEXT,
      manufacturer_pn TEXT,
      barcode TEXT,
      image_url TEXT,
      specifications TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    );

    -- Inventory table
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_id INTEGER UNIQUE NOT NULL,
      quantity_on_hand INTEGER DEFAULT 0,
      quantity_reserved INTEGER DEFAULT 0,
      reorder_point INTEGER DEFAULT 10,
      reorder_quantity INTEGER DEFAULT 50,
      max_quantity INTEGER,
      location TEXT,
      last_count_date TEXT,
      last_order_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE
    );

    -- Inventory logs table
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_id INTEGER NOT NULL,
      change_type TEXT NOT NULL,
      quantity_change INTEGER NOT NULL,
      previous_qty INTEGER NOT NULL,
      new_qty INTEGER NOT NULL,
      order_id INTEGER,
      reason TEXT,
      performed_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    -- Orders table
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      vendor_id INTEGER NOT NULL,
      status TEXT DEFAULT 'DRAFT',
      order_date TEXT,
      expected_date TEXT,
      received_date TEXT,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      shipping REAL DEFAULT 0,
      total REAL DEFAULT 0,
      notes TEXT,
      shipping_address TEXT,
      tracking_number TEXT,
      is_auto_generated INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    );

    -- Order items table
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      part_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      quantity_received INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (part_id) REFERENCES parts(id)
    );

    -- Reorder alerts table
    CREATE TABLE IF NOT EXISTS reorder_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_id INTEGER NOT NULL,
      part_number TEXT NOT NULL,
      part_name TEXT NOT NULL,
      current_qty INTEGER NOT NULL,
      reorder_point INTEGER NOT NULL,
      reorder_qty INTEGER NOT NULL,
      vendor_id INTEGER,
      vendor_name TEXT,
      status TEXT DEFAULT 'PENDING',
      order_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_parts_vendor ON parts(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_parts_category ON parts(category_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_part ON inventory(part_id);
    CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_logs_part ON inventory_logs(part_id);
  `);

  console.log('Database initialized successfully');
}

// Helper to convert snake_case row to camelCase object
function toCamelCase(row) {
  if (!row) return null;
  const result = {};
  for (const key in row) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    // Convert SQLite integers to booleans for is_* fields
    if (key.startsWith('is_')) {
      result[camelKey] = Boolean(row[key]);
    } else {
      result[camelKey] = row[key];
    }
  }
  return result;
}

// Convert array of rows
function rowsToCamelCase(rows) {
  return rows.map(toCamelCase);
}

// Initialize on load
initializeDatabase();

module.exports = {
  db,
  toCamelCase,
  rowsToCamelCase,
  initializeDatabase
};
