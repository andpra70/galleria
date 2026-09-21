import { defineConfig, loadEnv, type ProxyOptions } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const productionServicesUrl = env.GALLERIA_PROXY_TARGET || "https://127.0.0.1:8443";
  const productionServicesHost = env.VITE_BACKEND_HOST || "belle.iliadboxos.it";
  const verifyProxyCertificate = env.GALLERIA_PROXY_SECURE === "true";
  const productionProxy: ProxyOptions = {
    target: productionServicesUrl,
    changeOrigin: true,
    secure: verifyProxyCertificate,
    xfwd: true,
    cookieDomainRewrite: "",
    autoRewrite: true,
    headers: { host: productionServicesHost },
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
