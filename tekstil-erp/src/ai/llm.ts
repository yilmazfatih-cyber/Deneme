/**
 * İsteğe bağlı LLM köprüsü — OpenAI uyumlu /chat/completions.
 * Ollama (https://github.com/ollama/ollama) yerelde `ollama serve` ile aynı arayüzü /v1 altında sunar;
 * LM Studio, vLLM, llama.cpp server da uyumludur. Ayarlar → provider 'none' ise hiçbir istek atılmaz.
 */
import type { LlmSettings } from '../db/schema';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class LlmError extends Error {}

function toTurkishError(e: unknown, settings: LlmSettings): LlmError {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof DOMException && e.name === 'AbortError') return new LlmError('LLM yanıtı zaman aşımına uğradı (60 sn).');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    const hint =
      settings.provider === 'ollama'
        ? ' Ollama çalışıyor mu? Tarayıcıdan erişim için `OLLAMA_ORIGINS=* ollama serve` ile başlatın.'
        : ' Uç noktaya ulaşılamadı; adresi ve CORS ayarını kontrol edin.';
    return new LlmError(`LLM bağlantısı kurulamadı (${settings.baseUrl}).${hint}`);
  }
  if (/401|403/.test(msg)) return new LlmError('LLM yetkilendirme hatası: API anahtarını kontrol edin.');
  if (/404/.test(msg)) return new LlmError(`Model veya uç nokta bulunamadı: ${settings.model} @ ${settings.baseUrl}`);
  return new LlmError(`LLM hatası: ${msg}`);
}

export async function chat(
  messages: ChatMessage[],
  settings: LlmSettings,
  opts: { json?: boolean; signal?: AbortSignal; temperature?: number } = {},
): Promise<string | null> {
  if (!settings || settings.provider === 'none' || !settings.baseUrl || !settings.model) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  opts.signal?.addEventListener('abort', () => controller.abort());
  try {
    const base = settings.baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: opts.temperature ?? 0.2,
        stream: false,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content?.trim() ?? '';
  } catch (e) {
    throw toTurkishError(e, settings);
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(settings: LlmSettings): Promise<{ ok: boolean; message: string }> {
  if (settings.provider === 'none') return { ok: false, message: 'LLM kapalı (provider: none).' };
  try {
    const started = performance.now();
    const text = await chat(
      [{ role: 'user', content: 'Sadece "tamam" yaz.' }],
      settings,
      { temperature: 0 },
    );
    const ms = Math.round(performance.now() - started);
    return { ok: true, message: `Bağlantı başarılı (${ms} ms). Model yanıtı: "${(text ?? '').slice(0, 40)}"` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
