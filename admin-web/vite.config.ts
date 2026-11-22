import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.MJ_TEST_API_TARGET || "http://127.0.0.1:18080",
        changeOrigin: false,
      },
    },
  },
});
