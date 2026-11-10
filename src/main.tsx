import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./styles/reset.css";
import "./styles/styles.css";
import "./styles/workshop.css";

const root = document.getElementById("root");
if (!root) throw new Error("The #root element is missing from index.html.");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// The service worker lets the installed app open without a connection. Development skips it so
// every reload shows the latest code.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => console.error("Could not register the service worker:", error));
  });
}
