declare global { interface Window { VfsAuth: any; VfsWidget: any; VFS_AUTH_BASE_URL?: string; } }
function load(src: string, key: "VfsAuth" | "VfsWidget") { if (window[key]) return Promise.resolve(); return new Promise<void>((resolve, reject) => { const script = document.createElement("script"); script.src = src; script.onload = () => resolve(); script.onerror = () => reject(new Error(`Impossibile caricare ${src}`)); document.head.appendChild(script); }); }
export async function requireOAuthVfs() {
  if (import.meta.env.DEV) {
    const productionOrigin = (import.meta.env.VITE_PRODUCTION_SERVICES_URL || "https://belle.iliadboxos.it").replace(/\/+$/, "");
    window.VFS_AUTH_BASE_URL = `${productionOrigin}/auth/api`;
  }
  await load("/auth/widget.js", "VfsAuth");
  await load("/vfs/widget.js", "VfsWidget");
  try { await window.VfsAuth.getAccessToken(); } catch { window.VfsAuth.login(); await new Promise(() => {}); }
}
