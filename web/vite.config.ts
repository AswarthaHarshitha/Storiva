import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the API runs separately; proxying keeps requests same-origin so the
    // session cookie behaves exactly as it does in production.
    proxy: { "/api": "http://localhost:4000" },
  },
});
