// LLaMA uyumlu modelin tarayıcıda ileri geçişi (Float32Array, bağımlılıksız).
// Python karşılığı: dil_modeli/layers.py ve model.py. Ağırlıklar export_web.py'nin yazdığı
// model.bin + manifest.json'dan okunur (float32 / float16 / int8 açılarak Float32Array olur).
// Her çağrı tek belirteç işler; geçmiş anahtar/değerler KV önbelleğinde tutulur.
// Genişletme: Python'da yeni bir katman seçeneği eklediyseniz `forward` içinde aynısını yazın;
// model.test.js logit eşliğini denetler.

export const FORMAT = 'dil-modeli-tarayici/1'

function halfToFloat(bits) {
  const sign = bits & 0x8000 ? -1 : 1
  const exponent = (bits >> 10) & 0x1f
  const fraction = bits & 0x3ff
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024)
  if (exponent === 31) return fraction ? NaN : sign * Infinity
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024)
}

/** Bildirimdeki bir tensörü Float32Array'e açar. */
export function decodeTensor(buffer, entry) {
  const count = entry.shape.reduce((a, b) => a * b, 1)
  const [offset, size] = entry.data
  if (entry.dtype === 'float32') return new Float32Array(buffer.slice(offset, offset + size))
  const out = new Float32Array(count)
  if (entry.dtype === 'float16') {
    const view = new DataView(buffer, offset, size)
    for (let i = 0; i < count; i++) out[i] = halfToFloat(view.getUint16(2 * i, true))
    return out
  }
  if (entry.dtype === 'int8') {
    const values = new Int8Array(buffer, offset, size)
    const scales = new Float32Array(buffer.slice(entry.scales[0], entry.scales[0] + entry.scales[1]))
    const columns = entry.shape[1]
    for (let i = 0; i < count; i++) out[i] = values[i] * scales[Math.floor(i / columns)]
    return out
  }
  throw new Error(`Bilinmeyen tensör türü: ${entry.dtype}`)
}

function matvec(weight, x, rows, columns, out) {
  for (let r = 0; r < rows; r++) {
    let sum = 0
    const base = r * columns
    for (let c = 0; c < columns; c++) sum += weight[base + c] * x[c]
    out[r] = sum
  }
  return out
}

function rmsnorm(x, weight, eps, out) {
  let sum = 0
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i]
  const scale = 1 / Math.sqrt(sum / x.length + eps)
  for (let i = 0; i < x.length; i++) out[i] = weight[i] * Math.fround(x[i] * scale)
  return out
}

export class Model {
  constructor(manifest, buffer) {
    if (manifest.format !== FORMAT) throw new Error(`Model biçimi tanınmadı: ${manifest.format}`)
    const c = manifest.model
    this.config = { ...c, headDim: c.dim / c.n_head, kvDim: (c.dim / c.n_head) * c.n_kv_head }
    this.special = manifest.special
    const w = {}
    for (const [name, entry] of Object.entries(manifest.tensors)) w[name] = decodeTensor(buffer, entry)
    this.w = w
    this.head = c.tie_embeddings ? w['embed.weight'] : w['head.weight']
    const half = this.config.headDim / 2
    this.cos = new Float32Array(c.max_seq_len * half)
    this.sin = new Float32Array(c.max_seq_len * half)
    for (let pos = 0; pos < c.max_seq_len; pos++) {
      for (let i = 0; i < half; i++) {
        // Python ile aynı float32 sırası: üs -> kuvvet -> ters (her adım float32'ye yuvarlanır).
        const power = Math.fround(c.rope_base ** Math.fround((2 * i) / this.config.headDim))
        const invFreq = Math.fround(1 / power)
        const angle = Math.fround(pos * invFreq)
        this.cos[pos * half + i] = Math.cos(angle)
        this.sin[pos * half + i] = Math.sin(angle)
      }
    }
    const { dim, hidden_dim: hidden, vocab_size: vocab } = c
    const kv = this.config.kvDim
    this.buf = {
      x: new Float32Array(dim),
      h: new Float32Array(dim),
      q: new Float32Array(dim),
      k: new Float32Array(kv),
      v: new Float32Array(kv),
      att: new Float32Array(dim),
      o: new Float32Array(dim),
      g: new Float32Array(hidden),
      u: new Float32Array(hidden),
      scores: new Float32Array(c.max_seq_len),
      logits: new Float32Array(vocab),
    }
  }

  newCache() {
    const { n_layer: layers, max_seq_len: length } = this.config
    const size = length * this.config.kvDim
    return {
      length: 0,
      keys: Array.from({ length: layers }, () => new Float32Array(size)),
      values: Array.from({ length: layers }, () => new Float32Array(size)),
    }
  }

  rope(vector, heads, pos) {
    const headDim = this.config.headDim
    const half = headDim / 2
    for (let h = 0; h < heads; h++) {
      const base = h * headDim
      for (let i = 0; i < half; i++) {
        const cos = this.cos[pos * half + i]
        const sin = this.sin[pos * half + i]
        const a = vector[base + i]
        const b = vector[base + i + half]
        vector[base + i] = a * cos - b * sin
        vector[base + i + half] = b * cos + a * sin
      }
    }
  }

  attention(layer, pos, cache) {
    const { n_head: heads, n_kv_head: kvHeads, headDim, kvDim } = this.config
    const { q, att, scores } = this.buf
    const keys = cache.keys[layer]
    const values = cache.values[layer]
    const group = heads / kvHeads
    const scale = 1 / Math.sqrt(headDim)
    for (let h = 0; h < heads; h++) {
      const kvBase = Math.floor(h / group) * headDim
      let max = -Infinity
      for (let t = 0; t <= pos; t++) {
        let dot = 0
        for (let i = 0; i < headDim; i++) dot += q[h * headDim + i] * keys[t * kvDim + kvBase + i]
        scores[t] = dot * scale
        if (scores[t] > max) max = scores[t]
      }
      let total = 0
      for (let t = 0; t <= pos; t++) {
        scores[t] = Math.exp(scores[t] - max)
        total += scores[t]
      }
      for (let i = 0; i < headDim; i++) {
        let sum = 0
        for (let t = 0; t <= pos; t++) sum += scores[t] * values[t * kvDim + kvBase + i]
        att[h * headDim + i] = sum / total
      }
    }
  }

  /** Tek belirteci işler, önbelleği bir ilerletir ve sözlük üzerindeki logitleri döndürür. */
  forward(token, cache) {
    const c = this.config
    const pos = cache.length
    if (pos >= c.max_seq_len) throw new Error('Bağlam doldu; önbelleği yenileyin.')
    const { x, h, q, k, v, att, o, g, u, logits } = this.buf
    const w = this.w
    x.set(w['embed.weight'].subarray(token * c.dim, (token + 1) * c.dim))
    for (let l = 0; l < c.n_layer; l++) {
      const p = `blocks.${l}.`
      rmsnorm(x, w[`${p}attn_norm.weight`], c.norm_eps, h)
      matvec(w[`${p}attn.q_proj.weight`], h, c.dim, c.dim, q)
      matvec(w[`${p}attn.k_proj.weight`], h, c.kvDim, c.dim, k)
      matvec(w[`${p}attn.v_proj.weight`], h, c.kvDim, c.dim, v)
      this.rope(q, c.n_head, pos)
      this.rope(k, c.n_kv_head, pos)
      cache.keys[l].set(k, pos * c.kvDim)
      cache.values[l].set(v, pos * c.kvDim)
      this.attention(l, pos, cache)
      matvec(w[`${p}attn.o_proj.weight`], att, c.dim, c.dim, o)
      for (let i = 0; i < c.dim; i++) x[i] += o[i]
      rmsnorm(x, w[`${p}mlp_norm.weight`], c.norm_eps, h)
      matvec(w[`${p}mlp.gate_proj.weight`], h, c.hidden_dim, c.dim, g)
      matvec(w[`${p}mlp.up_proj.weight`], h, c.hidden_dim, c.dim, u)
      for (let i = 0; i < c.hidden_dim; i++) g[i] = (g[i] / (1 + Math.exp(-g[i]))) * u[i]
      matvec(w[`${p}mlp.down_proj.weight`], g, c.dim, c.hidden_dim, o)
      for (let i = 0; i < c.dim; i++) x[i] += o[i]
    }
    rmsnorm(x, w['norm.weight'], c.norm_eps, h)
    matvec(this.head, h, c.vocab_size, c.dim, logits)
    cache.length = pos + 1
    return logits
  }
}

/** Bildirim + ikili dosyadan modeli kurar; SHA-256 ile bütünlüğü denetler (crypto varsa). */
export async function loadModel(manifest, buffer) {
  if (buffer.byteLength !== manifest.bytes) {
    throw new Error(`model.bin boyutu bildirimle uyuşmuyor (${buffer.byteLength} != ${manifest.bytes}).`)
  }
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
    if (hex !== manifest.sha256) throw new Error('model.bin bozuk ya da bildirime ait değil (SHA-256).')
  }
  return new Model(manifest, buffer)
}
