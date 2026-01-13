import React, { useState, useEffect } from 'react';
import { vendorsApi } from '../api';

function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('');

  const emptyVendor = {
    name: '',
    code: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'USA',
    website: '',
    notes: '',
    rating: 0,
    leadTimeDays: 7
  };

  const [formData, setFormData] = useState(emptyVendor);

  useEffect(() => {
    loadVendors();
  }, [search, filterActive]);

  const loadVendors = async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (filterActive) params.isActive = filterActive;
      const response = await vendorsApi.getAll(params);
      setVendors(response.data);
    } catch (error) {
      console.error('Failed to load vendors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingVendor) {
        await vendorsApi.update(editingVendor.id, formData);
      } else {
        await vendorsApi.create(formData);
      }
      setShowModal(false);
      setEditingVendor(null);
      setFormData(emptyVendor);
      loadVendors();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save vendor');
    }
  };

  const handleEdit = (vendor) => {
    setEditingVendor(vendor);
    setFormData(vendor);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this vendor?')) return;
    try {
      await vendorsApi.delete(id);
      loadVendors();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete vendor');
    }
  };

  const handleToggleActive = async (id) => {
    try {
      await vendorsApi.toggleActive(id);
      loadVendors();
    } catch (error) {
      alert('Failed to update vendor status');
    }
  };

  const openNewModal = () => {
    setEditingVendor(null);
    setFormData(emptyVendor);
    setShowModal(true);
  };

  return (
    <div className="vendors-page">
      <div className="page-header">
        <h2>Vendors</h2>
        <button className="btn btn-primary" onClick={openNewModal}>
          + Add Vendor
        </button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search vendors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading vendors...</div>
        ) : vendors.length === 0 ? (
          <div className="empty-state">
            <h3>No vendors found</h3>
            <p>Add your first vendor to get started</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Lead Time</th>
                <th>Rating</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map(vendor => (
                <tr key={vendor.id}>
                  <td><strong>{vendor.code}</strong></td>
                  <td>{vendor.name}</td>
                  <td>{vendor.contactName || '-'}</td>
                  <td>{vendor.email || '-'}</td>
                  <td>{vendor.phone || '-'}</td>
                  <td>{vendor.leadTimeDays} days</td>
                  <td>{'*'.repeat(vendor.rating || 0)}</td>
                  <td>
                    <span className={`badge badge-${vendor.isActive ? 'success' : 'gray'}`}>
                      {vendor.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(vendor)}>
                      Edit
                    </button>
                    <button
                      className={`btn btn-sm ${vendor.isActive ? 'btn-secondary' : 'btn-success'}`}
                      onClick={() => handleToggleActive(vendor.id)}
                    >
                      {vendor.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(vendor.id)}>
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
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Vendor Code *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vendor Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Contact Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-input"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Website</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Zip Code</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.zipCode}
                      onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Lead Time (days)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.leadTimeDays}
                      onChange={(e) => setFormData({ ...formData, leadTimeDays: parseInt(e.target.value) || 0 })}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Rating (0-5)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.rating}
                      onChange={(e) => setFormData({ ...formData, rating: parseInt(e.target.value) || 0 })}
                      min="0"
                      max="5"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-input"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows="3"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingVendor ? 'Update' : 'Create'} Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Vendors;
