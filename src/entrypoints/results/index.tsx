import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ResultsApp } from "./App";
import "./results.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ResultsApp />
  </StrictMode>,
);
