import { createRoot } from "react-dom/client";
import { Provider } from "jotai";
import App from "./App";
import "./index.css";

// Apply theme immediately before React renders to prevent flash
const savedTheme = localStorage.getItem("chimera-theme");
// atomWithStorage wraps value in JSON, so we need to parse it
const theme = savedTheme ? JSON.parse(savedTheme) : "dark";
document.documentElement.classList.add(`theme-${theme}`);

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <Provider>
      <App />
    </Provider>
  );
}
