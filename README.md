# Parts Management System

A comprehensive parts management application featuring vendor management, parts ordering, inventory tracking with automatic reordering, and product details management.

## Features

### Vendor Management
- Create, update, and delete vendors
- Track vendor contact information, address, and communication details
- Vendor rating system (0-5 stars)
- Lead time tracking for delivery estimates
- Active/inactive status management

### Parts/Product Management
- Complete product catalog with part numbers
- Category organization with hierarchical support
- Link parts to vendors for ordering
- Track manufacturer information and part numbers
- Unit pricing and measurement units
- Barcode support for scanning

### Inventory Tracking
- Real-time quantity tracking
- Warehouse/bin location management
- Receive, ship, and adjust inventory quantities
- Physical count support with variance tracking
- Complete audit trail with inventory logs
- Reserved quantity tracking

### Auto-Reorder System
- Configurable reorder points per part
- Automatic reorder quantity settings
- Scheduled reorder checks (configurable via cron)
- Reorder alerts and notifications
- One-click order creation from suggestions
- Bulk order creation grouped by vendor

### Purchase Orders
- Create and manage purchase orders
- Order workflow: Draft → Pending → Approved → Ordered → Shipped → Received
- Partial receiving support
- Auto-generated orders from reorder system
- Order history and tracking

### Dashboard
- Overview of inventory health
- Low stock and out-of-stock alerts
- Recent order activity
- Inventory value tracking
- Top vendors summary

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite with Prisma ORM
- **Frontend**: React 18
- **Styling**: Custom CSS

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Parts-Management
```

2. Install dependencies:
```bash
npm run install:all
```

3. Set up the database:
```bash
npm run db:push
```

4. (Optional) Seed the database with sample data:
```bash
npm run db:seed
```

### Running the Application

**Development mode:**

Start the backend server:
```bash
npm run dev
```

In a separate terminal, start the frontend:
```bash
npm run client
```

The API will be available at `http://localhost:5000` and the frontend at `http://localhost:3000`.

**Production mode:**

1. Build the frontend:
```bash
npm run client:build
```

2. Start the server:
```bash
npm start
```

The application will be available at `http://localhost:5000`.

## API Endpoints

### Vendors
- `GET /api/vendors` - List all vendors
- `GET /api/vendors/:id` - Get vendor by ID
- `POST /api/vendors` - Create vendor
- `PUT /api/vendors/:id` - Update vendor
- `DELETE /api/vendors/:id` - Delete vendor
- `PATCH /api/vendors/:id/toggle-active` - Toggle active status

### Parts
- `GET /api/parts` - List all parts (with pagination)
- `GET /api/parts/:id` - Get part by ID
- `GET /api/parts/by-number/:partNumber` - Get part by part number
- `POST /api/parts` - Create part
- `PUT /api/parts/:id` - Update part
- `DELETE /api/parts/:id` - Delete part

### Inventory
- `GET /api/inventory` - List all inventory
- `GET /api/inventory/low-stock` - Get low stock items
- `GET /api/inventory/summary` - Get inventory summary
- `PUT /api/inventory/:partId` - Update inventory settings
- `POST /api/inventory/:partId/adjust` - Adjust quantity
- `POST /api/inventory/:partId/receive` - Receive inventory
- `POST /api/inventory/:partId/ship` - Ship inventory
- `POST /api/inventory/:partId/count` - Record physical count
- `GET /api/inventory/:partId/logs` - Get inventory logs

### Orders
- `GET /api/orders` - List all orders
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create order
- `PUT /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Delete draft order
- `POST /api/orders/:id/items` - Add item to order
- `DELETE /api/orders/:id/items/:itemId` - Remove item
- `PATCH /api/orders/:id/status` - Update order status
- `POST /api/orders/:id/receive-partial` - Partial receive

### Auto-Reorder
- `GET /api/reorder/alerts` - Get reorder alerts
- `POST /api/reorder/check` - Trigger reorder check
- `POST /api/reorder/alerts/:id/process` - Process alert (create order)
- `POST /api/reorder/alerts/:id/dismiss` - Dismiss alert
- `GET /api/reorder/suggestions` - Get reorder suggestions
- `POST /api/reorder/create-orders` - Create orders from suggestions

### Dashboard
- `GET /api/dashboard` - Get dashboard data
- `GET /api/dashboard/inventory-value` - Get value by category
- `GET /api/dashboard/order-trends` - Get order trends

## Configuration

Environment variables (`.env` file):

```
DATABASE_URL="file:./dev.db"
PORT=5000
NODE_ENV=development
AUTO_REORDER_ENABLED=true
AUTO_REORDER_CRON="0 */6 * * *"
```

The auto-reorder cron schedule follows standard cron format. Default is every 6 hours.

## Database Schema

The system uses the following main models:
- **Vendor** - Supplier information
- **Category** - Part categorization (hierarchical)
- **Part** - Product/part details
- **Inventory** - Stock levels and reorder settings
- **InventoryLog** - Audit trail for inventory changes
- **Order** - Purchase orders
- **OrderItem** - Line items in orders
- **ReorderAlert** - Auto-reorder notifications

## License

MIT
