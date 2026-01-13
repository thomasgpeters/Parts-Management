import React, { useState, useEffect } from 'react';
import { ordersApi, vendorsApi, partsApi } from '../api';

function Orders() {
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterVendor, setFilterVendor] = useState('');

  const [orderData, setOrderData] = useState({
    vendorId: '',
    items: [],
    notes: ''
  });
  const [newItem, setNewItem] = useState({ partId: '', quantity: 1 });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadOrders();
  }, [filterStatus, filterVendor]);

  const loadInitialData = async () => {
    try {
      const [vendorsRes, partsRes] = await Promise.all([
        vendorsApi.getAll({ isActive: 'true' }),
        partsApi.getAll({ isActive: 'true' })
      ]);
      setVendors(vendorsRes.data);
      setParts(partsRes.data.data);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const loadOrders = async () => {
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterVendor) params.vendorId = filterVendor;
      const response = await ordersApi.getAll(params);
      setOrders(response.data.data);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (orderData.items.length === 0) {
      alert('Please add at least one item');
      return;
    }
    try {
      await ordersApi.create({
        vendorId: parseInt(orderData.vendorId),
        items: orderData.items.map(item => ({
          partId: parseInt(item.partId),
          quantity: parseInt(item.quantity)
        })),
        notes: orderData.notes
      });
      setShowModal(false);
      setOrderData({ vendorId: '', items: [], notes: '' });
      loadOrders();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create order');
    }
  };

  const addItemToOrder = () => {
    if (!newItem.partId || newItem.quantity < 1) return;
    const part = parts.find(p => p.id === parseInt(newItem.partId));
    if (!part) return;

    setOrderData({
      ...orderData,
      items: [...orderData.items, {
        partId: newItem.partId,
        partNumber: part.partNumber,
        partName: part.name,
        quantity: newItem.quantity,
        unitPrice: part.unitPrice
      }]
    });
    setNewItem({ partId: '', quantity: 1 });
  };

  const removeItemFromOrder = (index) => {
    setOrderData({
      ...orderData,
      items: orderData.items.filter((_, i) => i !== index)
    });
  };

  const updateOrderStatus = async (orderId, newStatus, trackingNumber = null) => {
    try {
      await ordersApi.updateStatus(orderId, { status: newStatus, trackingNumber });
      loadOrders();
      if (selectedOrder?.id === orderId) {
        const updated = await ordersApi.getById(orderId);
        setSelectedOrder(updated.data);
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update order status');
    }
  };

  const viewOrderDetail = async (order) => {
    try {
      const response = await ordersApi.getById(order.id);
      setSelectedOrder(response.data);
      setShowDetailModal(true);
    } catch (error) {
      console.error('Failed to load order details:', error);
    }
  };

  const deleteOrder = async (id) => {
    if (!window.confirm('Are you sure you want to delete this order?')) return;
    try {
      await ordersApi.delete(id);
      loadOrders();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete order');
    }
  };

  const getStatusColor = (status) => {
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
  };

  const getNextStatus = (status) => {
    const transitions = {
      DRAFT: 'PENDING',
      PENDING: 'APPROVED',
      APPROVED: 'ORDERED',
      ORDERED: 'SHIPPED',
      SHIPPED: 'RECEIVED'
    };
    return transitions[status];
  };

  return (
    <div className="orders-page">
      <div className="page-header">
        <h2>Purchase Orders</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Create Order
        </button>
      </div>

      <div className="search-bar">
        <select
          className="filter-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="ORDERED">Ordered</option>
          <option value="SHIPPED">Shipped</option>
          <option value="RECEIVED">Received</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select
          className="filter-select"
          value={filterVendor}
          onChange={(e) => setFilterVendor(e.target.value)}
        >
          <option value="">All Vendors</option>
          {vendors.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <h3>No orders found</h3>
            <p>Create your first purchase order</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Vendor</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.orderNumber}</strong>
                    {order.isAutoGenerated && (
                      <><br /><small style={{ color: 'var(--gray-500)' }}>Auto-generated</small></>
                    )}
                  </td>
                  <td>{order.vendor?.name}</td>
                  <td>{order._count?.items || order.items?.length}</td>
                  <td>${order.total.toLocaleString()}</td>
                  <td>
                    <span className={`badge badge-${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                  <td className="table-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => viewOrderDetail(order)}>
                      View
                    </button>
                    {getNextStatus(order.status) && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => updateOrderStatus(order.id, getNextStatus(order.status))}
                      >
                        {getNextStatus(order.status)}
                      </button>
                    )}
                    {order.status === 'DRAFT' && (
                      <button className="btn btn-sm btn-danger" onClick={() => deleteOrder(order.id)}>
                        Delete
                      </button>
                    )}
                    {!['RECEIVED', 'CANCELLED'].includes(order.status) && (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => updateOrderStatus(order.id, 'CANCELLED')}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Order Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Purchase Order</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleCreateOrder}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Vendor *</label>
                  <select
                    className="form-input"
                    value={orderData.vendorId}
                    onChange={(e) => setOrderData({ ...orderData, vendorId: e.target.value })}
                    required
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>

                <h4 style={{ marginTop: '20px', marginBottom: '12px' }}>Order Items</h4>

                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  <select
                    className="form-input"
                    style={{ flex: 2 }}
                    value={newItem.partId}
                    onChange={(e) => setNewItem({ ...newItem, partId: e.target.value })}
                  >
                    <option value="">Select Part</option>
                    {parts.map(p => (
                      <option key={p.id} value={p.id}>{p.partNumber} - {p.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="form-input"
                    style={{ width: '100px' }}
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                    min="1"
                    placeholder="Qty"
                  />
                  <button type="button" className="btn btn-secondary" onClick={addItemToOrder}>
                    Add
                  </button>
                </div>

                {orderData.items.length > 0 && (
                  <table style={{ marginBottom: '16px' }}>
                    <thead>
                      <tr>
                        <th>Part</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderData.items.map((item, index) => (
                        <tr key={index}>
                          <td>
                            <strong>{item.partNumber}</strong>
                            <br />
                            <small>{item.partName}</small>
                          </td>
                          <td>{item.quantity}</td>
                          <td>${item.unitPrice.toFixed(2)}</td>
                          <td>${(item.quantity * item.unitPrice).toFixed(2)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => removeItemFromOrder(index)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan="3" style={{ textAlign: 'right', fontWeight: '600' }}>Total:</td>
                        <td style={{ fontWeight: '600' }}>
                          ${orderData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                )}

                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-input"
                    value={orderData.notes}
                    onChange={(e) => setOrderData({ ...orderData, notes: e.target.value })}
                    rows="2"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {showDetailModal && selectedOrder && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Order {selectedOrder.orderNumber}</h3>
              <button className="modal-close" onClick={() => setShowDetailModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <strong>Vendor:</strong> {selectedOrder.vendor?.name}
                </div>
                <div>
                  <strong>Status:</strong>{' '}
                  <span className={`badge badge-${getStatusColor(selectedOrder.status)}`}>
                    {selectedOrder.status}
                  </span>
                </div>
                <div>
                  <strong>Created:</strong> {new Date(selectedOrder.createdAt).toLocaleString()}
                </div>
                <div>
                  <strong>Order Date:</strong> {selectedOrder.orderDate ? new Date(selectedOrder.orderDate).toLocaleDateString() : '-'}
                </div>
                {selectedOrder.trackingNumber && (
                  <div>
                    <strong>Tracking:</strong> {selectedOrder.trackingNumber}
                  </div>
                )}
                {selectedOrder.receivedDate && (
                  <div>
                    <strong>Received:</strong> {new Date(selectedOrder.receivedDate).toLocaleDateString()}
                  </div>
                )}
              </div>

              <h4 style={{ marginBottom: '12px' }}>Items</h4>
              <table>
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Qty</th>
                    <th>Received</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items?.map(item => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.part?.partNumber}</strong>
                        <br />
                        <small>{item.part?.name}</small>
                      </td>
                      <td>{item.quantity}</td>
                      <td>{item.quantityReceived}</td>
                      <td>${item.unitPrice.toFixed(2)}</td>
                      <td>${item.totalPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: '16px', textAlign: 'right' }}>
                <div>Subtotal: ${selectedOrder.subtotal.toFixed(2)}</div>
                {selectedOrder.tax > 0 && <div>Tax: ${selectedOrder.tax.toFixed(2)}</div>}
                {selectedOrder.shipping > 0 && <div>Shipping: ${selectedOrder.shipping.toFixed(2)}</div>}
                <div style={{ fontSize: '1.2rem', fontWeight: '700', marginTop: '8px' }}>
                  Total: ${selectedOrder.total.toFixed(2)}
                </div>
              </div>

              {selectedOrder.notes && (
                <div style={{ marginTop: '16px' }}>
                  <strong>Notes:</strong>
                  <p style={{ color: 'var(--gray-600)' }}>{selectedOrder.notes}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDetailModal(false)}>
                Close
              </button>
              {getNextStatus(selectedOrder.status) && (
                <button
                  className="btn btn-primary"
                  onClick={() => updateOrderStatus(selectedOrder.id, getNextStatus(selectedOrder.status))}
                >
                  Mark as {getNextStatus(selectedOrder.status)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Orders;
