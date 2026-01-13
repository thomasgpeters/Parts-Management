import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Vendors from './pages/Vendors';
import Parts from './pages/Parts';
import Inventory from './pages/Inventory';
import Orders from './pages/Orders';
import Reorder from './pages/Reorder';
import './App.css';

function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>Parts Manager</h1>
        </div>
        <ul className="nav-links">
          <li>
            <NavLink to="/" end>
              <span className="icon">&#9632;</span>
              Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink to="/vendors">
              <span className="icon">&#9670;</span>
              Vendors
            </NavLink>
          </li>
          <li>
            <NavLink to="/parts">
              <span className="icon">&#9654;</span>
              Parts
            </NavLink>
          </li>
          <li>
            <NavLink to="/inventory">
              <span className="icon">&#9635;</span>
              Inventory
            </NavLink>
          </li>
          <li>
            <NavLink to="/orders">
              <span className="icon">&#9633;</span>
              Orders
            </NavLink>
          </li>
          <li>
            <NavLink to="/reorder">
              <span className="icon">&#8635;</span>
              Auto Reorder
            </NavLink>
          </li>
        </ul>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/parts" element={<Parts />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/reorder" element={<Reorder />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
