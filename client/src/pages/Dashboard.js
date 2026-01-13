import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../api';

function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await dashboardApi.get();
      setData(response.data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (!data) {
    return <div className="empty-state">Failed to load dashboard data</div>;
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <h2>Dashboard</h2>
        <button className="btn btn-primary" onClick={loadDashboard}>
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-label">Total Parts</div>
          <div className="stat-value">{data.parts.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Vendors</div>
          <div className="stat-value">{data.vendors.active}</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Inventory Value</div>
          <div className="stat-value">${data.inventory.totalValue.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Orders</div>
          <div className="stat-value">{data.orders.pending}</div>
        </div>
      </div>

      {/* Alerts Section */}
      {(data.alerts.lowStockCount > 0 || data.alerts.outOfStockCount > 0) && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Inventory Alerts</h3>
            <Link to="/reorder" className="btn btn-sm btn-primary">
              View Reorder Suggestions
            </Link>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            {data.alerts.outOfStockCount > 0 && (
              <div className="alert alert-danger" style={{ flex: 1 }}>
                <strong>{data.alerts.outOfStockCount}</strong> items are out of stock
              </div>
            )}
            {data.alerts.lowStockCount > 0 && (
              <div className="alert alert-warning" style={{ flex: 1 }}>
                <strong>{data.alerts.lowStockCount}</strong> items below reorder point
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Low Stock Items */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Low Stock Items</h3>
            <Link to="/inventory?filter=low" className="btn btn-sm btn-secondary">
              View All
            </Link>
          </div>
          {data.lowStockItems.length === 0 ? (
            <div className="empty-state">
              <p>All items are well stocked</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Part</th>
                  <th>On Hand</th>
                  <th>Reorder Point</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStockItems.slice(0, 5).map(item => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.partNumber}</strong>
                      <br />
                      <small style={{ color: 'var(--gray-500)' }}>{item.partName}</small>
                    </td>
                    <td>
                      <span className={item.quantityOnHand === 0 ? 'badge badge-danger' : 'badge badge-warning'}>
                        {item.quantityOnHand}
                      </span>
                    </td>
                    <td>{item.reorderPoint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Orders */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Recent Orders</h3>
            <Link to="/orders" className="btn btn-sm btn-secondary">
              View All
            </Link>
          </div>
          {data.recentOrders.length === 0 ? (
            <div className="empty-state">
              <p>No orders yet</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map(order => (
                  <tr key={order.id}>
                    <td>{order.orderNumber}</td>
                    <td>{order.vendor?.name}</td>
                    <td>
                      <span className={`badge badge-${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td>${order.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Inventory Activity</h3>
        </div>
        {data.recentActivity.length === 0 ? (
          <div className="empty-state">
            <p>No recent activity</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th>Action</th>
                <th>Quantity Change</th>
                <th>New Qty</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {data.recentActivity.map(activity => (
                <tr key={activity.id}>
                  <td>
                    <strong>{activity.partNumber}</strong>
                    <br />
                    <small style={{ color: 'var(--gray-500)' }}>{activity.partName}</small>
                  </td>
                  <td>
                    <span className={`badge badge-${getActivityColor(activity.changeType)}`}>
                      {activity.changeType}
                    </span>
                  </td>
                  <td style={{ color: activity.quantityChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {activity.quantityChange >= 0 ? '+' : ''}{activity.quantityChange}
                  </td>
                  <td>{activity.newQty}</td>
                  <td>{new Date(activity.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Top Vendors */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Top Vendors</h3>
          <Link to="/vendors" className="btn btn-sm btn-secondary">
            View All
          </Link>
        </div>
        {data.topVendors.length === 0 ? (
          <div className="empty-state">
            <p>No vendors yet</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Code</th>
                <th>Orders</th>
                <th>Parts</th>
              </tr>
            </thead>
            <tbody>
              {data.topVendors.map(vendor => (
                <tr key={vendor.id}>
                  <td><strong>{vendor.name}</strong></td>
                  <td>{vendor.code}</td>
                  <td>{vendor.orderCount}</td>
                  <td>{vendor.partsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function getStatusColor(status) {
  const colors = {
    DRAFT: 'gray',
    PENDING: 'warning',
    APPROVED: 'info',
    ORDERED: 'info',
    SHIPPED: 'info',
    RECEIVED: 'success',
    CANCELLED: 'danger'
  };
  return colors[status] || 'gray';
}

function getActivityColor(type) {
  const colors = {
    RECEIVE: 'success',
    SHIP: 'warning',
    ADJUST: 'info',
    RESERVE: 'gray',
    UNRESERVE: 'gray',
    RETURN: 'success'
  };
  return colors[type] || 'gray';
}

export default Dashboard;
