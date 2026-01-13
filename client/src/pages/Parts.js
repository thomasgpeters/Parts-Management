import React, { useState, useEffect } from 'react';
import { partsApi, vendorsApi, categoriesApi } from '../api';

function Parts() {
  const [parts, setParts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [search, setSearch] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const emptyPart = {
    partNumber: '',
    name: '',
    description: '',
    categoryId: '',
    vendorId: '',
    unitPrice: 0,
    unitOfMeasure: 'EA',
    manufacturer: '',
    manufacturerPN: '',
    barcode: '',
    specifications: '',
    inventory: {
      quantityOnHand: 0,
      reorderPoint: 10,
      reorderQuantity: 50,
      location: ''
    }
  };

  const [formData, setFormData] = useState(emptyPart);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadParts();
  }, [search, filterVendor, filterCategory]);

  const loadInitialData = async () => {
    try {
      const [vendorsRes, categoriesRes] = await Promise.all([
        vendorsApi.getAll({ isActive: 'true' }),
        categoriesApi.getAll()
      ]);
      setVendors(vendorsRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const loadParts = async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (filterVendor) params.vendorId = filterVendor;
      if (filterCategory) params.categoryId = filterCategory;
      const response = await partsApi.getAll(params);
      setParts(response.data.data);
    } catch (error) {
      console.error('Failed to load parts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const dataToSend = {
        ...formData,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null,
        vendorId: formData.vendorId ? parseInt(formData.vendorId) : null,
        unitPrice: parseFloat(formData.unitPrice) || 0
      };

      if (editingPart) {
        await partsApi.update(editingPart.id, dataToSend);
      } else {
        await partsApi.create(dataToSend);
      }
      setShowModal(false);
      setEditingPart(null);
      setFormData(emptyPart);
      loadParts();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save part');
    }
  };

  const handleEdit = (part) => {
    setEditingPart(part);
    setFormData({
      ...part,
      categoryId: part.categoryId || '',
      vendorId: part.vendorId || '',
      inventory: part.inventory || emptyPart.inventory
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this part?')) return;
    try {
      await partsApi.delete(id);
      loadParts();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete part');
    }
  };

  const handleToggleActive = async (id) => {
    try {
      await partsApi.toggleActive(id);
      loadParts();
    } catch (error) {
      alert('Failed to update part status');
    }
  };

  const openNewModal = () => {
    setEditingPart(null);
    setFormData(emptyPart);
    setShowModal(true);
  };

  return (
    <div className="parts-page">
      <div className="page-header">
        <h2>Parts</h2>
        <button className="btn btn-primary" onClick={openNewModal}>
          + Add Part
        </button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search parts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
        <select
          className="filter-select"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading parts...</div>
        ) : parts.length === 0 ? (
          <div className="empty-state">
            <h3>No parts found</h3>
            <p>Add your first part to get started</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Part #</th>
                <th>Name</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Price</th>
                <th>On Hand</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {parts.map(part => (
                <tr key={part.id}>
                  <td><strong>{part.partNumber}</strong></td>
                  <td>
                    {part.name}
                    {part.description && (
                      <><br /><small style={{ color: 'var(--gray-500)' }}>{part.description.substring(0, 50)}</small></>
                    )}
                  </td>
                  <td>{part.category?.name || '-'}</td>
                  <td>{part.vendor?.name || '-'}</td>
                  <td>${part.unitPrice.toFixed(2)}</td>
                  <td>
                    <span className={`badge ${
                      part.inventory?.quantityOnHand === 0 ? 'badge-danger' :
                      part.inventory?.quantityOnHand <= part.inventory?.reorderPoint ? 'badge-warning' :
                      'badge-success'
                    }`}>
                      {part.inventory?.quantityOnHand || 0}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${part.isActive ? 'success' : 'gray'}`}>
                      {part.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(part)}>
                      Edit
                    </button>
                    <button
                      className={`btn btn-sm ${part.isActive ? 'btn-secondary' : 'btn-success'}`}
                      onClick={() => handleToggleActive(part.id)}
                    >
                      {part.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(part.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingPart ? 'Edit Part' : 'Add Part'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Part Number *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.partNumber}
                      onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Part Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows="2"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select
                      className="form-input"
                      value={formData.categoryId}
                      onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    >
                      <option value="">Select Category</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vendor</label>
                    <select
                      className="form-input"
                      value={formData.vendorId}
                      onChange={(e) => setFormData({ ...formData, vendorId: e.target.value })}
                    >
                      <option value="">Select Vendor</option>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">Unit Price</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.unitPrice}
                      onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Unit of Measure</label>
                    <select
                      className="form-input"
                      value={formData.unitOfMeasure}
                      onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value })}
                    >
                      <option value="EA">Each (EA)</option>
                      <option value="BOX">Box</option>
                      <option value="CASE">Case</option>
                      <option value="PKG">Package</option>
                      <option value="SET">Set</option>
                      <option value="FT">Feet</option>
                      <option value="M">Meters</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Barcode</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Manufacturer</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.manufacturer}
                      onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Manufacturer Part #</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.manufacturerPN}
                      onChange={(e) => setFormData({ ...formData, manufacturerPN: e.target.value })}
                    />
                  </div>
                </div>

                <h4 style={{ marginTop: '20px', marginBottom: '16px', color: 'var(--gray-700)' }}>
                  Inventory Settings
                </h4>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Initial Quantity</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.inventory.quantityOnHand}
                      onChange={(e) => setFormData({
                        ...formData,
                        inventory: { ...formData.inventory, quantityOnHand: parseInt(e.target.value) || 0 }
                      })}
                      min="0"
                      disabled={editingPart}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Location</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.inventory.location}
                      onChange={(e) => setFormData({
                        ...formData,
                        inventory: { ...formData.inventory, location: e.target.value }
                      })}
                      placeholder="e.g., Warehouse A, Bin 12"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Reorder Point</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.inventory.reorderPoint}
                      onChange={(e) => setFormData({
                        ...formData,
                        inventory: { ...formData.inventory, reorderPoint: parseInt(e.target.value) || 0 }
                      })}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reorder Quantity</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.inventory.reorderQuantity}
                      onChange={(e) => setFormData({
                        ...formData,
                        inventory: { ...formData.inventory, reorderQuantity: parseInt(e.target.value) || 0 }
                      })}
                      min="0"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingPart ? 'Update' : 'Create'} Part
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Parts;
