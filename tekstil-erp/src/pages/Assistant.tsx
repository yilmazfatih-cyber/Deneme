import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSettings } from '../db';
import type { LlmSettings } from '../db/schema';
import { Alert, Badge, Card, PageHead } from '../components/ui';
import { ask, buildContext, type AssistantContext } from '../ai/assistant';
import type { ChatMessage } from '../ai/llm';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  source?: 'llm' | 'local';
  model?: string;
  error?: string;
}

const SUGGESTIONS = [
  'Bu ay nakit durumu nasıl?',
  'Vadesi geçen alacaklar kimde?',
  'Önümüzdeki 3 ay tahmini',
  'Şüpheli faturalar var mı?',
  'Kritik stoklar',
  'Geciken üretim emirleri',
  'Gider dağılımı nasıl?',
  'Açık siparişler',
];

export default function Assistant() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', text: 'Merhaba. Finans, stok, üretim, sipariş ve ziyaretçi verileriniz hakkında soru sorabilirsiniz. Yanıtlar bu cihazdaki verilerden üretilir.', source: 'local' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [llm, setLlm] = useState<LlmSettings | null>(null);
  const [ctx, setCtx] = useState<AssistantContext | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getSettings().then((s) => setLlm(s.llm));
    void buildContext().then(setCtx);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const history: ChatMessage[] = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.text }));
      const fresh = await buildContext(); // her soruda güncel veri
      setCtx(fresh);
      const a = await ask(q, history, fresh);
      setMsgs((m) => [...m, { role: 'assistant', text: a.text, source: a.source, model: a.model, error: a.error }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', text: 'Yanıt üretilemedi.', source: 'local', error: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  const llmOn = llm && llm.provider !== 'none';

  return (
    <>
      <PageHead title="AI asistan" subtitle="İşletme verileriniz üzerinden Türkçe soru-cevap. Mali müşavirin yerini almaz; karar desteği sağlar." />
      {llm && !llmOn && (
        <div style={{ marginBottom: 14 }}>
          <Alert tone="info">
            Dil modeli bağlı değil; yanıtlar yerel kural tabanlı analizden geliyor. Daha doğal yanıtlar için <Link to="/ayarlar"><u>Ayarlar</u></Link>'dan Ollama veya OpenAI uyumlu bir uç nokta bağlayın. Bağlı değilken de yerel analiz çalışır.
          </Alert>
        </div>
      )}
      {llmOn && (
        <div style={{ marginBottom: 14 }}>
          <Alert tone="good">LLM bağlı: {llm.model} ({llm.baseUrl}). Hata olursa yerel analize düşülür.</Alert>
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 280px' }}>
        <Card>
          <div className="chat" style={{ maxHeight: 520, minHeight: 320 }}>
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
                {m.text}
                {m.role === 'assistant' && m.source && (
                  <div style={{ marginTop: 8 }}>
                    <Badge tone={m.source === 'llm' ? 'good' : 'neutral'}>{m.source === 'llm' ? `LLM: ${m.model}` : 'Yerel analiz'}</Badge>
                    {m.error && <span className="tiny" style={{ marginLeft: 8, color: 'var(--warn)' }}>LLM hatası, yerel yanıt verildi: {m.error}</span>}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="msg ai muted">Düşünüyor…</div>}
            <div ref={endRef} />
          </div>
          <form
            className="row"
            style={{ marginTop: 12 }}
            onSubmit={(e) => { e.preventDefault(); void send(input); }}
          >
            <input
              className="input"
              style={{ flex: 1 }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Sorunuzu yazın… (Enter ile gönder)"
              aria-label="Soru"
              disabled={busy}
            />
            <button className="btn primary" type="submit" disabled={busy || !input.trim()}>Gönder</button>
          </form>
          <div className="chips" style={{ marginTop: 10 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => void send(s)} disabled={busy}>{s}</button>
            ))}
          </div>
        </Card>
        <Card title="Bağlam" subtitle="Asistanın gördüğü özet">
          {ctx ? (
            <dl className="kv small">
              <dt>Fatura</dt><dd>{ctx.invoiceCount}</dd>
              <dt>Şüpheli kayıt</dt><dd>{ctx.anomalies.length}</dd>
              <dt>Vadesi geçen alacak</dt><dd>{ctx.overdueReceivables.length}</dd>
              <dt>Kritik stok</dt><dd>{ctx.lowStock.length} ürün</dd>
              <dt>Geciken üretim</dt><dd>{ctx.lateProduction.length} emir</dd>
              <dt>Açık sipariş</dt><dd>{ctx.openOrders.length}</dd>
              <dt>Ziyaretçi (7 gün)</dt><dd>{ctx.visitors7d.total}</dd>
            </dl>
          ) : (
            <p className="muted small">Yükleniyor…</p>
          )}
          <p className="tiny" style={{ marginTop: 12 }}>LLM kullanılıyorsa yalnızca bu özet (toplamlar ve ilk birkaç kayıt) gönderilir; belgeler ve ham veriler cihazda kalır.</p>
        </Card>
      </div>
    </>
  );
}
