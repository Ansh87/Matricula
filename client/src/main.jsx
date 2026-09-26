import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import { ProtectedRoute } from "./auth/ProtectedRoute.jsx";
import { SubscriptionProvider } from "./subscription/SubscriptionProvider.jsx";
import { isNativeIOS } from "./lib/platform.js";
import "./styles.css";

// Native iOS app only: tag the document so native-specific CSS (safe areas,
// bottom tab bar) applies, and let content extend under the notch/home
// indicator so those safe-area insets can be handled in CSS. The website's
// <html> and viewport are left exactly as they were.
if (isNativeIOS) {
  document.documentElement.classList.add("native-ios");
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute("content", "width=device-width, initial-scale=1.0, viewport-fit=cover");
}

createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <SubscriptionProvider>
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    </SubscriptionProvider>
  </AuthProvider>
);
