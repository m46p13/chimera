import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@codemirror") || id.includes("@lezer")) return "vendor-codemirror";
          if (id.includes("@xterm")) return "vendor-xterm";
          if (id.includes("highlight.js")) return "vendor-highlight";
          if (
            id.includes("react-markdown") ||
            id.includes("remark-gfm") ||
            id.includes("/micromark") ||
            id.includes("/remark-") ||
            id.includes("/rehype-") ||
            id.includes("/mdast-") ||
            id.includes("/hast-") ||
            id.includes("/unist-") ||
            id.includes("/unified") ||
            id.includes("/vfile")
          ) {
            return "vendor-markdown";
          }
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/jotai/")) return "vendor-react";
          return;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer")
    }
  },
  server: {
    port: 3456,
    strictPort: true
  }
});
