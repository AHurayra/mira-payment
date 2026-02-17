import React from "react";
import "./index.css"
import { Routes, Route, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import InvoicePage from "./pages/InvoicePage.jsx";
import PaySuccess from "./pages/PaySuccess.jsx";
import PayCancel from "./pages/PayCancel.jsx";
import StatusCheck from "./pages/StatusCheck.jsx";
import DashboardV2 from "./pages/DashboardV2.jsx";
import Customers from "./pages/Customers.jsx";
import NavBar from "./components/NavBar.jsx";

import AdminLogin from "./pages/AdminLogin.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";


export default function App() {
  return (
    <div>
      <NavBar />
      <section className="section">
        <Routes>
          <Route path="/" element={<StatusCheck />} />
          <Route path="/invoice/:payToken" element={<InvoicePage />} />
          <Route path="/pay/success" element={<PaySuccess />} />
          <Route path="/pay/cancel" element={<PayCancel />} />
          <Route path="/admin/login" element={<AdminLogin />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardV2 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute>
                <Customers />
              </ProtectedRoute>
            }
          />
        </Routes>
      </section>

      
    </div>
  );
}
