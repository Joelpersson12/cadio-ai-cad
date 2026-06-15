import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import DesktopBuilderOverlay from "./components/DesktopBuilderOverlay";
import "./styles/index.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
      <DesktopBuilderOverlay />
    </React.StrictMode>,
  );
}
