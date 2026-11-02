import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, Empty, Field, Modal, PageHead, Stat, confirmDelete } from '../components/ui';
import { db } from '../db';
import { PRODUCT_CATEGORIES, UNITS, type Product, type ProductCategory, type StockMovement, type Unit } from '../db/schema';
import { fmtMoney, fmtNum } from '../lib/format';
import { uid } from '../lib/id';
import { stockFromMovements } from '../lib/stock';

type Draft = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;
const NO_PRODUCTS: Product[] = [];
const NO_MOVEMENTS: StockMovement[] = [];

const emptyDraft = (): Draft => ({
  sku: '',
  name: '',
  category: 'kumas',
  unit: 'kg',
  color: '',
  composition: '',
  gsm: undefined,
  widthCm: undefined,
  minStock: 0,
  price: 0,
  cost: 0,
  barcode: '',
});

export default function Products() {
  const navigate = useNavigate();
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []) ?? NO_PRODUCTS;
  const movements = useLiveQuery(() => db.movements.toArray(), []) ?? NO_MOVEMENTS;
  const levels = useMemo(() => stockFromMovements(movements), [movements]);

  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ProductCategory | 'tumu'>('tumu');
  const [onlyLow, setOnlyLow] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr-TR');
    return products.filter((p) => {
      if (cat !== 'tumu' && p.category !== cat) return false;
      if (onlyLow && (levels.get(p.id) ?? 0) > p.minStock) return false;
      if (!t) return true;
      return [p.name, p.sku, p.barcode ?? '', p.color ?? ''].some((s) => s.toLocaleLowerCase('tr-TR').includes(t));
    });
  }, [products, q, cat, onlyLow, levels]);

  const totals = useMemo(() => {
    let costValue = 0;
    let saleValue = 0;
    let low = 0;
    for (const p of products) {
      const s = Math.max(0, levels.get(p.id) ?? 0);
      costValue += s * p.cost;
      saleValue += s * p.price;
      if (s <= p.minStock) low++;
    }
    return { costValue, saleValue, low };
  }, [products, levels]);

  const openNew = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setError('');
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    const { id, createdAt, updatedAt, ...rest } = p;
    void id;
    void createdAt;
    void updatedAt;
    setDraft(rest);
    setError('');
  };
  const close = () => {
    setDraft(null);
    setEditing(null);
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.sku.trim()) {
      setError('Ürün adı ve stok kodu zorunludur.');
      return;
    }
    const dup = products.find((p) => p.sku.toLocaleLowerCase('tr-TR') === draft.sku.trim().toLocaleLowerCase('tr-TR') && p.id !== editing?.id);
    if (dup) {
      setError(`"${draft.sku}" stok kodu zaten ${dup.name} için kullanılıyor.`);
      return;
    }
    const now = Date.now();
    const clean: Draft = {
      ...draft,
      sku: draft.sku.trim(),
      name: draft.name.trim(),
      barcode: draft.barcode?.trim() || undefined,
      color: draft.color?.trim() || undefined,
      composition: draft.composition?.trim() || undefined,
      gsm: draft.gsm || undefined,
      widthCm: draft.widthCm || undefined,
    };
    if (editing) await db.products.put({ ...editing, ...clean, updatedAt: now });
    else await db.products.add({ ...clean, id: uid('p'), createdAt: now, updatedAt: now });
    close();
  };

  const remove = async (p: Product) => {
    if (!confirmDelete(`"${p.name}" ürünü`)) return;
    await db.transaction('rw', [db.products, db.lots, db.movements], async () => {
      await db.products.delete(p.id);
      await db.lots.where('productId').equals(p.id).delete();
      await db.movements.where('productId').equals(p.id).delete();
    });
  };

  const num = (v: string) => (v === '' ? 0 : Number(v));
  const optNum = (v: string) => (v === '' ? undefined : Number(v));

  return (
    <>
      <PageHead
        title="Ürünler"
        subtitle="İplik, kumaş, konfeksiyon ve aksesuar kartları; stok seviyeleri hareketlerden hesaplanır."
        actions={
          <button className="btn primary" onClick={openNew}>
            + Yeni ürün
          </button>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Ürün sayısı" value={fmtNum(products.length)} />
        <Stat label="Stok değeri (maliyet)" value={fmtMoney(totals.costValue)} />
        <Stat label="Stok değeri (satış)" value={fmtMoney(totals.saleValue)} />
        <Stat label="Kritik stokta" value={fmtNum(totals.low)} delta={totals.low ? 'Eşiğin altında ürün var' : 'Tüm ürünler eşiğin üstünde'} trend={totals.low ? 'down' : 'up'} />
      </div>

      <Card>
        <div className="row between" style={{ marginBottom: 12 }}>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Ad, stok kodu veya barkod ara…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ürün ara" />
          <div className="chips">
            <button className={`chip ${cat === 'tumu' ? 'active' : ''}`} onClick={() => setCat('tumu')}>
              Tümü
            </button>
            {(Object.keys(PRODUCT_CATEGORIES) as ProductCategory[]).map((k) => (
              <button key={k} className={`chip ${cat === k ? 'active' : ''}`} onClick={() => setCat(k)}>
                {PRODUCT_CATEGORIES[k]}
              </button>
            ))}
            <button className={`chip ${onlyLow ? 'active' : ''}`} onClick={() => setOnlyLow((v) => !v)}>
              Yalnızca kritik
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <Empty title="Ürün bulunamadı" hint="Arama ölçütlerini değiştirin veya yeni ürün ekleyin." action={<button className="btn" onClick={openNew}>Yeni ürün</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Stok kodu</th>
                  <th>Ürün</th>
                  <th>Kategori</th>
                  <th>Özellik</th>
                  <th className="num">Stok</th>
                  <th className="num">Eşik</th>
                  <th className="num">Maliyet</th>
                  <th className="num">Satış</th>
                  <th>Durum</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const s = levels.get(p.id) ?? 0;
                  const low = s <= p.minStock;
                  return (
                    <tr key={p.id} className="clickable" onClick={() => navigate(`/urunler/${p.id}`)}>
                      <td className="mono">{p.sku}</td>
                      <td>
                        <strong>{p.name}</strong>
                        {p.color && <div className="tiny">{p.color}</div>}
                      </td>
                      <td>{PRODUCT_CATEGORIES[p.category]}</td>
                      <td className="small muted">
                        {[p.composition, p.gsm ? `${p.gsm} g/m²` : '', p.widthCm ? `${p.widthCm} cm` : ''].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="num">
                        <strong>{fmtNum(s, 1)}</strong> <span className="tiny">{UNITS[p.unit]}</span>
                      </td>
                      <td className="num muted">{fmtNum(p.minStock)}</td>
                      <td className="num">{fmtMoney(p.cost)}</td>
                      <td className="num">{fmtMoney(p.price)}</td>
                      <td>{low ? <Badge tone="warn">Kritik stok</Badge> : <Badge tone="good">Yeterli</Badge>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row end">
                          <button className="btn sm" onClick={() => openEdit(p)}>
                            Düzenle
                          </button>
                          <button className="btn sm danger" onClick={() => remove(p)}>
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!draft} title={editing ? 'Ürünü düzenle' : 'Yeni ürün'} onClose={close}>
        {draft && (
          <div className="grid" style={{ gap: 14 }}>
            <div className="form-grid">
              <Field label="Stok kodu (SKU) *">
                <input className="input" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} placeholder="KM-SUP-180" />
              </Field>
              <Field label="Ürün adı *">
                <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Süprem kumaş 180 g" />
              </Field>
              <Field label="Kategori">
                <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ProductCategory })}>
                  {(Object.keys(PRODUCT_CATEGORIES) as ProductCategory[]).map((k) => (
                    <option key={k} value={k}>
                      {PRODUCT_CATEGORIES[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Birim">
                <select className="input" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value as Unit })}>
                  {(Object.keys(UNITS) as Unit[]).map((k) => (
                    <option key={k} value={k}>
                      {UNITS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Renk">
                <input className="input" value={draft.color ?? ''} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
              </Field>
              <Field label="Kompozisyon">
                <input className="input" value={draft.composition ?? ''} onChange={(e) => setDraft({ ...draft, composition: e.target.value })} placeholder="%100 pamuk" />
              </Field>
              <Field label="Gramaj (g/m²)">
                <input className="input" type="number" min={0} value={draft.gsm ?? ''} onChange={(e) => setDraft({ ...draft, gsm: optNum(e.target.value) })} />
              </Field>
              <Field label="En (cm)">
                <input className="input" type="number" min={0} value={draft.widthCm ?? ''} onChange={(e) => setDraft({ ...draft, widthCm: optNum(e.target.value) })} />
              </Field>
              <Field label="Kritik stok eşiği">
                <input className="input" type="number" min={0} value={draft.minStock} onChange={(e) => setDraft({ ...draft, minStock: num(e.target.value) })} />
              </Field>
              <Field label="Maliyet (₺)">
                <input className="input" type="number" min={0} step="0.01" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: num(e.target.value) })} />
              </Field>
              <Field label="Satış fiyatı (₺)">
                <input className="input" type="number" min={0} step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: num(e.target.value) })} />
              </Field>
              <Field label="Barkod (EAN-13 / QR)" hint="Boş bırakılırsa etiketlerde stok kodu kullanılır">
                <input className="input" value={draft.barcode ?? ''} onChange={(e) => setDraft({ ...draft, barcode: e.target.value })} />
              </Field>
            </div>
            {error && <div className="alert bad">{error}</div>}
            <div className="row end">
              <button className="btn" onClick={close}>
                Vazgeç
              </button>
              <button className="btn primary" onClick={save}>
                {editing ? 'Kaydet' : 'Ürünü ekle'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
