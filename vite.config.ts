import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 版本号只有一个真源：package.json（tauri.conf.json 与它同版本）。
// 之前界面里硬写 "v2.0"，而实际版本是 0.2.0。
const pkgVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8")).version;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-tiptap': ['@tiptap/react', '@tiptap/starter-kit'],
          'vendor-katex': ['katex'],
          'vendor-mermaid': ['mermaid'],
          'vendor-graph': ['react-force-graph-2d'],
        },
      },
    },
  },
});
