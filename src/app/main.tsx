import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ReaderApp } from "./reader/ReaderApp";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <ReaderApp />
  </StrictMode>,
);
