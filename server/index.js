require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const vendorRoutes = require('./routes/vendors');
const categoryRoutes = require('./routes/categories');
const partRoutes = require('./routes/parts');
const inventoryRoutes = require('./routes/inventory');
const orderRoutes = require('./routes/orders');
const dashboardRoutes = require('./routes/dashboard');
const reorderRoutes = require('./routes/reorder');

// Import auto-reorder scheduler
const { initializeAutoReorder } = require('./services/autoReorder');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/vendors', vendorRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/parts', partRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reorder', reorderRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Parts Management Server running on port ${PORT}`);

  // Initialize auto-reorder scheduler
  if (process.env.AUTO_REORDER_ENABLED === 'true') {
    initializeAutoReorder();
    console.log('Auto-reorder scheduler initialized');
  }
});

module.exports = app;
