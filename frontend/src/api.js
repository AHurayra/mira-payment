export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4242";

async function readJson(res) {
  const text = await res.text();
  try {
    return { ok: res.ok, data: text ? JSON.parse(text) : null, raw: text };
  } catch {
    return { ok: res.ok, data: null, raw: text };
  }
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
  });
  const out = await readJson(res);
  if (!out.ok) throw new Error(out.data?.error || out.raw || "Request failed");
  return out.data;
}

export async function apiPatch(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await readJson(res);
  if (!out.ok) throw new Error(out.data?.error || out.raw || "Request failed");
  return out.data;
}

export async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await readJson(res);
  if (!out.ok) throw new Error(out.data?.error || out.raw || "Request failed");
  return out.data;
}
