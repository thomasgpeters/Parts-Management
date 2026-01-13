import React, { useState, useEffect } from 'react';
import { inventoryApi, partsApi } from '../api';

function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showCountModal, setShowCountModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [search, setSearch] = useState('');

  const [adjustData, setAdjustData] = useState({ quantity: 0, reason: '', type: 'adjust' });
  const [countData, setCountData] = useState({ actualQuantity: 0 });

  useEffect(() => {
    loadInventory();
  }, [filterLowStock]);

  const loadInventory = async () => {
    try {
      const params = {};
      if (filterLowStock) params.lowStock = 'true';
      const response = await inventoryApi.getAll(params);
      setInventory(response.data);
    } catch (error) {
      console.error('Failed to load inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = inventory.filter(item => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      item.part?.partNumber?.toLowerCase().includes(searchLower) ||
      item.part?.name?.toLowerCase().includes(searchLower) ||
      item.location?.toLowerCase().includes(searchLower)
    );
  });

  const handleAdjust = async (e) => {
    e.preventDefault();
    try {
      let endpoint;
      let data;

      if (adjustData.type === 'receive') {
        await inventoryApi.receive(selectedItem.partId, {
          quantity: Math.abs(adjustData.quantity),
          performedBy: 'User'
        });
      } else if (adjustData.type === 'ship') {
        await inventoryApi.ship(selectedItem.partId, {
          quantity: Math.abs(adjustData.quantity),
          reason: adjustData.reason,
          performedBy: 'User'
        });
      } else {
        await inventoryApi.adjust(selectedItem.partId, {
          quantity: adjustData.quantity,
          reason: adjustData.reason,
          performedBy: 'User'
        });
      }

      setShowAdjustModal(false);
      setAdjustData({ quantity: 0, reason: '', type: 'adjust' });
      loadInventory();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to adjust inventory');
    }
  };

  const handleCount = async (e) => {
    e.preventDefault();
    try {
      await inventoryApi.count(selectedItem.partId, {
        actualQuantity: countData.actualQuantity,
        performedBy: 'User'
      });
      setShowCountModal(false);
      setCountData({ actualQuantity: 0 });
      loadInventory();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to record count');
    }
  };

  const openAdjustModal = (item, type = 'adjust') => {
    setSelectedItem(item);
    setAdjustData({ quantity: 0, reason: '', type });
    setShowAdjustModal(true);
  };

  const openCountModal = (item) => {
    setSelectedItem(item);
    setCountData({ actualQuantity: item.quantityOnHand });
    setShowCountModal(true);
  };

  const getStockStatus = (item) => {
    if (item.quantityOnHand === 0) return { label: 'Out of Stock', class: 'badge-danger' };
    if (item.quantityOnHand <= item.reorderPoint) return { label: 'Low Stock', class: 'badge-warning' };
    return { label: 'In Stock', class: 'badge-success' };
  };

  return (
    <div className="inventory-page">
      <div className="page-header">
        <h2>Inventory</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className={`btn ${filterLowStock ? 'btn-warning' : 'btn-secondary'}`}
            onClick={() => setFilterLowStock(!filterLowStock)}
          >
            {filterLowStock ? 'Show All' : 'Show Low Stock'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Items</div>
          <div className="stat-value">{inventory.length}</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">In Stock</div>
          <div className="stat-value">
            {inventory.filter(i => i.quantityOnHand > i.reorderPoint).length}
          </div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">Low Stock</div>
          <div className="stat-value">
            {inventory.filter(i => i.quantityOnHand <= i.reorderPoint && i.quantityOnHand > 0).length}
          </div>
        </div>
        <div className="stat-card danger">
          <div className="stat-label">Out of Stock</div>
          <div className="stat-value">
            {inventory.filter(i => i.quantityOnHand === 0).length}
          </div>
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search by part number, name, or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading inventory...</div>
        ) : filteredInventory.length === 0 ? (
          <div className="empty-state">
            <h3>No inventory items found</h3>
            <p>Add parts to start tracking inventory</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Part #</th>
                <th>Name</th>
                <th>Location</th>
                <th>On Hand</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Reorder Point</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map(item => {
                const status = getStockStatus(item);
                const available = item.quantityOnHand - item.quantityReserved;
                return (
                  <tr key={item.id}>
                    <td><strong>{item.part?.partNumber}</strong></td>
                    <td>{item.part?.name}</td>
                    <td>{item.location || '-'}</td>
                    <td style={{ fontWeight: '600' }}>{item.quantityOnHand}</td>
                    <td>{item.quantityReserved}</td>
                    <td style={{ color: available < 0 ? 'var(--danger)' : 'inherit' }}>
                      {available}
                    </td>
                    <td>{item.reorderPoint}</td>
                    <td>
                      <span className={`badge ${status.class}`}>{status.label}</span>
                    </td>
                    <td className="table-actions">
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => openAdjustModal(item, 'receive')}
                      >
                        Receive
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => openAdjustModal(item, 'ship')}
                      >
                        Ship
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => openAdjustModal(item, 'adjust')}
                      >
                        Adjust
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => openCountModal(item)}
                      >
                        Count
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Adjust Modal */}
      {showAdjustModal && (
        <div className="modal-overlay" onClick={() => setShowAdjustModal(false)}>
          <div className="modal" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {adjustData.type === 'receive' ? 'Receive Inventory' :
                 adjustData.type === 'ship' ? 'Ship Inventory' : 'Adjust Inventory'}
              </h3>
              <button className="modal-close" onClick={() => setShowAdjustModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleAdjust}>
              <div className="modal-body">
                <div className="alert alert-info" style={{ marginBottom: '16px' }}>
                  <strong>{selectedItem?.part?.partNumber}</strong> - {selectedItem?.part?.name}
                  <br />
                  Current quantity: <strong>{selectedItem?.quantityOnHand}</strong>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    {adjustData.type === 'adjust' ? 'Quantity Change (+/-)' : 'Quantity'}
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={adjustData.quantity}
                    onChange={(e) => setAdjustData({ ...adjustData, quantity: parseInt(e.target.value) || 0 })}
                    required
                  />
                  {adjustData.type === 'adjust' && (
                    <small style={{ color: 'var(--gray-500)' }}>
                      Use positive number to add, negative to subtract
                    </small>
                  )}
                </div>

                {adjustData.type !== 'receive' && (
                  <div className="form-group">
                    <label className="form-label">Reason</label>
                    <input
                      type="text"
                      className="form-input"
                      value={adjustData.reason}
                      onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                      placeholder="Enter reason for adjustment"
                      required
                    />
                  </div>
                )}

                <div className="alert" style={{ background: 'var(--gray-100)', marginTop: '16px' }}>
                  New quantity will be: <strong>
                    {adjustData.type === 'ship'
                      ? selectedItem?.quantityOnHand - Math.abs(adjustData.quantity)
                      : selectedItem?.quantityOnHand + (adjustData.type === 'receive' ? Math.abs(adjustData.quantity) : adjustData.quantity)
                    }
                  </strong>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdjustModal(false)}>
                  Cancel
                </button>
                <button type="submit" className={`btn ${adjustData.type === 'receive' ? 'btn-success' : 'btn-primary'}`}>
                  {adjustData.type === 'receive' ? 'Receive' :
                   adjustData.type === 'ship' ? 'Ship' : 'Adjust'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Count Modal */}
      {showCountModal && (
        <div className="modal-overlay" onClick={() => setShowCountModal(false)}>
          <div className="modal" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Physical Count</h3>
              <button className="modal-close" onClick={() => setShowCountModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleCount}>
              <div className="modal-body">
                <div className="alert alert-info" style={{ marginBottom: '16px' }}>
                  <strong>{selectedItem?.part?.partNumber}</strong> - {selectedItem?.part?.name}
                  <br />
                  System quantity: <strong>{selectedItem?.quantityOnHand}</strong>
                </div>

                <div className="form-group">
                  <label className="form-label">Actual Count</label>
                  <input
                    type="number"
                    className="form-input"
                    value={countData.actualQuantity}
                    onChange={(e) => setCountData({ actualQuantity: parseInt(e.target.value) || 0 })}
                    min="0"
                    required
                  />
                </div>

                {countData.actualQuantity !== selectedItem?.quantityOnHand && (
                  <div className={`alert ${countData.actualQuantity < selectedItem?.quantityOnHand ? 'alert-danger' : 'alert-success'}`}>
                    Variance: <strong>
                      {countData.actualQuantity - selectedItem?.quantityOnHand > 0 ? '+' : ''}
                      {countData.actualQuantity - selectedItem?.quantityOnHand}
                    </strong>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCountModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Record Count
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inventory;
