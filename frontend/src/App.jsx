
import { Navigate, Route, Routes } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import Menu from "./pages/Menu";
import QR from "./pages/QR";
import ManagerOrders from "./pages/ManagerOrders";
import Settings from "./pages/Settings";
import CustomerMenu from "./pages/CustomerMenu";

function ProtectedRoute({ children }) {
  const token =
    localStorage.getItem("smartserverhub_token") ||
    localStorage.getItem("token");

  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/menu"
        element={
          <ProtectedRoute>
            <Menu />
          </ProtectedRoute>
        }
      />

      <Route
        path="/qr"
        element={
          <ProtectedRoute>
            <QR />
          </ProtectedRoute>
        }
      />
      <Route
  path="/orders"
  element={
    <ProtectedRoute>
      <ManagerOrders />
    </ProtectedRoute>
  }
/>
<Route
  path="/settings"
  element={
    <ProtectedRoute>
      <Settings />
    </ProtectedRoute>
  }
/>
<Route path="/customer-menu" element={<CustomerMenu />} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

