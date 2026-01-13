import React, { useState, useEffect } from 'react';
import { reorderApi } from '../api';

function Reorder() {
  const [suggestions, setSuggestions] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [suggestionsRes, alertsRes] = await Promise.all([
        reorderApi.getSuggestions(),
        reorderApi.getAlerts({ status: 'PENDING' })
      ]);
      setSuggestions(suggestionsRes.data);
      setAlerts(alertsRes.data);
    } catch (error) {
      console.error('Failed to load reorder data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runReorderCheck = async () => {
    setProcessing(true);
    try {
      await reorderApi.check();
      loadData();
    } catch (error) {
      alert('Failed to run reorder check');
    } finally {
      setProcessing(false);
    }
  };

  const processAlert = async (alertId) => {
    try {
      await reorderApi.processAlert(alertId);
      loadData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to process alert');
    }
  };

  const dismissAlert = async (alertId) => {
    try {
      await reorderApi.dismissAlert(alertId);
      loadData();
    } catch (error) {
      alert('Failed to dismiss alert');
    }
  };

  const processAllAlerts = async () => {
    if (!window.confirm(`Process all ${alerts.length} pending alerts and create orders?`)) return;
    setProcessing(true);
    try {
      const result = await reorderApi.processAll();
      alert(result.data.message);
      loadData();
    } catch (error) {
      alert('Failed to process alerts');
    } finally {
      setProcessing(false);
    }
  };

  const createOrdersForVendor = async (vendorId) => {
    setProcessing(true);
    try {
      const result = await reorderApi.createOrders({ vendorIds: [vendorId] });
      alert(result.data.message);
      loadData();
    } catch (error) {
      alert('Failed to create order');
    } finally {
      setProcessing(false);
    }
  };

  const createAllOrders = async () => {
    if (!window.confirm('Create orders for all vendors with low stock items?')) return;
    setProcessing(true);
    try {
      const result = await reorderApi.createOrders({});
      alert(result.data.message);
      loadData();
    } catch (error) {
      alert('Failed to create orders');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading reorder data...</div>;
  }

  return (
    <div className="reorder-page">
      <div className="page-header">
        <h2>Auto Reorder</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className="btn btn-secondary"
            onClick={runReorderCheck}
            disabled={processing}
          >
            Run Reorder Check
          </button>
          {suggestions?.summary?.totalItems > 0 && (
            <button
              className="btn btn-primary"
              onClick={createAllOrders}
              disabled={processing}
            >
              Create All Orders
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {suggestions && (
        <div className="stats-grid">
          <div className="stat-card warning">
            <div className="stat-label">Items Below Reorder Point</div>
            <div className="stat-value">{suggestions.summary.totalItems}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Vendors Affected</div>
            <div className="stat-value">{suggestions.summary.vendorCount}</div>
          </div>
          <div className="stat-card primary">
            <div className="stat-label">Estimated Order Value</div>
            <div className="stat-value">${suggestions.summary.totalEstimatedCost.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Pending Alerts</div>
            <div className="stat-value">{alerts.length}</div>
          </div>
        </div>
      )}

      {/* Pending Alerts */}
      {alerts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Pending Reorder Alerts</h3>
            <button
              className="btn btn-sm btn-primary"
              onClick={processAllAlerts}
              disabled={processing}
            >
              Process All
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Part #</th>
                <th>Name</th>
                <th>Vendor</th>
                <th>Current Qty</th>
                <th>Reorder Point</th>
                <th>Reorder Qty</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(alert => (
                <tr key={alert.id}>
                  <td><strong>{alert.partNumber}</strong></td>
                  <td>{alert.partName}</td>
                  <td>{alert.vendorName || '-'}</td>
                  <td>
                    <span className={`badge ${alert.currentQty === 0 ? 'badge-danger' : 'badge-warning'}`}>
                      {alert.currentQty}
                    </span>
                  </td>
                  <td>{alert.reorderPoint}</td>
                  <td>{alert.reorderQty}</td>
                  <td>{new Date(alert.createdAt).toLocaleDateString()}</td>
                  <td className="table-actions">
                    {alert.vendorId && (
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => processAlert(alert.id)}
                        disabled={processing}
                      >
                        Create Order
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => dismissAlert(alert.id)}
                    >
                      Dismiss
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reorder Suggestions by Vendor */}
      {suggestions?.byVendor?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Reorder Suggestions by Vendor</h3>
          </div>
          {suggestions.byVendor.map(vendor => (
            <div key={vendor.vendorId} style={{ marginBottom: '24px', padding: '16px', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h4 style={{ margin: 0 }}>{vendor.vendorName}</h4>
                  <small style={{ color: 'var(--gray-500)' }}>
                    {vendor.items.length} items | Est. ${vendor.totalEstimatedCost.toLocaleString()}
                  </small>
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => createOrdersForVendor(vendor.vendorId)}
                  disabled={processing}
                >
                  Create Order
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Part #</th>
                    <th>Name</th>
                    <th>Current</th>
                    <th>Reorder Point</th>
                    <th>Order Qty</th>
                    <th>Est. Cost</th>
                    <th>Lead Time</th>
                  </tr>
                </thead>
                <tbody>
                  {vendor.items.map((item, idx) => (
                    <tr key={idx}>
                      <td><strong>{item.partNumber}</strong></td>
                      <td>{item.partName}</td>
                      <td>
                        <span className={`badge ${item.currentQuantity === 0 ? 'badge-danger' : 'badge-warning'}`}>
                          {item.currentQuantity}
                        </span>
                      </td>
                      <td>{item.reorderPoint}</td>
                      <td>{item.reorderQuantity}</td>
                      <td>${item.estimatedCost.toFixed(2)}</td>
                      <td>{item.leadTimeDays} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* All Low Stock Items */}
      {suggestions?.suggestions?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">All Low Stock Items</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Part #</th>
                <th>Name</th>
                <th>Vendor</th>
                <th>Current</th>
                <th>Shortfall</th>
                <th>Reorder Qty</th>
                <th>Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.suggestions.map((item, idx) => (
                <tr key={idx}>
                  <td><strong>{item.partNumber}</strong></td>
                  <td>{item.partName}</td>
                  <td>{item.vendorName || <span style={{ color: 'var(--danger)' }}>No vendor</span>}</td>
                  <td>
                    <span className={`badge ${item.currentQuantity === 0 ? 'badge-danger' : 'badge-warning'}`}>
                      {item.currentQuantity}
                    </span>
                  </td>
                  <td style={{ color: 'var(--danger)' }}>-{item.shortfall}</td>
                  <td>{item.reorderQuantity}</td>
                  <td>${item.estimatedCost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty State */}
      {suggestions?.suggestions?.length === 0 && alerts.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <h3>All items are well stocked!</h3>
            <p>No items are currently below their reorder point.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reorder;
