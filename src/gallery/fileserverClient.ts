type VfsItem = { name?: unknown; type?: unknown };
const authFetch = async (path: string) => { const token = await window.VfsAuth.getAccessToken(); const response = await fetch(window.VfsWidget.downloadUrl(path, false), { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error(`VFS2: ${response.status}`); return response; };
export function createFileserverClient(_options: { apiBase: string }) { return {
  listDirectory: (path: string) => window.VfsWidget.list(path),
  createFolder: (path: string, name: string) => window.VfsWidget.mkdir(path ? `${path}/${name}` : name),
  uploadTextFile: (path: string, filename: string, content: string, contentType = "application/json") => window.VfsWidget.upload(path, new File([content], filename, { type: contentType })),
  uploadFile: (path: string, file: File) => window.VfsWidget.upload(path, file),
  async loadFileContent(path: string) { return { content: await (await authFetch(path)).text() }; },
  async loadRawFileText(path: string) { return (await authFetch(path)).text(); },
  saveFileContent(path: string, content: string) { const parts = path.split("/"); const name = parts.pop() || "mostra.json"; return window.VfsWidget.upload(parts.join("/"), new File([content], name, { type: "application/json" })); },
}; }
export function getFileserverDirectoryPath(filePath: string) { const p = String(filePath || "").replace(/^\/+|\/+$/g, ""); return p.split("/").slice(0, -1).join("/"); }
export function getFileserverBaseName(filePath: string) { return String(filePath || "").replace(/\/+$/g, "").split("/").pop() || ""; }
export function hasFileserverDirectoryChild(value: any, childName: string) { return Array.isArray(value?.items) && value.items.some((item: VfsItem) => item.type === "directory" && item.name === childName); }
export function extractFileserverFileNames(value: any) { return Array.isArray(value?.items) ? value.items.filter((item: VfsItem) => item.type === "file" && typeof item.name === "string").map((item: VfsItem) => String(item.name)) : []; }
export function extractFileserverTextContent(value: any) { if (typeof value === "string") return value; if (typeof value?.content === "string") return value.content; throw new Error("Risposta VFS2 non valida"); }
