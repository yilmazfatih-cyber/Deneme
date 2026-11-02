import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Card, Empty, Field, Modal, PageHead, Stat, confirmDelete } from '../components/ui';
import { db } from '../db';
import {
  LOT_STATUS,
  MOVEMENT_TYPES,
  PRODUCTION_STAGES,
  PRODUCT_CATEGORIES,
  UNITS,
  type Lot,
  type LotStatus,
  type MovementType,
  type ProductionStage,
  type StockMovement,
} from '../db/schema';
import { labelHtml, lotQrPayload, openPrintWindow, qrDataUrl } from '../lib/barcode';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from '../lib/format';
import { uid } from '../lib/id';
import { addMovement, movementSign } from '../lib/stock';

type LotDraft = Omit<Lot, 'id' | 'productId' | 'createdAt' | 'updatedAt'>;
const NO_LOTS: Lot[] = [];
const NO_MOVEMENTS: StockMovement[] = [];
const emptyLot = (): LotDraft => ({ lotNo: '', quantity: 0, location: '', stage: 'apre', status: 'stokta', qualityGrade: undefined, supplier: '', note: '' });

async function patchLot(id: string, patch: Partial<Lot>): Promise<void> {
  await db.lots.update(id, { ...patch, updatedAt: Date.now() });
}

const stageLabel = (s: ProductionStage) => PRODUCTION_STAGES.find((x) => x.key === s)?.label ?? s;
const statusTone = (s: LotStatus) => (s === 'stokta' ? 'good' : s === 'uretimde' ? 'info' : s === 'iade' ? 'bad' : 'neutral');

function QrImage({ text, size = 120 }: { text: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    qrDataUrl(text, size).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [text, size]);
  return src ? <img src={src} width={size} height={size} alt={`QR: ${text}`} style={{ borderRadius: 8, background: '#fff' }} /> : <div style={{ width: size, height: size }} />;
}

export default function ProductDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const product = useLiveQuery(() => db.products.get(id), [id]);
  const lots = useLiveQuery(() => db.lots.where('productId').equals(id).reverse().sortBy('updatedAt'), [id]) ?? NO_LOTS;
  const movements = useLiveQuery(() => db.movements.where('productId').equals(id).reverse().sortBy('at'), [id]) ?? NO_MOVEMENTS;

  const stock = useMemo(() => movements.reduce((s, m) => s + movementSign(m.type) * m.quantity, 0), [movements]);

  const [lotDraft, setLotDraft] = useState<LotDraft | null>(null);
  const [editingLot, setEditingLot] = useState<Lot | null>(null);
  const [lotError, setLotError] = useState('');

  const [mv, setMv] = useState<{ type: MovementType; quantity: number; lotId: string; location: string; note: string } | null>(null);
  const [notice, setNotice] = useState('');

  if (product === undefined) return <p className="muted">Yükleniyor…</p>;
  if (product === null || !product) {
    return (
      <Card>
        <Empty title="Ürün bulunamadı" hint="Silinmiş veya bağlantı hatalı olabilir." action={<Link className="btn" to="/urunler">Ürün listesine dön</Link>} />
      </Card>
    );
  }

  const unit = UNITS[product.unit];
  const low = stock <= product.minStock;

  const openNewLot = () => {
    const seq = lots.length + 1;
    setEditingLot(null);
    setLotDraft({ ...emptyLot(), lotNo: `PRT-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}` });
    setLotError('');
  };
  const openEditLot = (l: Lot) => {
    setEditingLot(l);
    const { id, productId, createdAt, updatedAt, ...rest } = l;
    void id;
    void productId;
    void createdAt;
    void updatedAt;
    setLotDraft(rest);
    setLotError('');
  };
  const saveLot = async () => {
    if (!lotDraft) return;
    if (!lotDraft.lotNo.trim()) {
      setLotError('Parti numarası zorunludur.');
      return;
    }
    if (lotDraft.quantity <= 0) {
      setLotError('Miktar sıfırdan büyük olmalı.');
      return;
    }
    const dup = await db.lots.where('lotNo').equals(lotDraft.lotNo.trim()).first();
    if (dup && dup.id !== editingLot?.id) {
      setLotError('Bu parti numarası zaten kullanılıyor.');
      return;
    }
    const now = Date.now();
    const clean: LotDraft = { ...lotDraft, lotNo: lotDraft.lotNo.trim(), location: lotDraft.location.trim(), supplier: lotDraft.supplier?.trim() || undefined, note: lotDraft.note?.trim() || undefined };
    if (editingLot) await db.lots.put({ ...editingLot, ...clean, updatedAt: now });
    else {
      const lotId = uid('l');
      await db.lots.add({ ...clean, id: lotId, productId: product.id, createdAt: now, updatedAt: now });
      if (clean.status === 'stokta') {
        await addMovement({ productId: product.id, lotId, type: 'giris', quantity: clean.quantity, toLocation: clean.location, refType: 'manuel', note: `Parti ${clean.lotNo} girişi` });
        setNotice(`Parti ${clean.lotNo} oluşturuldu ve ${fmtNum(clean.quantity, 1)} ${unit} stok girişi kaydedildi.`);
      } else setNotice(`Parti ${clean.lotNo} oluşturuldu.`);
    }
    setLotDraft(null);
    setEditingLot(null);
  };
  const removeLot = async (l: Lot) => {
    if (!confirmDelete(`${l.lotNo} partisi`)) return;
    await db.lots.delete(l.id);
  };
  const quickStage = (l: Lot, stage: ProductionStage) => patchLot(l.id, { stage });
  const quickStatus = (l: Lot, status: LotStatus) => patchLot(l.id, { status });

  const printLabel = async (l: Lot) => {
    const qr = await qrDataUrl(lotQrPayload(l.lotNo), 300);
    const html = labelHtml({
      qr,
      title: product.name,
      lotNo: l.lotNo,
      quantity: `${fmtNum(l.quantity, 1)} ${unit}`,
      location: l.location || '—',
      extra: [product.sku, product.color, l.qualityGrade ? `Kalite ${l.qualityGrade}` : '', stageLabel(l.stage)].filter(Boolean).join(' · '),
    });
    if (!openPrintWindow(html)) setNotice('Yazdırma penceresi açılamadı. Tarayıcının açılır pencere engelini kaldırın.');
  };

  const saveMovement = async () => {
    if (!mv) return;
    if (mv.type !== 'sayim' && mv.quantity <= 0) {
      setNotice('Miktar sıfırdan büyük olmalı.');
      return;
    }
    const lot = lots.find((l) => l.id === mv.lotId);
    await addMovement({
      productId: product.id,
      lotId: mv.lotId || undefined,
      type: mv.type,
      quantity: mv.quantity,
      fromLocation: mv.type === 'cikis' || mv.type === 'fire' ? mv.location || lot?.location : undefined,
      toLocation: mv.type === 'giris' ? mv.location || lot?.location : undefined,
      refType: 'manuel',
      note: mv.note || undefined,
    });
    if (lot && mv.type !== 'sayim') {
      const delta = movementSign(mv.type) * mv.quantity;
      await db.lots.update(lot.id, { quantity: Math.max(0, lot.quantity + delta), updatedAt: Date.now() });
    }
    setMv(null);
    setNotice(`${MOVEMENT_TYPES[mv.type]} kaydedildi.`);
  };

  return (
    <>
      <PageHead
        title={product.name}
        subtitle={`${product.sku} · ${PRODUCT_CATEGORIES[product.category]}${product.color ? ` · ${product.color}` : ''}`}
        actions={
          <>
            <button className="btn" onClick={() => navigate('/urunler')}>
              ← Ürünler
            </button>
            <button className="btn" onClick={() => setMv({ type: 'giris', quantity: 0, lotId: '', location: '', note: '' })}>
              Stok hareketi
            </button>
            <button className="btn primary" onClick={openNewLot}>
              + Yeni parti
            </button>
          </>
        }
      />

      {notice && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="info">
            <div className="row between">
              <span>{notice}</span>
              <button className="btn ghost sm" onClick={() => setNotice('')} aria-label="Kapat">
                ✕
              </button>
            </div>
          </Alert>
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Mevcut stok" value={`${fmtNum(stock, 1)} ${unit}`} delta={low ? `Eşik: ${fmtNum(product.minStock)} ${unit} — kritik` : `Eşik: ${fmtNum(product.minStock)} ${unit}`} trend={low ? 'down' : 'up'} />
        <Stat label="Stok değeri (maliyet)" value={fmtMoney(Math.max(0, stock) * product.cost)} />
        <Stat label="Aktif parti" value={fmtNum(lots.filter((l) => l.status === 'stokta' || l.status === 'uretimde').length)} delta={`${fmtNum(lots.filter((l) => l.status === 'uretimde').length)} üretimde`} />
        <Stat label="Brüt kâr marjı" value={product.price > 0 ? `%${fmtNum(((product.price - product.cost) / product.price) * 100, 1)}` : '—'} delta={`${fmtMoney(product.cost)} → ${fmtMoney(product.price)}`} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card title="Ürün bilgileri">
          <dl className="kv">
            <dt>Stok kodu</dt>
            <dd className="mono">{product.sku}</dd>
            <dt>Kategori</dt>
            <dd>{PRODUCT_CATEGORIES[product.category]}</dd>
            <dt>Birim</dt>
            <dd>{unit}</dd>
            <dt>Renk</dt>
            <dd>{product.color || '—'}</dd>
            <dt>Kompozisyon</dt>
            <dd>{product.composition || '—'}</dd>
            <dt>Gramaj</dt>
            <dd>{product.gsm ? `${product.gsm} g/m²` : '—'}</dd>
            <dt>En</dt>
            <dd>{product.widthCm ? `${product.widthCm} cm` : '—'}</dd>
            <dt>Barkod</dt>
            <dd className="mono">{product.barcode || '—'}</dd>
            <dt>Oluşturma</dt>
            <dd>{fmtDate(product.createdAt)}</dd>
            <dt>Son güncelleme</dt>
            <dd>{fmtDate(product.updatedAt)}</dd>
          </dl>
        </Card>
        <Card title="Ürün QR kodu" subtitle="Raf etiketi veya barkod okuyucu ile ürüne hızlı erişim">
          <div className="row" style={{ gap: 18 }}>
            <QrImage text={product.barcode || product.sku} size={140} />
            <div className="small muted">
              <p>
                İçerik: <span className="mono">{product.barcode || product.sku}</span>
              </p>
              <p style={{ marginTop: 6 }}>Stok ve barkod sayfasındaki tarayıcı bu kodu okuduğunda ürünü bulur ve giriş/çıkış işlemine izin verir.</p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Partiler" subtitle="Her parti kendi QR etiketiyle izlenir; aşama ve durum doğrudan tablodan değiştirilebilir." actions={<button className="btn sm" onClick={openNewLot}>+ Parti</button>}>
        {lots.length === 0 ? (
          <Empty title="Henüz parti yok" hint="Üretimden çıkan veya tedarikçiden gelen her partiyi ayrı kaydedin." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Parti no</th>
                  <th className="num">Miktar</th>
                  <th>Konum</th>
                  <th>Aşama</th>
                  <th>Durum</th>
                  <th>Kalite</th>
                  <th>Tedarikçi / not</th>
                  <th>Güncelleme</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td className="mono">{l.lotNo}</td>
                    <td className="num">
                      {fmtNum(l.quantity, 1)} <span className="tiny">{unit}</span>
                    </td>
                    <td>{l.location || '—'}</td>
                    <td>
                      <select className="input" style={{ minHeight: 32, padding: '2px 8px', fontSize: 13 }} value={l.stage} onChange={(e) => quickStage(l, e.target.value as ProductionStage)} aria-label="Aşama">
                        {PRODUCTION_STAGES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <Badge tone={statusTone(l.status)}>{LOT_STATUS[l.status]}</Badge>
                        <select className="input" style={{ minHeight: 32, padding: '2px 8px', fontSize: 13, width: 'auto' }} value={l.status} onChange={(e) => quickStatus(l, e.target.value as LotStatus)} aria-label="Durum">
                          {(Object.keys(LOT_STATUS) as LotStatus[]).map((k) => (
                            <option key={k} value={k}>
                              {LOT_STATUS[k]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td>{l.qualityGrade ? <Badge tone={l.qualityGrade === 'A' ? 'good' : l.qualityGrade === 'B' ? 'warn' : 'bad'}>Kalite {l.qualityGrade}</Badge> : <span className="muted">—</span>}</td>
                    <td className="small muted">{[l.supplier, l.note].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="small">{fmtDate(l.updatedAt)}</td>
                    <td>
                      <div className="row end">
                        <button className="btn sm" onClick={() => printLabel(l)}>
                          Etiket yazdır
                        </button>
                        <button className="btn sm" onClick={() => openEditLot(l)}>
                          Düzenle
                        </button>
                        <button className="btn sm danger" onClick={() => removeLot(l)}>
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Stok hareketleri" subtitle={`Toplam ${fmtNum(movements.length)} hareket · stok bu hareketlerden hesaplanır`} actions={<button className="btn sm" onClick={() => setMv({ type: 'giris', quantity: 0, lotId: '', location: '', note: '' })}>+ Hareket</button>}>
        {movements.length === 0 ? (
          <Empty title="Hareket yok" hint="İlk girişi kaydedince stok burada görünür." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Tür</th>
                  <th className="num">Miktar</th>
                  <th>Parti</th>
                  <th>Konum</th>
                  <th>Kaynak</th>
                  <th>Not</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const sign = movementSign(m.type) * (m.type === 'sayim' ? Math.sign(m.quantity) || 1 : 1);
                  const lot = lots.find((l) => l.id === m.lotId);
                  return (
                    <tr key={m.id}>
                      <td className="small">{fmtDateTime(m.at)}</td>
                      <td>
                        <Badge tone={m.type === 'giris' ? 'good' : m.type === 'fire' ? 'bad' : m.type === 'cikis' ? 'warn' : 'info'}>{MOVEMENT_TYPES[m.type]}</Badge>
                      </td>
                      <td className="num" style={{ color: sign > 0 ? 'var(--good)' : sign < 0 ? 'var(--bad)' : undefined }}>
                        {sign > 0 ? '+' : sign < 0 ? '−' : ''}
                        {fmtNum(Math.abs(m.quantity), 1)} {unit}
                      </td>
                      <td className="mono">{lot?.lotNo ?? '—'}</td>
                      <td className="small">{[m.fromLocation, m.toLocation].filter(Boolean).join(' → ') || '—'}</td>
                      <td className="small muted">{m.refType ?? '—'}</td>
                      <td className="small muted">{m.note ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!lotDraft} title={editingLot ? `Partiyi düzenle — ${editingLot.lotNo}` : 'Yeni parti'} onClose={() => setLotDraft(null)}>
        {lotDraft && (
          <div className="grid" style={{ gap: 14 }}>
            <div className="form-grid">
              <Field label="Parti numarası *">
                <input className="input" value={lotDraft.lotNo} onChange={(e) => setLotDraft({ ...lotDraft, lotNo: e.target.value })} />
              </Field>
              <Field label={`Miktar (${unit}) *`}>
                <input className="input" type="number" min={0} step="0.1" value={lotDraft.quantity || ''} onChange={(e) => setLotDraft({ ...lotDraft, quantity: Number(e.target.value) })} />
              </Field>
              <Field label="Konum (depo / raf)">
                <input className="input" value={lotDraft.location} onChange={(e) => setLotDraft({ ...lotDraft, location: e.target.value })} placeholder="Depo A / Raf 3" />
              </Field>
              <Field label="Aşama">
                <select className="input" value={lotDraft.stage} onChange={(e) => setLotDraft({ ...lotDraft, stage: e.target.value as ProductionStage })}>
                  {PRODUCTION_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Durum" hint={!editingLot ? '"Stokta" seçilirse giriş hareketi otomatik eklenir' : undefined}>
                <select className="input" value={lotDraft.status} onChange={(e) => setLotDraft({ ...lotDraft, status: e.target.value as LotStatus })}>
                  {(Object.keys(LOT_STATUS) as LotStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {LOT_STATUS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kalite sınıfı">
                <select className="input" value={lotDraft.qualityGrade ?? ''} onChange={(e) => setLotDraft({ ...lotDraft, qualityGrade: (e.target.value || undefined) as Lot['qualityGrade'] })}>
                  <option value="">Belirlenmedi</option>
                  <option value="A">A — birinci kalite</option>
                  <option value="B">B — ikinci kalite</option>
                  <option value="C">C — defolu</option>
                </select>
              </Field>
              <Field label="Tedarikçi">
                <input className="input" value={lotDraft.supplier ?? ''} onChange={(e) => setLotDraft({ ...lotDraft, supplier: e.target.value })} />
              </Field>
              <Field label="Kalite / üretim notu">
                <input className="input" value={lotDraft.note ?? ''} onChange={(e) => setLotDraft({ ...lotDraft, note: e.target.value })} placeholder="Örn. hafif ton farkı, kenar hatası yok" />
              </Field>
            </div>
            {lotError && <div className="alert bad">{lotError}</div>}
            <div className="row end">
              <button className="btn" onClick={() => setLotDraft(null)}>
                Vazgeç
              </button>
              <button className="btn primary" onClick={saveLot}>
                {editingLot ? 'Kaydet' : 'Partiyi ekle'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!mv} title="Stok hareketi" onClose={() => setMv(null)}>
        {mv && (
          <div className="grid" style={{ gap: 14 }}>
            <div className="form-grid">
              <Field label="Hareket türü">
                <select className="input" value={mv.type} onChange={(e) => setMv({ ...mv, type: e.target.value as MovementType })}>
                  {(['giris', 'cikis', 'fire', 'sayim'] as MovementType[]).map((k) => (
                    <option key={k} value={k}>
                      {MOVEMENT_TYPES[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Miktar (${unit})`} hint={mv.type === 'sayim' ? 'Sayım farkı: eksik için negatif girin' : undefined}>
                <input className="input" type="number" step="0.1" value={mv.quantity || ''} onChange={(e) => setMv({ ...mv, quantity: Number(e.target.value) })} />
              </Field>
              <Field label="Parti (isteğe bağlı)">
                <select className="input" value={mv.lotId} onChange={(e) => setMv({ ...mv, lotId: e.target.value })}>
                  <option value="">Parti belirtilmedi</option>
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lotNo} — {fmtNum(l.quantity, 1)} {unit} · {l.location}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Konum">
                <input className="input" value={mv.location} onChange={(e) => setMv({ ...mv, location: e.target.value })} placeholder="Depo / raf" />
              </Field>
              <Field label="Not">
                <input className="input" value={mv.note} onChange={(e) => setMv({ ...mv, note: e.target.value })} />
              </Field>
            </div>
            <div className="row end">
              <button className="btn" onClick={() => setMv(null)}>
                Vazgeç
              </button>
              <button className="btn primary" onClick={saveMovement}>
                Kaydet
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
