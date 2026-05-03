import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PopupApp } from "./App";
import "./popup.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Popup root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
