import { useEffect, useState } from 'react';
import { Alert, Card, Field, PageHead } from '../components/ui';
import { clearAll, db, exportAll, getSettings, importAll, saveSettings } from '../db';
import type { AppSettings, Currency, LlmSettings } from '../db/schema';
import { seedDemo } from '../db/seed';
import { testConnection } from '../ai/llm';

type Theme = 'auto' | 'light' | 'dark';

export function applyTheme(theme: Theme) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* özel pencere */
  }
}

export default function Settings() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('theme') as Theme) || 'auto';
    } catch {
      return 'auto';
    }
  });
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    void getSettings().then(setS);
    void Promise.all(db.tables.map(async (t) => [t.name, await t.count()] as const)).then((rows) => setCounts(Object.fromEntries(rows)));
  }, []);

  if (!s) return <p className="muted">Yükleniyor…</p>;

  const patchLlm = (p: Partial<LlmSettings>) => setS({ ...s, llm: { ...s.llm, ...p } });

  async function save() {
    await saveSettings(s!);
    setMsg({ tone: 'good', text: 'Ayarlar kaydedildi.' });
  }

  async function test() {
    setMsg({ tone: 'info', text: 'Bağlantı deneniyor…' });
    const r = await testConnection(s!.llm);
    setMsg(r.ok ? { tone: 'good', text: `Bağlandı: ${r.message}` } : { tone: 'bad', text: r.message });
  }

  async function doExport() {
    const json = await exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tekstil-erp-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImport(file: File) {
    if (!window.confirm('Mevcut veriler yedekteki verilerle değiştirilecek. Devam edilsin mi?')) return;
    try {
      await importAll(await file.text());
      setMsg({ tone: 'good', text: 'Yedek yüklendi. Sayfayı yenileyin.' });
    } catch (e) {
      setMsg({ tone: 'bad', text: `Yedek okunamadı: ${(e as Error).message}` });
    }
  }

  async function resetDemo() {
    if (!window.confirm('Tüm veriler silinip demo verisi yeniden yüklenecek. Devam edilsin mi?')) return;
    await clearAll();
    await seedDemo();
    setMsg({ tone: 'good', text: 'Demo verisi yeniden yüklendi.' });
  }

  async function wipe() {
    if (!window.confirm('TÜM veriler kalıcı olarak silinecek. Önce yedek aldınız mı? Devam edilsin mi?')) return;
    await clearAll();
    await saveSettings({ seeded: true });
    setMsg({ tone: 'good', text: 'Tüm veriler silindi.' });
  }

  return (
    <>
      <PageHead title="Ayarlar" subtitle="Şirket bilgileri, yapay zekâ bağlantısı, görünüm ve veri yönetimi" />
      {msg && <div style={{ marginBottom: 16 }}><Alert tone={msg.tone}>{msg.text}</Alert></div>}

      <Card title="Şirket" subtitle="Fatura çıkarımında satıcı/alıcı ayrımı için kullanılır">
        <div className="form-grid">
          <Field label="Şirket unvanı"><input className="input" value={s.companyName} onChange={(e) => setS({ ...s, companyName: e.target.value })} /></Field>
          <Field label="VKN"><input className="input" value={s.taxNo ?? ''} onChange={(e) => setS({ ...s, taxNo: e.target.value })} /></Field>
          <Field label="Varsayılan para birimi">
            <select className="input" value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value as Currency })}>
              <option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option>
            </select>
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Adres"><textarea className="input" value={s.address ?? ''} onChange={(e) => setS({ ...s, address: e.target.value })} /></Field>
        </div>
      </Card>

      <Card title="Yapay zekâ modelleri" subtitle="OCR, PDF ve kamera modelleri cihazda çalışır. Dil modeli (LLM) isteğe bağlıdır.">
        <Alert tone="info">
          <strong>Cihazda çalışan açık modeller:</strong> Tesseract.js (OCR, Türkçe), PDF.js (PDF metin), TensorFlow.js COCO-SSD (kişi algılama).
          Finans analizleri (sınıflandırma, tahmin, anomali) kural ve istatistik tabanlıdır; internet gerektirmez.
          <br />
          <strong>İsteğe bağlı LLM:</strong> Yerel <code>Ollama</code> (örn. <code>qwen2.5:7b</code>, <code>llama3.1</code>) ya da OpenAI uyumlu herhangi bir uç nokta.
          Ollama için tarayıcıdan erişim: <code>OLLAMA_ORIGINS=* ollama serve</code>.
        </Alert>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="Sağlayıcı">
            <select className="input" value={s.llm.provider} onChange={(e) => patchLlm({ provider: e.target.value as LlmSettings['provider'] })}>
              <option value="none">Kapalı (yalnızca yerel analiz)</option>
              <option value="ollama">Ollama (yerel)</option>
              <option value="openai-compatible">OpenAI uyumlu API</option>
            </select>
          </Field>
          <Field label="Uç nokta (base URL)" hint="Ollama: http://localhost:11434/v1"><input className="input" value={s.llm.baseUrl} onChange={(e) => patchLlm({ baseUrl: e.target.value })} /></Field>
          <Field label="Model"><input className="input" value={s.llm.model} onChange={(e) => patchLlm({ model: e.target.value })} /></Field>
          <Field label="API anahtarı (gerekirse)"><input className="input" type="password" value={s.llm.apiKey ?? ''} onChange={(e) => patchLlm({ apiKey: e.target.value })} /></Field>
          <Field label="OCR dilleri" hint="Tesseract dil kodları"><input className="input" value={s.ocrLanguages} onChange={(e) => setS({ ...s, ocrLanguages: e.target.value })} /></Field>
          <Field label="Kamera örnekleme (sn)"><input className="input" type="number" min={1} max={30} value={s.cameraSampleIntervalSec} onChange={(e) => setS({ ...s, cameraSampleIntervalSec: Number(e.target.value) || 2 })} /></Field>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={() => void save()}>Kaydet</button>
          <button className="btn" disabled={s.llm.provider === 'none'} onClick={() => void test()}>Bağlantıyı test et</button>
        </div>
      </Card>

      <Card title="Görünüm">
        <div className="chips">
          {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} className={`chip ${theme === t ? 'active' : ''}`} onClick={() => { setTheme(t); applyTheme(t); }}>
              {t === 'auto' ? 'Sistem' : t === 'light' ? 'Açık' : 'Koyu'}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Veri yönetimi" subtitle="Veriler yalnızca bu tarayıcıda saklanır. Düzenli yedek alın.">
        <div className="kv" style={{ marginBottom: 12 }}>
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </div>
        <div className="row">
          <button className="btn" onClick={() => void doExport()}>Yedeği indir (JSON)</button>
          <label className="btn">
            Yedek yükle
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
          </label>
          <button className="btn" onClick={() => void resetDemo()}>Demo verisini yeniden yükle</button>
          <button className="btn danger" onClick={() => void wipe()}>Tüm verileri sil</button>
        </div>
      </Card>
    </>
  );
}
