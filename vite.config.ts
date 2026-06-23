import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = Bun.env.API_PORT ?? Bun.env.PORT ?? "8787";
const webPort = Number(Bun.env.WEB_PORT ?? "5173");

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: webPort,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
});
