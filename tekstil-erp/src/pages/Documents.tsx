import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import {
  DOCUMENT_KINDS,
  FINANCE_CATEGORIES,
  type Currency,
  type DocumentKind,
  type FinanceCategory,
  type Invoice,
  type InvoiceExtraction,
  type InvoiceType,
  type StoredDocument,
} from '../db/schema';
import { Alert, Badge, Card, Empty, Field, Modal, PageHead, Progress, confirmDelete, type Tone } from '../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fromInputDate, toInputDate } from '../lib/format';
import { docNo, uid } from '../lib/id';
import { recognizeImage } from '../ai/ocr';
import { extractPdf, makeThumb } from '../ai/pdf';
import { parseInvoiceText } from '../ai/invoiceParser';
import { postInvoiceJournal } from '../ai/finance';

type Phase = 'bekliyor' | 'okunuyor' | 'hazir' | 'hata' | 'kaydedildi';

interface Job {
  id: string;
  file: File;
  phase: Phase;
  status: string;
  progress: number;
  text?: string;
  pages?: number;
  ocrConfidence?: number;
  usedOcr?: boolean;
  previewUrl?: string;
  extraction?: InvoiceExtraction;
  error?: string;
}

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const confTone = (c: number): Tone => (c >= 0.75 ? 'good' : c >= 0.5 ? 'warn' : 'bad');
const r2 = (n: number) => Math.round(n * 100) / 100;

async function imageThumb(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  return makeThumb(c, 240);
}

export default function Documents() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState('');
  const [view, setView] = useState<StoredDocument | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const docs = useLiveQuery(() => db.documents.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const invoices = useLiveQuery(() => db.invoices.toArray(), []);
  const invMap = useMemo(() => new Map((invoices ?? []).map((i) => [i.id, i])), [invoices]);

  const patch = useCallback((id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j))), []);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /pdf|image\//.test(f.type) || /\.(pdf|jpe?g|png|webp)$/i.test(f.name));
    setJobs((js) => [...list.map((file) => ({ id: uid('job'), file, phase: 'bekliyor' as Phase, status: 'Sırada', progress: 0 })), ...js]);
  };

  // Sıradaki işleri tek tek işle (OCR worker tek örnek)
  useEffect(() => {
    const next = jobs.find((j) => j.phase === 'bekliyor');
    if (!next || busyRef.current) return;
    busyRef.current = true;
    (async () => {
      patch(next.id, { phase: 'okunuyor', status: 'Başlıyor', progress: 0 });
      try {
        const settings = await getSettings();
        const onProgress = (info: { status: string; progress: number }) => patch(next.id, { status: info.status, progress: info.progress });
        const isPdf = next.file.type === 'application/pdf' || /\.pdf$/i.test(next.file.name);
        let text = '';
        let pages = 1;
        let conf = 0;
        let usedOcr = false;
        let previewUrl: string | undefined;
        if (isPdf) {
          patch(next.id, { status: 'Metin çıkarılıyor…' });
          const r = await extractPdf(next.file, { ocrFallback: true, langs: settings.ocrLanguages, onProgress });
          text = r.text; pages = r.pages; conf = r.confidence; usedOcr = r.usedOcr; previewUrl = r.thumbnailDataUrl;
        } else {
          previewUrl = await imageThumb(next.file);
          const r = await recognizeImage(next.file, settings.ocrLanguages, (info) => patch(next.id, { status: `OCR %${Math.round(info.progress * 100)} · ${info.status}`, progress: info.progress }));
          text = r.text; conf = r.confidence; usedOcr = true;
        }
        const extraction = parseInvoiceText(text, { companyName: settings.companyName, taxNo: settings.taxNo, ocrConfidence: conf });
        patch(next.id, { phase: 'hazir', status: 'Hazır', progress: 1, text, pages, ocrConfidence: conf, usedOcr, previewUrl, extraction });
      } catch (e) {
        patch(next.id, { phase: 'hata', status: 'Hata', error: e instanceof Error ? e.message : String(e) });
      } finally {
        busyRef.current = false;
        setJobs((js) => [...js]); // sıradakini tetikle
      }
    })();
  }, [jobs, patch]);

  const filtered = docs.filter((d) => {
    if (!q) return true;
    const t = q.toLocaleLowerCase('tr-TR');
    return `${d.name} ${d.text}`.toLocaleLowerCase('tr-TR').includes(t);
  });

  const removeDoc = async (d: StoredDocument) => {
    if (!confirmDelete(`"${d.name}" belgesi`)) return;
    await db.documents.delete(d.id);
  };

  return (
    <>
      <PageHead title="Belgeler ve OCR" subtitle="Fatura, irsaliye ve sözleşmeleri cihazda okur; faturayı alanlarına ayırıp finansa aktarır. Dosyalar bu tarayıcıda kalır." />
      <Card>
        <div
          className={`dropzone ${drag ? 'active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          aria-label="Belge yükle"
        >
          <strong>PDF veya görüntü (JPG, PNG, WEBP) bırakın ya da seçin</strong>
          <p className="small" style={{ marginTop: 6 }}>Metin katmanlı PDF doğrudan okunur; taranmış sayfalar ve fotoğraflar tesseract.js (tur+eng) ile OCR edilir. Dil verisi ilk kullanımda indirilir, sonra çevrimdışı çalışır.</p>
          <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </div>
      </Card>

      {jobs.map((j) => (
        <JobCard key={`${j.id}-${j.extraction ? 'x' : 'p'}`} job={j} onDone={(id) => setJobs((js) => js.filter((x) => x.id !== id))} onSaved={(id) => patch(id, { phase: 'kaydedildi', status: 'Kaydedildi' })} />
      ))}

      <Card
        title={`Belge arşivi (${filtered.length})`}
        actions={<input className="input" style={{ width: 240 }} placeholder="Metin içinde ara…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Belgelerde ara" />}
      >
        {filtered.length === 0 ? (
          <Empty title={docs.length ? 'Eşleşen belge yok' : 'Henüz belge yok'} hint="Yukarıdan bir fatura fotoğrafı veya PDF yükleyin." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Belge</th><th>Tür</th><th className="num">Sayfa</th><th>OCR güveni</th><th>Bağlı fatura</th><th>Eklendi</th><th></th></tr></thead>
              <tbody>
                {filtered.map((d) => {
                  const inv = d.linkedInvoiceId ? invMap.get(d.linkedInvoiceId) : undefined;
                  return (
                    <tr key={d.id} className="clickable" onClick={() => setView(d)}>
                      <td>
                        <div className="row" style={{ gap: 10 }}>
                          {d.thumbnailDataUrl && <img src={d.thumbnailDataUrl} alt="" width={36} height={46} style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />}
                          <div><div>{d.name}</div><div className="tiny">{(d.size / 1024).toFixed(0)} KB · {d.mimeType.replace('application/', '').replace('image/', '')}</div></div>
                        </div>
                      </td>
                      <td>{DOCUMENT_KINDS[d.kind]}</td>
                      <td className="num">{d.pages}</td>
                      <td>{d.ocrConfidence !== undefined ? <Badge tone={confTone(d.ocrConfidence)}>%{Math.round(d.ocrConfidence * 100)}</Badge> : '—'}</td>
                      <td className="mono">{inv ? inv.invoiceNo : '—'}</td>
                      <td>{fmtDateTime(d.createdAt)}</td>
                      <td><button className="btn ghost sm" aria-label="Sil" onClick={(e) => { e.stopPropagation(); removeDoc(d); }}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!view} title={view?.name ?? ''} onClose={() => setView(null)} wide>
        {view && (
          <>
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="row">
                <Badge>{DOCUMENT_KINDS[view.kind]}</Badge>
                <span className="tiny">{view.pages} sayfa · {fmtDateTime(view.createdAt)}</span>
                {view.ocrConfidence !== undefined && <Badge tone={confTone(view.ocrConfidence)}>OCR %{Math.round(view.ocrConfidence * 100)}</Badge>}
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => navigator.clipboard?.writeText(view.text)}>Metni kopyala</button>
                {view.blob && <button className="btn sm" onClick={() => window.open(URL.createObjectURL(view.blob!), '_blank')}>Dosyayı aç</button>}
              </div>
            </div>
            {view.extraction && (
              <dl className="kv" style={{ marginBottom: 12 }}>
                <dt>Fatura no</dt><dd>{view.extraction.invoiceNo ?? '—'}</dd>
                <dt>Karşı taraf</dt><dd>{view.extraction.counterpartyName ?? '—'}</dd>
                <dt>Toplam</dt><dd>{view.extraction.total !== undefined ? fmtMoney(view.extraction.total, view.extraction.currency) : '—'}</dd>
              </dl>
            )}
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: 12, borderRadius: 10, maxHeight: 420, overflow: 'auto', margin: 0 }}>{view.text || '(metin çıkarılamadı)'}</pre>
          </>
        )}
      </Modal>
    </>
  );
}

function JobCard({ job, onDone, onSaved }: { job: Job; onDone: (id: string) => void; onSaved: (id: string) => void }) {
  const ex = job.extraction;
  const [f, setF] = useState(() => formFrom(ex));
  const [kind, setKind] = useState<DocumentKind>('fatura');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const saveDocument = async (linkedInvoiceId?: string, k: DocumentKind = kind): Promise<string> => {
    const id = uid('doc');
    const doc: StoredDocument = {
      id,
      name: job.file.name,
      mimeType: job.file.type || 'application/octet-stream',
      size: job.file.size,
      kind: k,
      text: job.text ?? '',
      pages: job.pages ?? 1,
      ocrConfidence: job.ocrConfidence,
      blob: job.file,
      thumbnailDataUrl: job.previewUrl,
      extraction: ex,
      linkedInvoiceId,
      createdAt: Date.now(),
    };
    await db.documents.put(doc);
    return id;
  };

  const saveAsInvoice = async () => {
    if (!f) return;
    setSaving(true);
    try {
      const count = await db.invoices.count();
      const subtotal = r2(Number(f.subtotal) || 0);
      const vatTotal = r2(Number(f.vatTotal) || 0);
      const total = r2(Number(f.total) || subtotal + vatTotal);
      const lines = ex?.lines?.length && Math.abs(ex.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) - subtotal) < Math.max(1, subtotal * 0.02)
        ? ex.lines
        : [{ description: 'Fatura toplamı', quantity: 1, unitPrice: subtotal, vatRate: subtotal ? Math.round((vatTotal / subtotal) * 100) : 20 }];
      const invId = uid('inv');
      const docId = await saveDocument(invId, 'fatura');
      const isPdf = job.file.type === 'application/pdf';
      const inv: Invoice = {
        id: invId,
        invoiceNo: f.invoiceNo.trim() || docNo(f.type === 'satis' ? 'SF' : 'AF', count + 1),
        type: f.type,
        counterpartyName: f.counterpartyName.trim() || 'Bilinmeyen karşı taraf',
        counterpartyTaxNo: f.counterpartyTaxNo.trim() || undefined,
        date: f.date ? fromInputDate(f.date) : Date.now(),
        dueDate: f.dueDate ? fromInputDate(f.dueDate) : undefined,
        lines,
        subtotal,
        vatTotal,
        total,
        currency: f.currency,
        status: 'kesildi',
        category: f.category,
        source: isPdf && !job.usedOcr ? 'pdf' : 'ocr',
        sourceDocumentId: docId,
        aiConfidence: ex?.confidence,
        aiNotes: ex?.notes,
        createdAt: Date.now(),
      };
      await db.transaction('rw', db.invoices, db.journal, async () => {
        await db.invoices.put(inv);
        await db.journal.put(postInvoiceJournal(inv));
      });
      setMsg(`Fatura ${inv.invoiceNo} kaydedildi ve yevmiye oluşturuldu.`);
      onSaved(job.id);
    } finally {
      setSaving(false);
    }
  };

  const saveOnly = async () => {
    setSaving(true);
    try {
      await saveDocument(undefined, kind);
      setMsg('Belge arşive kaydedildi.');
      onSaved(job.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={job.file.name}
      subtitle={`${(job.file.size / 1024).toFixed(0)} KB${job.pages ? ` · ${job.pages} sayfa` : ''}${job.usedOcr ? ' · OCR kullanıldı' : job.phase === 'hazir' ? ' · metin katmanı' : ''}`}
      actions={
        <>
          {job.phase === 'hazir' && ex && <Badge tone={confTone(ex.confidence)}>AI güveni %{Math.round(ex.confidence * 100)}</Badge>}
          {job.phase === 'okunuyor' && <Badge tone="info">{job.status}</Badge>}
          {(job.phase === 'kaydedildi' || job.phase === 'hata') && <button className="btn sm" onClick={() => onDone(job.id)}>Kapat</button>}
        </>
      }
    >
      {(job.phase === 'okunuyor' || job.phase === 'bekliyor') && (
        <div>
          <Progress value={job.progress} />
          <p className="small muted" style={{ marginTop: 6 }}>{job.status}</p>
        </div>
      )}
      {job.phase === 'hata' && <Alert tone="bad">Okunamadı: {job.error}</Alert>}
      {msg && <Alert tone="good">{msg}</Alert>}
      {job.phase === 'hazir' && ex && f && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 240px) 1fr', gap: 18 }}>
          <div>
            {job.previewUrl ? (
              <img src={job.previewUrl} alt="Belge önizlemesi" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)' }} />
            ) : (
              <div className="empty">Önizleme yok</div>
            )}
            <details style={{ marginTop: 10 }}>
              <summary className="small">Çıkarılan ham metin</summary>
              <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 220, overflow: 'auto', background: 'var(--surface-2)', padding: 8, borderRadius: 8 }}>{job.text}</pre>
            </details>
          </div>
          <div>
            {ex.notes.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {ex.notes.map((n, i) => <div key={i} style={{ marginBottom: 6 }}><Alert tone="warn">{n}</Alert></div>)}
              </div>
            )}
            <div className="form-grid">
              <Field label="Tür">
                <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as InvoiceType })}>
                  <option value="alis">Alış / gider faturası</option>
                  <option value="satis">Satış faturası</option>
                </select>
              </Field>
              <Field label="Fatura no"><input className="input" value={f.invoiceNo} onChange={(e) => setF({ ...f, invoiceNo: e.target.value })} /></Field>
              <Field label="Tarih"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
              <Field label="Vade"><input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
              <Field label="Karşı taraf"><input className="input" value={f.counterpartyName} onChange={(e) => setF({ ...f, counterpartyName: e.target.value })} /></Field>
              <Field label="VKN / TCKN"><input className="input" value={f.counterpartyTaxNo} onChange={(e) => setF({ ...f, counterpartyTaxNo: e.target.value })} /></Field>
              <Field label="Ara toplam"><input className="input" type="number" step="any" value={f.subtotal} onChange={(e) => setF({ ...f, subtotal: e.target.value })} /></Field>
              <Field label="KDV"><input className="input" type="number" step="any" value={f.vatTotal} onChange={(e) => setF({ ...f, vatTotal: e.target.value })} /></Field>
              <Field label="Genel toplam"><input className="input" type="number" step="any" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} /></Field>
              <Field label="Para birimi">
                <select className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}>
                  <option>TRY</option><option>USD</option><option>EUR</option>
                </select>
              </Field>
              <Field label="Kategori (AI önerisi)">
                <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as FinanceCategory })}>
                  {Object.entries(FINANCE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Belge türü (arşiv için)">
                <select className="input" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                  {Object.entries(DOCUMENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            {ex.lines.length > 0 && ex.lines[0].description !== 'Fatura toplamı' && (
              <p className="tiny" style={{ marginTop: 8 }}>{ex.lines.length} kalem tespit edildi: {ex.lines.map((l) => `${l.description} (${l.quantity} × ${fmtMoney(l.unitPrice, f.currency)})`).join('; ')}</p>
            )}
            <div className="row end" style={{ marginTop: 12 }}>
              <button className="btn" onClick={saveOnly} disabled={saving}>Sadece belge olarak sakla</button>
              <button className="btn primary" onClick={saveAsInvoice} disabled={saving}>Fatura olarak kaydet</button>
            </div>
          </div>
        </div>
      )}
      {job.phase === 'kaydedildi' && ex && (
        <p className="small muted">{ex.counterpartyName ?? job.file.name} · {ex.total !== undefined ? fmtMoney(ex.total, ex.currency) : ''} · {fmtDate(ex.date)}</p>
      )}
    </Card>
  );
}

interface FormState {
  type: InvoiceType;
  invoiceNo: string;
  date: string;
  dueDate: string;
  counterpartyName: string;
  counterpartyTaxNo: string;
  subtotal: string;
  vatTotal: string;
  total: string;
  currency: Currency;
  category: FinanceCategory;
}

function formFrom(ex?: InvoiceExtraction): FormState | null {
  if (!ex) return null;
  return {
    type: ex.type,
    invoiceNo: ex.invoiceNo ?? '',
    date: ex.date ? toInputDate(ex.date) : toInputDate(),
    dueDate: ex.dueDate ? toInputDate(ex.dueDate) : '',
    counterpartyName: ex.counterpartyName ?? '',
    counterpartyTaxNo: ex.counterpartyTaxNo ?? '',
    subtotal: ex.subtotal !== undefined ? String(ex.subtotal) : '',
    vatTotal: ex.vatTotal !== undefined ? String(ex.vatTotal) : '',
    total: ex.total !== undefined ? String(ex.total) : '',
    currency: ex.currency ?? 'TRY',
    category: ex.category,
  };
}
