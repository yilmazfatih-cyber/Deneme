// fetch sarmalayıcı: yalnız göreli /api/... çağrıları; hata gövdesi {"error": {code, message, hint}} okunur ve bildirim gösterilir.
import { toast } from "./components.js";

export class ApiError extends Error {
  constructor(status, code, message, hint) {
    super(message);
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

async function request(method, url, body, { quiet = false, headers = {} } = {}) {
  const opts = { method, headers: { Accept: "application/json", ...headers } };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    const err = new ApiError(0, "network", "Sunucuya ulaşılamadı.", "Platform sürecinin çalıştığını kontrol edin.");
    if (!quiet) toast(err.message, "fail", err.hint);
    throw err;
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const e = (data && data.error) || {};
    let message = e.message;
    if (!message && data && data.detail) {
      message = Array.isArray(data.detail) ? data.detail.map((d) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join("; ") : String(data.detail);
    }
    const err = new ApiError(res.status, e.code || `http_${res.status}`, message || `İstek başarısız (${res.status}).`, e.hint || null);
    if (!quiet) toast(err.message, "fail", err.hint);
    throw err;
  }
  return data;
}

export const api = {
  get: (url, o) => request("GET", url, undefined, o),
  post: (url, body = {}, o) => request("POST", url, body, o),
  patch: (url, body = {}, o) => request("PATCH", url, body, o),
  del: (url, o) => request("DELETE", url, undefined, o),
};

/** Liste döndüren uçlar bazen {items: [...]} döner; ikisini de kabul et. */
export function asList(x) {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.items)) return x.items;
  if (x && Array.isArray(x.modules)) return x.modules;
  return [];
}

/** SSE aboneliği. onEvent(json) çağrılır; dönen fonksiyon akışı kapatır. */
export function subscribe(url, onEvent, onError) {
  const es = new EventSource(url);
  es.onmessage = (m) => {
    try { onEvent(JSON.parse(m.data)); } catch { /* yorum satırı vb. */ }
  };
  es.onerror = () => { if (onError) onError(); };
  return () => es.close();
}

/** Aynı anda en çok `limit` istek. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { __error: e }; }
    }
  });
  await Promise.all(workers);
  return out;
}
