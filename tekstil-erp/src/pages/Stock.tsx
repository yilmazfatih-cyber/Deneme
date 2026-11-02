import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, Empty, Field, Modal, PageHead, Stat } from '../components/ui';
import { db } from '../db';
import { MOVEMENT_TYPES, UNITS, type Lot, type MovementType, type Product, type StockMovement } from '../db/schema';
import { cameraSupported, parseLotPayload, startScanner, type StopScanner } from '../lib/barcode';
import { fmtDateTime, fmtNum } from '../lib/format';
import { addMovement, movementSign, stockFromMovements } from '../lib/stock';

type Found = { product: Product; lot?: Lot; raw: string };
const NO_PRODUCTS: Product[] = [];
const NO_LOTS: Lot[] = [];
const NO_MOVEMENTS: StockMovement[] = [];
type QuickType = 'giris' | 'cikis' | 'transfer' | 'fire';
const typeTone = (t: MovementType) => (t === 'giris' ? 'good' : t === 'fire' ? 'bad' : t === 'cikis' ? 'warn' : 'info');

export default function Stock() {
  const products = useLiveQuery(() => db.products.toArray(), []) ?? NO_PRODUCTS;
  const lots = useLiveQuery(() => db.lots.toArray(), []) ?? NO_LOTS;
  const movements = useLiveQuery(() => db.movements.reverse().sortBy('at'), []) ?? NO_MOVEMENTS;
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const lotMap = useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots]);
  const levels = useMemo(() => stockFromMovements(movements), [movements]);

  // ---- Tarayıcı ----
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<StopScanner | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [notFound, setNotFound] = useState('');
  const [quick, setQuick] = useState<{ type: QuickType; quantity: number; from: string; to: string; note: string } | null>(null);
  const [notice, setNotice] = useState('');

  const resolve = useCallback(
    (raw: string) => {
      const lotNo = parseLotPayload(raw);
      if (lotNo) {
        const lot = lots.find((l) => l.lotNo.toLocaleUpperCase('tr-TR') === lotNo.toLocaleUpperCase('tr-TR'));
        const product = lot ? productMap.get(lot.productId) : undefined;
        if (lot && product) {
          setFound({ product, lot, raw });
          setNotFound('');
          return;
        }
        setFound(null);
        setNotFound(`"${lotNo}" numaralı parti kayıtlı değil.`);
        return;
      }
      const code = raw.trim();
      const product = products.find((p) => p.barcode === code || p.sku.toLocaleUpperCase('tr-TR') === code.toLocaleUpperCase('tr-TR'));
      if (product) {
        setFound({ product, raw });
        setNotFound('');
      } else {
        setFound(null);
        setNotFound(`"${code}" koduna karşılık gelen ürün veya parti bulunamadı.`);
      }
    },
    [lots, products, productMap],
  );

  const stopScan = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setScanning(false);
  }, []);

  const startScan = async () => {
    if (!videoRef.current) return;
    setScanError('');
    try {
      const stop = await startScanner(videoRef.current, (value) => {
        resolve(value);
        if (navigator.vibrate) navigator.vibrate(60);
      });
      stopRef.current = stop;
      setScanning(true);
    } catch (err) {
      setScanError((err as Error).message);
    }
  };

  useEffect(() => () => stopRef.current?.(), []);

  const submitManual = () => {
    if (!manualCode.trim()) return;
    resolve(manualCode);
    setManualCode('');
  };

  const openQuick = (type: QuickType) => {
    if (!found) return;
    setQuick({ type, quantity: type === 'transfer' ? found.lot?.quantity ?? 0 : 0, from: found.lot?.location ?? '', to: '', note: '' });
  };
  const saveQuick = async () => {
    if (!quick || !found) return;
    if (quick.quantity <= 0) return setNotice('Miktar sıfırdan büyük olmalı.');
    if (quick.type === 'transfer' && !quick.to.trim()) return setNotice('Hedef konum girin.');
    await addMovement({
      productId: found.product.id,
      lotId: found.lot?.id,
      type: quick.type,
      quantity: quick.quantity,
      fromLocation: quick.type === 'giris' ? undefined : quick.from || undefined,
      toLocation: quick.type === 'giris' || quick.type === 'transfer' ? quick.to || quick.from || undefined : undefined,
      refType: 'barkod',
      note: quick.note || `Barkod: ${found.raw}`,
    });
    if (found.lot) {
      const patch: Partial<Lot> = { updatedAt: Date.now() };
      if (quick.type === 'transfer') patch.location = quick.to.trim();
      else patch.quantity = Math.max(0, found.lot.quantity + movementSign(quick.type) * quick.quantity);
      await db.lots.update(found.lot.id, patch);
    }
    setQuick(null);
    setNotice(`${MOVEMENT_TYPES[quick.type]} kaydedildi: ${found.product.name}${found.lot ? ` · ${found.lot.lotNo}` : ''}.`);
  };

  // ---- Manuel hareket ----
  const [manual, setManual] = useState({ productId: '', lotId: '', type: 'giris' as MovementType, quantity: 0, from: '', to: '', note: '' });
  const manualLots = lots.filter((l) => l.productId === manual.productId);
  const saveManual = async () => {
    if (!manual.productId) return setNotice('Ürün seçin.');
    if (manual.type !== 'sayim' && manual.quantity <= 0) return setNotice('Miktar sıfırdan büyük olmalı.');
    await addMovement({
      productId: manual.productId,
      lotId: manual.lotId || undefined,
      type: manual.type,
      quantity: manual.quantity,
      fromLocation: manual.from || undefined,
      toLocation: manual.to || undefined,
      refType: 'manuel',
      note: manual.note || undefined,
    });
    if (manual.lotId && manual.type === 'transfer' && manual.to) await db.lots.update(manual.lotId, { location: manual.to, updatedAt: Date.now() });
    setManual({ ...manual, quantity: 0, note: '' });
    setNotice('Hareket kaydedildi.');
  };

  // ---- Liste filtreleri ----
  const [typeFilter, setTypeFilter] = useState<MovementType | 'tumu'>('tumu');
  const [search, setSearch] = useState('');
  const filteredMovements = useMemo(() => {
    const t = search.trim().toLocaleLowerCase('tr-TR');
    return movements
      .filter((m) => typeFilter === 'tumu' || m.type === typeFilter)
      .filter((m) => {
        if (!t) return true;
        const p = productMap.get(m.productId);
        const l = m.lotId ? lotMap.get(m.lotId) : undefined;
        return [p?.name, p?.sku, l?.lotNo, m.note, m.fromLocation, m.toLocation].some((s) => s?.toLocaleLowerCase('tr-TR').includes(t));
      })
      .slice(0, 300);
  }, [movements, typeFilter, search, productMap, lotMap]);

  // ---- Depo özeti ----
  const byLocation = useMemo(() => {
    const map = new Map<string, { lots: number; value: number; items: Map<string, number> }>();
    for (const l of lots) {
      if (l.status !== 'stokta' && l.status !== 'uretimde') continue;
      const key = l.location || 'Konum belirsiz';
      const p = productMap.get(l.productId);
      const e = map.get(key) ?? { lots: 0, value: 0, items: new Map() };
      e.lots++;
      e.value += l.quantity * (p?.cost ?? 0);
      e.items.set(l.productId, (e.items.get(l.productId) ?? 0) + l.quantity);
      map.set(key, e);
    }
    return [...map.entries()].sort((a, b) => b[1].value - a[1].value);
  }, [lots, productMap]);

  const totals = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    const todayMoves = movements.filter((m) => m.at >= today);
    return {
      in: todayMoves.filter((m) => m.type === 'giris').reduce((s, m) => s + m.quantity, 0),
      out: todayMoves.filter((m) => m.type === 'cikis').reduce((s, m) => s + m.quantity, 0),
      fire: movements.filter((m) => m.type === 'fire' && m.at >= today - 30 * 86_400_000).reduce((s, m) => s + m.quantity, 0),
      low: products.filter((p) => (levels.get(p.id) ?? 0) <= p.minStock).length,
    };
  }, [movements, products, levels]);

  const unitOf = (p?: Product) => (p ? UNITS[p.unit] : '');

  return (
    <>
      <PageHead title="Stok ve barkod" subtitle="Parti etiketini veya ürün barkodunu okutun; giriş, çıkış, transfer ve fire tek dokunuşla kaydedilir." />

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Bugün giriş" value={fmtNum(totals.in, 1)} delta="tüm birimler toplamı" />
        <Stat label="Bugün çıkış" value={fmtNum(totals.out, 1)} delta="tüm birimler toplamı" />
        <Stat label="Fire (30 gün)" value={fmtNum(totals.fire, 1)} trend={totals.fire ? 'down' : 'flat'} />
        <Stat label="Kritik stokta ürün" value={fmtNum(totals.low)} trend={totals.low ? 'down' : 'up'} />
      </div>

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

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card
          title="Barkod / QR tara"
          subtitle="Parti etiketleri (LOT:…) ve ürün barkodları (EAN-13, QR) desteklenir"
          actions={
            scanning ? (
              <button className="btn sm" onClick={stopScan}>
                Kamerayı kapat
              </button>
            ) : (
              <button className="btn sm primary" onClick={startScan} disabled={!cameraSupported()}>
                Kamerayı aç
              </button>
            )
          }
        >
          <div className="video-wrap" style={{ aspectRatio: '16 / 10', marginBottom: 12 }}>
            <video ref={videoRef} playsInline muted aria-label="Barkod tarayıcı kamera görüntüsü" />
            {!scanning && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#ddd', fontSize: 14, textAlign: 'center', padding: 16 }}>
                {cameraSupported() ? 'Kamera kapalı. "Kamerayı aç" ile taramaya başlayın.' : 'Bu cihazda kamera erişimi yok; kodu aşağıya yazın.'}
              </div>
            )}
          </div>
          {scanError && <Alert tone="warn">{scanError}</Alert>}
          <div className="row" style={{ marginTop: 10 }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 180 }}
              placeholder="Barkodu yazın veya el terminaliyle okutun, Enter'a basın"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitManual()}
              aria-label="Barkod"
            />
            <button className="btn" onClick={submitManual}>
              Bul
            </button>
          </div>
          {notFound && (
            <div style={{ marginTop: 10 }}>
              <Alert tone="warn">{notFound}</Alert>
            </div>
          )}
          {found && (
            <div style={{ marginTop: 12, padding: 14, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)' }}>
              <div className="row between">
                <div>
                  <strong>
                    <Link to={`/urunler/${found.product.id}`}>{found.product.name}</Link>
                  </strong>
                  <div className="tiny">
                    {found.product.sku}
                    {found.lot && (
                      <>
                        {' '}
                        · Parti <span className="mono">{found.lot.lotNo}</span> · {fmtNum(found.lot.quantity, 1)} {unitOf(found.product)} · {found.lot.location || 'konum yok'}
                      </>
                    )}
                  </div>
                </div>
                <Badge tone="info">
                  Stok: {fmtNum(levels.get(found.product.id) ?? 0, 1)} {unitOf(found.product)}
                </Badge>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn sm primary" onClick={() => openQuick('giris')}>
                  Giriş
                </button>
                <button className="btn sm" onClick={() => openQuick('cikis')}>
                  Çıkış
                </button>
                <button className="btn sm" onClick={() => openQuick('transfer')}>
                  Transfer
                </button>
                <button className="btn sm danger" onClick={() => openQuick('fire')}>
                  Fire
                </button>
                <button className="btn sm ghost" onClick={() => setFound(null)}>
                  Temizle
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card title="Manuel hareket" subtitle="Barkod olmadan giriş, çıkış, transfer, sayım düzeltmesi veya fire kaydı">
          <div className="form-grid">
            <Field label="Ürün">
              <select className="input" value={manual.productId} onChange={(e) => setManual({ ...manual, productId: e.target.value, lotId: '' })}>
                <option value="">Seçin…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Parti (isteğe bağlı)">
              <select className="input" value={manual.lotId} onChange={(e) => setManual({ ...manual, lotId: e.target.value, from: lots.find((l) => l.id === e.target.value)?.location ?? manual.from })} disabled={!manual.productId}>
                <option value="">Belirtilmedi</option>
                {manualLots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lotNo} · {fmtNum(l.quantity, 1)} · {l.location}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tür">
              <select className="input" value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value as MovementType })}>
                {(Object.keys(MOVEMENT_TYPES) as MovementType[]).map((k) => (
                  <option key={k} value={k}>
                    {MOVEMENT_TYPES[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Miktar${manual.productId ? ` (${unitOf(productMap.get(manual.productId))})` : ''}`} hint={manual.type === 'sayim' ? 'Eksik için negatif girin' : undefined}>
              <input className="input" type="number" step="0.1" value={manual.quantity || ''} onChange={(e) => setManual({ ...manual, quantity: Number(e.target.value) })} />
            </Field>
            {manual.type !== 'giris' && (
              <Field label="Kaynak konum">
                <input className="input" value={manual.from} onChange={(e) => setManual({ ...manual, from: e.target.value })} />
              </Field>
            )}
            {(manual.type === 'giris' || manual.type === 'transfer') && (
              <Field label="Hedef konum">
                <input className="input" value={manual.to} onChange={(e) => setManual({ ...manual, to: e.target.value })} />
              </Field>
            )}
            <Field label="Not">
              <input className="input" value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} />
            </Field>
          </div>
          <div className="row end" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={saveManual}>
              Hareketi kaydet
            </button>
          </div>
        </Card>
      </div>

      <Card title="Depo özeti" subtitle="Aktif partilerin konum bazlı dağılımı (maliyet değeriyle)" className="">
        {byLocation.length === 0 ? (
          <Empty title="Konumlu parti yok" hint="Partilere depo/raf bilgisi girildiğinde özet burada görünür." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Konum</th>
                  <th className="num">Parti</th>
                  <th>İçerik</th>
                  <th className="num">Değer (maliyet)</th>
                </tr>
              </thead>
              <tbody>
                {byLocation.map(([loc, e]) => (
                  <tr key={loc}>
                    <td>
                      <strong>{loc}</strong>
                    </td>
                    <td className="num">{e.lots}</td>
                    <td className="small muted">
                      {[...e.items.entries()]
                        .map(([pid, q]) => {
                          const p = productMap.get(pid);
                          return `${p?.name ?? '?'} ${fmtNum(q, 1)} ${unitOf(p)}`;
                        })
                        .join(' · ')}
                    </td>
                    <td className="num">{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(e.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Tüm hareketler" subtitle={`Son ${fmtNum(Math.min(300, filteredMovements.length))} kayıt gösteriliyor`}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Ürün, parti, konum veya not ara…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Hareket ara" />
          <div className="chips">
            <button className={`chip ${typeFilter === 'tumu' ? 'active' : ''}`} onClick={() => setTypeFilter('tumu')}>
              Tümü
            </button>
            {(Object.keys(MOVEMENT_TYPES) as MovementType[]).map((k) => (
              <button key={k} className={`chip ${typeFilter === k ? 'active' : ''}`} onClick={() => setTypeFilter(k)}>
                {MOVEMENT_TYPES[k]}
              </button>
            ))}
          </div>
        </div>
        {filteredMovements.length === 0 ? (
          <Empty title="Hareket bulunamadı" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Tür</th>
                  <th>Ürün</th>
                  <th>Parti</th>
                  <th className="num">Miktar</th>
                  <th>Konum</th>
                  <th>Kaynak</th>
                  <th>Not</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((m) => {
                  const p = productMap.get(m.productId);
                  const l = m.lotId ? lotMap.get(m.lotId) : undefined;
                  const sign = m.type === 'sayim' ? Math.sign(m.quantity) : movementSign(m.type);
                  return (
                    <tr key={m.id}>
                      <td className="small">{fmtDateTime(m.at)}</td>
                      <td>
                        <Badge tone={typeTone(m.type)}>{MOVEMENT_TYPES[m.type]}</Badge>
                      </td>
                      <td>{p ? <Link to={`/urunler/${p.id}`}>{p.name}</Link> : <span className="muted">Silinmiş ürün</span>}</td>
                      <td className="mono">{l?.lotNo ?? '—'}</td>
                      <td className="num" style={{ color: sign > 0 ? 'var(--good)' : sign < 0 ? 'var(--bad)' : undefined }}>
                        {sign > 0 ? '+' : sign < 0 ? '−' : ''}
                        {fmtNum(Math.abs(m.quantity), 1)} {unitOf(p)}
                      </td>
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

      <Modal open={!!quick} title={quick ? `${MOVEMENT_TYPES[quick.type]} — ${found?.product.name ?? ''}` : ''} onClose={() => setQuick(null)}>
        {quick && found && (
          <div className="grid" style={{ gap: 14 }}>
            {found.lot && (
              <p className="small muted">
                Parti <span className="mono">{found.lot.lotNo}</span> · mevcut {fmtNum(found.lot.quantity, 1)} {unitOf(found.product)} · {found.lot.location || 'konum yok'}
              </p>
            )}
            <div className="form-grid">
              <Field label={`Miktar (${unitOf(found.product)})`}>
                <input className="input" type="number" min={0} step="0.1" autoFocus value={quick.quantity || ''} onChange={(e) => setQuick({ ...quick, quantity: Number(e.target.value) })} />
              </Field>
              {quick.type !== 'giris' && (
                <Field label="Kaynak konum">
                  <input className="input" value={quick.from} onChange={(e) => setQuick({ ...quick, from: e.target.value })} />
                </Field>
              )}
              {(quick.type === 'giris' || quick.type === 'transfer') && (
                <Field label="Hedef konum">
                  <input className="input" value={quick.to} onChange={(e) => setQuick({ ...quick, to: e.target.value })} placeholder="Depo B / Raf 2" />
                </Field>
              )}
              <Field label="Not">
                <input className="input" value={quick.note} onChange={(e) => setQuick({ ...quick, note: e.target.value })} />
              </Field>
            </div>
            <div className="row end">
              <button className="btn" onClick={() => setQuick(null)}>
                Vazgeç
              </button>
              <button className="btn primary" onClick={saveQuick}>
                Kaydet
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
