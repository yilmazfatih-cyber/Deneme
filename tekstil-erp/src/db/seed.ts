/**
 * Demo verisi — ilk açılışta yüklenir; Ayarlar'dan sıfırlanabilir.
 * Amaç: ekranların boş görünmemesi ve AI modüllerinin (tahmin, anomali, sınıflandırma) çalışabilmesi.
 */
import { db, getSettings, saveSettings } from './index';
import type {
  Customer,
  Invoice,
  JournalEntry,
  Lot,
  Order,
  Payment,
  Product,
  ProductionOrder,
  StockMovement,
} from './schema';
import { postInvoiceJournal } from '../ai/finance';

const DAY = 86_400_000;
const now = Date.now();
const d = (daysAgo: number, hour = 10) => {
  const t = new Date(now - daysAgo * DAY);
  t.setHours(hour, 0, 0, 0);
  return t.getTime();
};

const productRows: Omit<Product, 'createdAt' | 'updatedAt'>[] = [
  { id: 'p_pamuk_iplik_30', sku: 'IP-PAM-30/1', name: 'Pamuk iplik Ne 30/1', category: 'iplik', unit: 'kg', color: 'Ham', composition: '%100 pamuk', minStock: 500, price: 165, cost: 128, barcode: '8690001000011' },
  { id: 'p_polyester_iplik', sku: 'IP-PES-150', name: 'Polyester iplik 150 denye', category: 'iplik', unit: 'kg', color: 'Beyaz', composition: '%100 polyester', minStock: 300, price: 95, cost: 71, barcode: '8690001000028' },
  { id: 'p_suprem', sku: 'KM-SUP-180', name: 'Süprem kumaş 180 g', category: 'kumas', unit: 'kg', color: 'Lacivert', composition: '%100 pamuk', gsm: 180, widthCm: 180, minStock: 400, price: 320, cost: 236, barcode: '8690001000035' },
  { id: 'p_interlok', sku: 'KM-INT-220', name: 'İnterlok kumaş 220 g', category: 'kumas', unit: 'kg', color: 'Siyah', composition: '%95 pamuk %5 elastan', gsm: 220, widthCm: 170, minStock: 300, price: 410, cost: 302, barcode: '8690001000042' },
  { id: 'p_gabardin', sku: 'KM-GAB-240', name: 'Gabardin kumaş 240 g', category: 'kumas', unit: 'm', color: 'Haki', composition: '%97 pamuk %3 elastan', gsm: 240, widthCm: 150, minStock: 1000, price: 88, cost: 61, barcode: '8690001000059' },
  { id: 'p_denim', sku: 'KM-DNM-12OZ', name: 'Denim 12 oz', category: 'kumas', unit: 'm', color: 'İndigo', composition: '%98 pamuk %2 elastan', gsm: 400, widthCm: 150, minStock: 800, price: 142, cost: 104, barcode: '8690001000066' },
  { id: 'p_tshirt', sku: 'KF-TSH-001', name: 'Basic t-shirt (bisiklet yaka)', category: 'konfeksiyon', unit: 'adet', color: 'Beyaz', composition: '%100 pamuk süprem', minStock: 500, price: 145, cost: 92 },
  { id: 'p_sweat', sku: 'KF-SWT-001', name: 'Üç iplik sweatshirt', category: 'konfeksiyon', unit: 'adet', color: 'Gri melanj', composition: '%80 pamuk %20 polyester', minStock: 300, price: 390, cost: 262 },
  { id: 'p_gomlek', sku: 'KF-GOM-001', name: 'Poplin gömlek', category: 'konfeksiyon', unit: 'adet', color: 'Açık mavi', composition: '%100 pamuk poplin', minStock: 200, price: 420, cost: 275 },
  { id: 'p_fermuar', sku: 'AK-FRM-18', name: 'Metal fermuar 18 cm', category: 'aksesuar', unit: 'adet', minStock: 2000, price: 6.5, cost: 4.1 },
  { id: 'p_dugme', sku: 'AK-DGM-14', name: 'Sedef düğme 14 mm', category: 'aksesuar', unit: 'adet', minStock: 5000, price: 1.2, cost: 0.7 },
  { id: 'p_reaktif_boya', sku: 'HM-BOY-RKT', name: 'Reaktif boya (lacivert)', category: 'hammadde', unit: 'kg', minStock: 50, price: 980, cost: 790 },
];
const products: Product[] = productRows.map((p) => ({ ...p, createdAt: d(120), updatedAt: d(3) }));

const customers: Customer[] = [
  { id: 'c_marmara', name: 'Marmara Tekstil San. Tic. A.Ş.', taxNo: '6120345678', taxOffice: 'Beylikdüzü', phone: '0212 555 10 20', email: 'satinalma@marmaratekstil.example', city: 'İstanbul', country: 'Türkiye', segment: 'toptan', createdAt: d(300) },
  { id: 'c_ege', name: 'Ege Konfeksiyon Ltd. Şti.', taxNo: '3250987654', taxOffice: 'Bornova', phone: '0232 444 30 40', city: 'İzmir', country: 'Türkiye', segment: 'toptan', createdAt: d(260) },
  { id: 'c_anadolu', name: 'Anadolu Giyim Mağazaları', taxNo: '0710123456', taxOffice: 'Çankaya', phone: '0312 333 50 60', city: 'Ankara', country: 'Türkiye', segment: 'perakende', createdAt: d(200) },
  { id: 'c_nord', name: 'NordWear GmbH', taxNo: 'DE812345678', phone: '+49 40 1234567', city: 'Hamburg', country: 'Almanya', segment: 'ihracat', createdAt: d(180) },
  { id: 'c_denizli', name: 'Denizli Havlu ve Tekstil', taxNo: '2890123456', taxOffice: 'Pamukkale', city: 'Denizli', country: 'Türkiye', segment: 'toptan', createdAt: d(90) },
];

const lots: Lot[] = [
  { id: 'l1', productId: 'p_pamuk_iplik_30', lotNo: 'PRT-2025-0101', quantity: 1200, location: 'Depo A / Raf 1', stage: 'iplik', status: 'stokta', qualityGrade: 'A', supplier: 'Kahramanmaraş İplik', createdAt: d(40), updatedAt: d(40) },
  { id: 'l2', productId: 'p_suprem', lotNo: 'PRT-2025-0102', quantity: 650, location: 'Depo B / Raf 3', stage: 'apre', status: 'stokta', qualityGrade: 'A', createdAt: d(20), updatedAt: d(5) },
  { id: 'l3', productId: 'p_suprem', lotNo: 'PRT-2025-0103', quantity: 300, location: 'Boyahane', stage: 'boya', status: 'uretimde', createdAt: d(4), updatedAt: d(1) },
  { id: 'l4', productId: 'p_interlok', lotNo: 'PRT-2025-0104', quantity: 280, location: 'Depo B / Raf 4', stage: 'apre', status: 'stokta', qualityGrade: 'B', createdAt: d(15), updatedAt: d(2) },
  { id: 'l5', productId: 'p_gabardin', lotNo: 'PRT-2025-0105', quantity: 2400, location: 'Depo A / Raf 7', stage: 'apre', status: 'stokta', qualityGrade: 'A', createdAt: d(30), updatedAt: d(30) },
  { id: 'l6', productId: 'p_denim', lotNo: 'PRT-2025-0106', quantity: 1800, location: 'Depo A / Raf 8', stage: 'apre', status: 'stokta', qualityGrade: 'A', createdAt: d(25), updatedAt: d(25) },
  { id: 'l7', productId: 'p_tshirt', lotNo: 'PRT-2025-0107', quantity: 1500, location: 'Dikimhane', stage: 'dikis', status: 'uretimde', createdAt: d(6), updatedAt: d(0) },
  { id: 'l8', productId: 'p_tshirt', lotNo: 'PRT-2025-0108', quantity: 900, location: 'Depo C', stage: 'paketleme', status: 'stokta', qualityGrade: 'A', createdAt: d(12), updatedAt: d(3) },
  { id: 'l9', productId: 'p_sweat', lotNo: 'PRT-2025-0109', quantity: 420, location: 'Kalite', stage: 'kalite', status: 'uretimde', createdAt: d(8), updatedAt: d(1) },
  { id: 'l10', productId: 'p_gomlek', lotNo: 'PRT-2025-0110', quantity: 260, location: 'Depo C', stage: 'paketleme', status: 'stokta', qualityGrade: 'A', createdAt: d(10), updatedAt: d(2) },
];

const movements: StockMovement[] = [];
let mi = 0;
const mv = (m: Omit<StockMovement, 'id'>) => movements.push({ ...m, id: `m${++mi}` });
mv({ productId: 'p_pamuk_iplik_30', lotId: 'l1', type: 'giris', quantity: 2000, toLocation: 'Depo A / Raf 1', refType: 'fatura', note: 'Tedarikçi girişi', at: d(40) });
mv({ productId: 'p_pamuk_iplik_30', type: 'cikis', quantity: 800, fromLocation: 'Depo A / Raf 1', refType: 'uretim', note: 'Örmeye sevk', at: d(22) });
mv({ productId: 'p_polyester_iplik', type: 'giris', quantity: 600, toLocation: 'Depo A / Raf 2', refType: 'fatura', at: d(35) });
mv({ productId: 'p_polyester_iplik', type: 'cikis', quantity: 380, refType: 'uretim', at: d(18) });
mv({ productId: 'p_suprem', lotId: 'l2', type: 'giris', quantity: 650, toLocation: 'Depo B / Raf 3', refType: 'uretim', at: d(20) });
mv({ productId: 'p_interlok', lotId: 'l4', type: 'giris', quantity: 280, toLocation: 'Depo B / Raf 4', refType: 'uretim', at: d(15) });
mv({ productId: 'p_gabardin', lotId: 'l5', type: 'giris', quantity: 2400, toLocation: 'Depo A / Raf 7', refType: 'fatura', at: d(30) });
mv({ productId: 'p_gabardin', type: 'cikis', quantity: 600, refType: 'siparis', at: d(9) });
mv({ productId: 'p_denim', lotId: 'l6', type: 'giris', quantity: 1800, toLocation: 'Depo A / Raf 8', refType: 'fatura', at: d(25) });
mv({ productId: 'p_denim', type: 'fire', quantity: 35, note: 'Kenar hatası', at: d(11) });
mv({ productId: 'p_tshirt', lotId: 'l8', type: 'giris', quantity: 900, toLocation: 'Depo C', refType: 'uretim', at: d(12) });
mv({ productId: 'p_tshirt', type: 'cikis', quantity: 500, refType: 'siparis', at: d(5) });
mv({ productId: 'p_gomlek', lotId: 'l10', type: 'giris', quantity: 260, toLocation: 'Depo C', refType: 'uretim', at: d(10) });
mv({ productId: 'p_gomlek', type: 'cikis', quantity: 120, refType: 'siparis', at: d(3) });
mv({ productId: 'p_fermuar', type: 'giris', quantity: 3000, toLocation: 'Aksesuar deposu', refType: 'fatura', at: d(28) });
mv({ productId: 'p_fermuar', type: 'cikis', quantity: 1400, refType: 'uretim', at: d(7) });
mv({ productId: 'p_dugme', type: 'giris', quantity: 4000, toLocation: 'Aksesuar deposu', refType: 'fatura', at: d(28) });
mv({ productId: 'p_reaktif_boya', type: 'giris', quantity: 80, toLocation: 'Boyahane', refType: 'fatura', at: d(26) });
mv({ productId: 'p_reaktif_boya', type: 'cikis', quantity: 42, refType: 'uretim', at: d(4) });

const productionOrders: ProductionOrder[] = [
  { id: 'po1', orderNo: 'UR-2025-0021', productId: 'p_tshirt', quantity: 1500, stage: 'dikis', stageHistory: [{ stage: 'kesim', at: d(6) }, { stage: 'dikis', at: d(3) }], dueDate: d(-6), customerOrderId: 'o1', status: 'devam', createdAt: d(7) },
  { id: 'po2', orderNo: 'UR-2025-0022', productId: 'p_suprem', quantity: 300, stage: 'boya', stageHistory: [{ stage: 'orme', at: d(4) }, { stage: 'boya', at: d(1) }], dueDate: d(-4), status: 'devam', createdAt: d(4) },
  { id: 'po3', orderNo: 'UR-2025-0023', productId: 'p_sweat', quantity: 420, stage: 'kalite', stageHistory: [{ stage: 'kesim', at: d(8) }, { stage: 'dikis', at: d(5) }, { stage: 'kalite', at: d(1) }], dueDate: d(-2), customerOrderId: 'o2', status: 'devam', createdAt: d(9) },
  { id: 'po4', orderNo: 'UR-2025-0024', productId: 'p_gomlek', quantity: 500, stage: 'kesim', stageHistory: [{ stage: 'kesim', at: d(0) }], dueDate: d(-14), customerOrderId: 'o3', status: 'devam', createdAt: d(1) },
  { id: 'po5', orderNo: 'UR-2025-0019', productId: 'p_denim', quantity: 1800, stage: 'sevkiyat', stageHistory: [{ stage: 'dokuma', at: d(40) }, { stage: 'boya', at: d(33) }, { stage: 'apre', at: d(28) }, { stage: 'kalite', at: d(26) }, { stage: 'sevkiyat', at: d(25) }], dueDate: d(24), status: 'tamamlandi', createdAt: d(42) },
  { id: 'po6', orderNo: 'UR-2025-0025', productId: 'p_interlok', quantity: 600, stage: 'orme', stageHistory: [], dueDate: d(-20), status: 'planlandi', createdAt: d(0) },
];

const orders: Order[] = [
  { id: 'o1', orderNo: 'SIP-2025-0041', customerId: 'c_anadolu', lines: [{ productId: 'p_tshirt', quantity: 2000, unitPrice: 145 }], status: 'uretimde', orderDate: d(8), dueDate: d(-7), total: 290_000, currency: 'TRY' },
  { id: 'o2', orderNo: 'SIP-2025-0042', customerId: 'c_marmara', lines: [{ productId: 'p_sweat', quantity: 420, unitPrice: 385 }, { productId: 'p_suprem', quantity: 200, unitPrice: 315 }], status: 'uretimde', orderDate: d(10), dueDate: d(-3), total: 420 * 385 + 200 * 315, currency: 'TRY' },
  { id: 'o3', orderNo: 'SIP-2025-0043', customerId: 'c_nord', lines: [{ productId: 'p_gomlek', quantity: 500, unitPrice: 11.5 }], status: 'onaylandi', orderDate: d(2), dueDate: d(-16), total: 5750, currency: 'EUR' },
  { id: 'o4', orderNo: 'SIP-2025-0039', customerId: 'c_ege', lines: [{ productId: 'p_gabardin', quantity: 600, unitPrice: 88 }], status: 'tamamlandi', orderDate: d(14), dueDate: d(9), total: 52_800, currency: 'TRY' },
  { id: 'o5', orderNo: 'SIP-2025-0038', customerId: 'c_denizli', lines: [{ productId: 'p_denim', quantity: 1800, unitPrice: 140 }], status: 'tamamlandi', orderDate: d(30), dueDate: d(24), total: 252_000, currency: 'TRY' },
  { id: 'o6', orderNo: 'SIP-2025-0044', customerId: 'c_ege', lines: [{ productId: 'p_interlok', quantity: 600, unitPrice: 405 }], status: 'teklif', orderDate: d(1), dueDate: d(-25), total: 243_000, currency: 'TRY' },
];

function inv(partial: Omit<Invoice, 'subtotal' | 'vatTotal' | 'total' | 'createdAt' | 'currency' | 'source'> & { currency?: Invoice['currency'] }): Invoice {
  const subtotal = partial.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const vatTotal = partial.lines.reduce((s, l) => s + (l.quantity * l.unitPrice * l.vatRate) / 100, 0);
  return { ...partial, currency: partial.currency ?? 'TRY', source: 'manuel', subtotal, vatTotal, total: subtotal + vatTotal, createdAt: partial.date };
}

const invoices: Invoice[] = [
  // Satış faturaları (son 6 ay)
  inv({ id: 'f1', invoiceNo: 'TKS2025000000101', type: 'satis', counterpartyName: 'Denizli Havlu ve Tekstil', customerId: 'c_denizli', date: d(24), dueDate: d(-6), lines: [{ description: 'Denim 12 oz', quantity: 1800, unitPrice: 140, vatRate: 10 }], status: 'kesildi', category: 'satis-geliri' }),
  inv({ id: 'f2', invoiceNo: 'TKS2025000000102', type: 'satis', counterpartyName: 'Ege Konfeksiyon Ltd. Şti.', customerId: 'c_ege', date: d(9), dueDate: d(-21), lines: [{ description: 'Gabardin kumaş 240 g', quantity: 600, unitPrice: 88, vatRate: 10 }], status: 'odendi', category: 'satis-geliri' }),
  inv({ id: 'f3', invoiceNo: 'TKS2025000000098', type: 'satis', counterpartyName: 'Marmara Tekstil San. Tic. A.Ş.', customerId: 'c_marmara', date: d(48), dueDate: d(18), lines: [{ description: 'Süprem kumaş 180 g', quantity: 900, unitPrice: 310, vatRate: 10 }], status: 'odendi', category: 'satis-geliri' }),
  inv({ id: 'f4', invoiceNo: 'TKS2025000000095', type: 'satis', counterpartyName: 'Anadolu Giyim Mağazaları', customerId: 'c_anadolu', date: d(75), dueDate: d(45), lines: [{ description: 'Basic t-shirt', quantity: 1500, unitPrice: 138, vatRate: 10 }], status: 'odendi', category: 'satis-geliri' }),
  inv({ id: 'f5', invoiceNo: 'TKS2025000000091', type: 'satis', counterpartyName: 'NordWear GmbH', customerId: 'c_nord', date: d(105), dueDate: d(75), lines: [{ description: 'Poplin gömlek', quantity: 800, unitPrice: 11.2, vatRate: 0 }], status: 'odendi', category: 'satis-geliri', currency: 'EUR' }),
  inv({ id: 'f6', invoiceNo: 'TKS2025000000088', type: 'satis', counterpartyName: 'Marmara Tekstil San. Tic. A.Ş.', customerId: 'c_marmara', date: d(135), dueDate: d(105), lines: [{ description: 'İnterlok kumaş 220 g', quantity: 700, unitPrice: 395, vatRate: 10 }], status: 'odendi', category: 'satis-geliri' }),
  inv({ id: 'f7', invoiceNo: 'TKS2025000000084', type: 'satis', counterpartyName: 'Anadolu Giyim Mağazaları', customerId: 'c_anadolu', date: d(165), dueDate: d(135), lines: [{ description: 'Üç iplik sweatshirt', quantity: 600, unitPrice: 370, vatRate: 10 }], status: 'odendi', category: 'satis-geliri' }),
  inv({ id: 'f8', invoiceNo: 'TKS2025000000080', type: 'satis', counterpartyName: 'Ege Konfeksiyon Ltd. Şti.', customerId: 'c_ege', date: d(50), dueDate: d(20), lines: [{ description: 'Denim 12 oz', quantity: 400, unitPrice: 141, vatRate: 10 }], status: 'gecikti', category: 'satis-geliri' }),
  // Alış / gider faturaları
  inv({ id: 'g1', invoiceNo: 'KMI2025000004411', type: 'alis', counterpartyName: 'Kahramanmaraş İplik San. A.Ş.', counterpartyTaxNo: '5380012345', date: d(40), dueDate: d(10), lines: [{ description: 'Pamuk iplik Ne 30/1', quantity: 2000, unitPrice: 128, vatRate: 10 }], status: 'odendi', category: 'iplik-kumas' }),
  inv({ id: 'g2', invoiceNo: 'BED2025000112233', type: 'alis', counterpartyName: 'Bursa Elektrik Dağıtım', date: d(12), dueDate: d(-3), lines: [{ description: 'Elektrik tüketimi (Ekim)', quantity: 1, unitPrice: 184_300, vatRate: 20 }], status: 'kesildi', category: 'enerji' }),
  inv({ id: 'g3', invoiceNo: 'BED2025000098877', type: 'alis', counterpartyName: 'Bursa Elektrik Dağıtım', date: d(42), dueDate: d(27), lines: [{ description: 'Elektrik tüketimi (Eylül)', quantity: 1, unitPrice: 121_900, vatRate: 20 }], status: 'odendi', category: 'enerji' }),
  inv({ id: 'g4', invoiceNo: 'BED2025000087766', type: 'alis', counterpartyName: 'Bursa Elektrik Dağıtım', date: d(72), dueDate: d(57), lines: [{ description: 'Elektrik tüketimi (Ağustos)', quantity: 1, unitPrice: 118_400, vatRate: 20 }], status: 'odendi', category: 'enerji' }),
  inv({ id: 'g5', invoiceNo: 'DYS2025000003344', type: 'alis', counterpartyName: 'DyeStar Kimya Ltd.', date: d(26), dueDate: d(-4), lines: [{ description: 'Reaktif boya lacivert', quantity: 80, unitPrice: 790, vatRate: 20 }], status: 'kesildi', category: 'boya-kimyasal' }),
  inv({ id: 'g6', invoiceNo: 'ARS2025000000912', type: 'alis', counterpartyName: 'Aras Lojistik', date: d(5), dueDate: d(-25), lines: [{ description: 'Ankara sevkiyatı 2 palet', quantity: 1, unitPrice: 9_800, vatRate: 20 }], status: 'kesildi', category: 'nakliye' }),
  inv({ id: 'g7', invoiceNo: 'KRA2025000000011', type: 'alis', counterpartyName: 'Organize Sanayi Gayrimenkul', date: d(2), dueDate: d(-5), lines: [{ description: 'Fabrika kirası (Kasım)', quantity: 1, unitPrice: 240_000, vatRate: 20 }], status: 'kesildi', category: 'kira' }),
  inv({ id: 'g8', invoiceNo: 'KRA2025000000010', type: 'alis', counterpartyName: 'Organize Sanayi Gayrimenkul', date: d(32), dueDate: d(25), lines: [{ description: 'Fabrika kirası (Ekim)', quantity: 1, unitPrice: 240_000, vatRate: 20 }], status: 'odendi', category: 'kira' }),
  inv({ id: 'g9', invoiceNo: 'MKS2025000000452', type: 'alis', counterpartyName: 'Mayer & Cie Servis', date: d(16), dueDate: d(-14), lines: [{ description: 'Yuvarlak örme makinesi bakımı', quantity: 1, unitPrice: 46_500, vatRate: 20 }], status: 'kesildi', category: 'makine-bakim' }),
  inv({ id: 'g10', invoiceNo: 'YKM2025000000078', type: 'alis', counterpartyName: 'YKK Metal Fermuar', date: d(28), dueDate: d(0), lines: [{ description: 'Metal fermuar 18 cm', quantity: 3000, unitPrice: 4.1, vatRate: 20 }, { description: 'Sedef düğme 14 mm', quantity: 4000, unitPrice: 0.7, vatRate: 20 }], status: 'kesildi', category: 'hammadde' }),
];

const payments: Payment[] = [
  { id: 'py1', invoiceId: 'f2', direction: 'tahsilat', amount: invoices[1].total, date: d(4), method: 'havale', counterparty: 'Ege Konfeksiyon Ltd. Şti.' },
  { id: 'py2', invoiceId: 'f3', direction: 'tahsilat', amount: invoices[2].total, date: d(20), method: 'cek', counterparty: 'Marmara Tekstil San. Tic. A.Ş.' },
  { id: 'py3', invoiceId: 'f4', direction: 'tahsilat', amount: invoices[3].total, date: d(47), method: 'havale', counterparty: 'Anadolu Giyim Mağazaları' },
  { id: 'py4', invoiceId: 'g1', direction: 'odeme', amount: invoices[8].total, date: d(12), method: 'havale', counterparty: 'Kahramanmaraş İplik San. A.Ş.' },
  { id: 'py5', invoiceId: 'g3', direction: 'odeme', amount: invoices[10].total, date: d(28), method: 'havale', counterparty: 'Bursa Elektrik Dağıtım' },
  { id: 'py6', invoiceId: 'g8', direction: 'odeme', amount: invoices[15].total, date: d(26), method: 'havale', counterparty: 'Organize Sanayi Gayrimenkul' },
  { id: 'py7', direction: 'odeme', amount: 612_000, date: d(2), method: 'havale', counterparty: 'Personel maaşları (Ekim)', note: 'Bordro' },
  { id: 'py8', direction: 'odeme', amount: 598_000, date: d(32), method: 'havale', counterparty: 'Personel maaşları (Eylül)', note: 'Bordro' },
  { id: 'py9', direction: 'odeme', amount: 143_000, date: d(6), method: 'havale', counterparty: 'SGK primleri', note: 'Ekim dönemi' },
];

export async function ensureSeeded(): Promise<void> {
  const settings = await getSettings();
  if (settings.seeded) return;
  const count = await db.products.count();
  if (count > 0) {
    await saveSettings({ seeded: true });
    return;
  }
  await seedDemo();
}

export async function seedDemo(): Promise<void> {
  const journal: JournalEntry[] = invoices.filter((i) => i.status !== 'taslak').map((i) => postInvoiceJournal(i));
  await db.transaction('rw', db.tables, async () => {
    await db.products.bulkPut(products);
    await db.customers.bulkPut(customers);
    await db.lots.bulkPut(lots);
    await db.movements.bulkPut(movements);
    await db.productionOrders.bulkPut(productionOrders);
    await db.orders.bulkPut(orders);
    await db.invoices.bulkPut(invoices);
    await db.payments.bulkPut(payments);
    await db.journal.bulkPut(journal);
  });
  await saveSettings({ seeded: true });
}
