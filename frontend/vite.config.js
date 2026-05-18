/* global process */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const enableHmr = env.VITE_ENABLE_HMR === "true";

  return {
    plugins: [react()],
    test: {
      exclude: ['**/node_modules/**', '**/tests/e2e/**'],
    },
    base: "/",
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      hmr: enableHmr
        ? {
            host: "127.0.0.1",
            protocol: "ws",
          }
        : false,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8080",
          changeOrigin: true,
        },
      },
    },
  };
});
