import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
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
