import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Vendors API
export const vendorsApi = {
  getAll: (params) => api.get('/vendors', { params }),
  getById: (id) => api.get(`/vendors/${id}`),
  create: (data) => api.post('/vendors', data),
  update: (id, data) => api.put(`/vendors/${id}`, data),
  delete: (id) => api.delete(`/vendors/${id}`),
  toggleActive: (id) => api.patch(`/vendors/${id}/toggle-active`)
};

// Categories API
export const categoriesApi = {
  getAll: () => api.get('/categories'),
  getTree: () => api.get('/categories/tree'),
  getById: (id) => api.get(`/categories/${id}`),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`)
};

// Parts API
export const partsApi = {
  getAll: (params) => api.get('/parts', { params }),
  getById: (id) => api.get(`/parts/${id}`),
  getByNumber: (partNumber) => api.get(`/parts/by-number/${partNumber}`),
  create: (data) => api.post('/parts', data),
  update: (id, data) => api.put(`/parts/${id}`, data),
  delete: (id) => api.delete(`/parts/${id}`),
  toggleActive: (id) => api.patch(`/parts/${id}/toggle-active`)
};

// Inventory API
export const inventoryApi = {
  getAll: (params) => api.get('/inventory', { params }),
  getLowStock: () => api.get('/inventory/low-stock'),
  getSummary: () => api.get('/inventory/summary'),
  getByPartId: (partId) => api.get(`/inventory/${partId}`),
  update: (partId, data) => api.put(`/inventory/${partId}`, data),
  adjust: (partId, data) => api.post(`/inventory/${partId}/adjust`, data),
  receive: (partId, data) => api.post(`/inventory/${partId}/receive`, data),
  ship: (partId, data) => api.post(`/inventory/${partId}/ship`, data),
  getLogs: (partId, params) => api.get(`/inventory/${partId}/logs`, { params }),
  count: (partId, data) => api.post(`/inventory/${partId}/count`, data)
};

// Orders API
export const ordersApi = {
  getAll: (params) => api.get('/orders', { params }),
  getSummary: () => api.get('/orders/summary'),
  getById: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
  update: (id, data) => api.put(`/orders/${id}`, data),
  delete: (id) => api.delete(`/orders/${id}`),
  addItem: (id, data) => api.post(`/orders/${id}/items`, data),
  removeItem: (id, itemId) => api.delete(`/orders/${id}/items/${itemId}`),
  updateStatus: (id, data) => api.patch(`/orders/${id}/status`, data),
  receivePartial: (id, data) => api.post(`/orders/${id}/receive-partial`, data)
};

// Dashboard API
export const dashboardApi = {
  get: () => api.get('/dashboard'),
  getInventoryValue: () => api.get('/dashboard/inventory-value'),
  getOrderTrends: (days) => api.get('/dashboard/order-trends', { params: { days } })
};

// Reorder API
export const reorderApi = {
  getAlerts: (params) => api.get('/reorder/alerts', { params }),
  getPendingAlerts: () => api.get('/reorder/alerts/pending'),
  check: () => api.post('/reorder/check'),
  processAlert: (id) => api.post(`/reorder/alerts/${id}/process`),
  dismissAlert: (id) => api.post(`/reorder/alerts/${id}/dismiss`),
  processAll: () => api.post('/reorder/process-all'),
  getSuggestions: () => api.get('/reorder/suggestions'),
  createOrders: (data) => api.post('/reorder/create-orders', data)
};

export default api;
