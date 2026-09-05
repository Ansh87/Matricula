// ProtectedRoute.jsx - renders children only when signed in; otherwise the login
// screen. While auth state is resolving, shows a lightweight loading state.
import React from "react";
import { useAuth } from "./AuthProvider.jsx";
import { Login } from "./Login.jsx";

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div className="note">Loading…</div>
      </div>
    );
  }
  if (!user) return <Login />;
  return children;
}
