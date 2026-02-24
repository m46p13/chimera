import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "jotai";
import App from "./App";
import "./index.css";

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
  stack?: string;
};

class RuntimeErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: "",
    stack: undefined,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || "Unknown renderer error",
      stack: error?.stack,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Renderer] Uncaught error boundary", error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "#0b0d0f",
            color: "#e5e7eb",
            fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <div style={{ width: "min(860px, 100%)", border: "1px solid #30363d", borderRadius: 10, padding: 16, background: "#111418" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Chimera renderer crashed</h2>
            <p style={{ margin: "0 0 10px", opacity: 0.85 }}>Open a GitHub issue with the error below.</p>
            <pre
              style={{
                margin: "0 0 12px",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #2a2f36",
                background: "#0d1117",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
              }}
            >
              {this.state.message}
              {this.state.stack ? `\n\n${this.state.stack}` : ""}
            </pre>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{
                  border: "1px solid #4b5563",
                  borderRadius: 8,
                  padding: "6px 10px",
                  background: "#111827",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
              <button
                style={{
                  border: "1px solid #4b5563",
                  borderRadius: 8,
                  padding: "6px 10px",
                  background: "#111827",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
                onClick={() =>
                  navigator.clipboard?.writeText(
                    `${this.state.message}${this.state.stack ? `\n\n${this.state.stack}` : ""}`
                  )
                }
              >
                Copy Error
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Apply theme immediately before React renders to prevent flash
const savedTheme = localStorage.getItem("chimera-theme");
// atomWithStorage wraps value in JSON, so we need to parse it
const theme = savedTheme ? JSON.parse(savedTheme) : "dark";
document.documentElement.classList.add(`theme-${theme}`);

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <Provider>
      <RuntimeErrorBoundary>
        <App />
      </RuntimeErrorBoundary>
    </Provider>
  );
}
