type FileserverClientOptions = {
  apiBase: string;
};

type FileserverErrorBody = {
  error?: unknown;
};

type FileserverFileContentResponse = {
  content?: unknown;
};

type FileserverDirectoryItem = {
  name?: unknown;
  type?: unknown;
};

type FileserverDirectoryResponse = {
  items?: unknown;
};

function trimTrailingSlash(value: string): string {
  return String(value || "").replace(/\/+$/, "");
}

function toQuery(params: Record<string, string>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    query.set(key, value);
  });
  return query.toString();
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as FileserverErrorBody;
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Ignore invalid JSON error bodies.
  }
  return `Request failed: ${response.status}`;
}

async function api(apiBase: string, path: string, requestOptions?: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBase}${path}`, requestOptions);
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export function createFileserverClient(options: FileserverClientOptions) {
  const apiBase = trimTrailingSlash(options.apiBase || "/api");

  return {
    listDirectory(path: string) {
      return api(apiBase, `/list?${toQuery({ path })}`);
    },
    createFolder(path: string, name: string) {
      return api(apiBase, "/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, name }),
      });
    },
    async uploadTextFile(path: string, filename: string, content: string, contentType = "application/json") {
      return this.uploadFile(path, new File([content], filename, { type: contentType }));
    },
    async uploadFile(path: string, file: File) {
      const formData = new FormData();
      formData.append("path", path);
      formData.append("files", file);

      const response = await fetch(`${apiBase}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }
      const responseType = response.headers.get("content-type") || "";
      if (responseType.includes("application/json")) {
        return response.json();
      }
      return response.text();
    },
    loadFileContent(path: string) {
      return api(apiBase, `/file-content?${toQuery({ path })}`);
    },
    async loadRawFileText(path: string) {
      const response = await fetch(`${apiBase}/raw?${toQuery({ path })}`);
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }
      return response.text();
    },
    saveFileContent(path: string, content: string) {
      return api(apiBase, "/file-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
    },
  };
}

export function getFileserverDirectoryPath(filePath: string): string {
  const normalized = String(filePath || "").trim().replace(/\/+/g, "/").replace(/\/$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) {
    return lastSlash === 0 ? "/" : "";
  }
  return normalized.slice(0, lastSlash);
}

export function getFileserverBaseName(filePath: string): string {
  const normalized = String(filePath || "").trim().replace(/\/+/g, "/").replace(/\/$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) {
    return normalized;
  }
  return normalized.slice(lastSlash + 1);
}

export function hasFileserverDirectoryChild(value: unknown, childName: string): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const items = (value as FileserverDirectoryResponse).items;
  if (!Array.isArray(items)) {
    return false;
  }
  return items.some((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const entry = item as FileserverDirectoryItem;
    return entry.type === "directory" && entry.name === childName;
  });
}

export function extractFileserverFileNames(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const items = (value as FileserverDirectoryResponse).items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .filter((item): item is FileserverDirectoryItem => Boolean(item) && typeof item === "object")
    .filter((item) => item.type === "file" && typeof item.name === "string" && item.name.trim())
    .map((item) => String(item.name));
}

export function extractFileserverTextContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && typeof (value as FileserverFileContentResponse).content === "string") {
    return (value as FileserverFileContentResponse).content as string;
  }
  throw new Error("Risposta file-content non valida");
}
