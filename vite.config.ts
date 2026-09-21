import { defineConfig, loadEnv, type ProxyOptions } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const productionServicesUrl = env.GALLERIA_PROXY_TARGET || "https://belle.iliadboxos.it";
  const productionProxy: ProxyOptions = {
    target: productionServicesUrl,
    changeOrigin: true,
    secure: true,
    xfwd: true,
    cookieDomainRewrite: "",
    autoRewrite: true,
  };

  return {
    base: env.VITE_APP_BASE || "/",
    build: { target: "esnext" },
    preview: {
      host: "0.0.0.0",
      allowedHosts: true,
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      open: false,
      proxy: {
        "/auth": { ...productionProxy },
        "/vfs": { ...productionProxy },
        "/fileserver": { ...productionProxy },
      },
    },
  };
});
