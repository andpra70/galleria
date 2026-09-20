import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "esnext" },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  base: "./",
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    open: false,
    proxy: {
      "/fileserver/api": {
        target: "https://zanotti.iliadboxos.it:55443",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
