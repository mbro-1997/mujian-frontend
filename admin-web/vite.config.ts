import { defineConfig } from "vite";
import { realnamePhotoResources } from "./realname-photo-dev";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue(), realnamePhotoResources()],
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
