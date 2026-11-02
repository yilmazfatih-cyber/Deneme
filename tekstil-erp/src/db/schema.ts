/**
 * Veri modeli — tüm modüller bu tipleri kullanır.
 * Kişiye/şirkete özel her şey tarayıcının IndexedDB'sinde (Dexie) durur; sunucu yoktur.
 */
export type ID = string;

// ---------- Ürün ve üretim ----------
export type ProductCategory = 'iplik' | 'kumas' | 'konfeksiyon' | 'aksesuar' | 'hammadde';
export const PRODUCT_CATEGORIES: Record<ProductCategory, string> = {
  iplik: 'İplik',
  kumas: 'Kumaş',
  konfeksiyon: 'Konfeksiyon',
  aksesuar: 'Aksesuar',
  hammadde: 'Hammadde',
};

export type Unit = 'kg' | 'm' | 'adet' | 'top';
export const UNITS: Record<Unit, string> = { kg: 'kg', m: 'metre', adet: 'adet', top: 'top' };

export interface Product {
  id: ID;
  sku: string; // stok kodu
  name: string;
  category: ProductCategory;
  unit: Unit;
  color?: string;
  composition?: string; // örn. %100 pamuk
  gsm?: number; // gramaj g/m²
  widthCm?: number; // en
  minStock: number; // kritik stok eşiği
  price: number; // satış fiyatı (TRY)
  cost: number; // maliyet (TRY)
  barcode?: string; // EAN-13 / QR içeriği
  imageDataUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export type ProductionStage =
  | 'iplik'
  | 'dokuma'
  | 'orme'
  | 'boya'
  | 'apre'
  | 'kesim'
  | 'dikis'
  | 'kalite'
  | 'paketleme'
  | 'sevkiyat';

export const PRODUCTION_STAGES: { key: ProductionStage; label: string }[] = [
  { key: 'iplik', label: 'İplik' },
  { key: 'dokuma', label: 'Dokuma' },
  { key: 'orme', label: 'Örme' },
  { key: 'boya', label: 'Boya' },
  { key: 'apre', label: 'Apre' },
  { key: 'kesim', label: 'Kesim' },
  { key: 'dikis', label: 'Dikiş' },
  { key: 'kalite', label: 'Kalite' },
  { key: 'paketleme', label: 'Paketleme' },
  { key: 'sevkiyat', label: 'Sevkiyat' },
];

export type LotStatus = 'uretimde' | 'stokta' | 'sevk' | 'iade';
export const LOT_STATUS: Record<LotStatus, string> = {
  uretimde: 'Üretimde',
  stokta: 'Stokta',
  sevk: 'Sevk edildi',
  iade: 'İade',
};

export interface Lot {
  id: ID;
  productId: ID;
  lotNo: string; // parti numarası — etikette QR olarak basılır
  quantity: number;
  location: string; // depo / raf
  stage: ProductionStage;
  status: LotStatus;
  qualityGrade?: 'A' | 'B' | 'C';
  supplier?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export type MovementType = 'giris' | 'cikis' | 'transfer' | 'sayim' | 'fire';
export const MOVEMENT_TYPES: Record<MovementType, string> = {
  giris: 'Giriş',
  cikis: 'Çıkış',
  transfer: 'Transfer',
  sayim: 'Sayım düzeltme',
  fire: 'Fire',
};

export interface StockMovement {
  id: ID;
  productId: ID;
  lotId?: ID;
  type: MovementType;
  quantity: number; // her zaman pozitif; yön type ile belirlenir
  fromLocation?: string;
  toLocation?: string;
  refType?: 'siparis' | 'fatura' | 'uretim' | 'manuel' | 'barkod';
  refId?: ID;
  note?: string;
  at: number;
}

export type ProductionStatus = 'planlandi' | 'devam' | 'tamamlandi' | 'iptal';
export const PRODUCTION_STATUS: Record<ProductionStatus, string> = {
  planlandi: 'Planlandı',
  devam: 'Devam ediyor',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
};

export interface ProductionOrder {
  id: ID;
  orderNo: string;
  productId: ID;
  quantity: number;
  stage: ProductionStage;
  stageHistory: { stage: ProductionStage; at: number; note?: string }[];
  dueDate: number;
  customerOrderId?: ID;
  status: ProductionStatus;
  createdAt: number;
}

// ---------- Müşteri ve sipariş ----------
export type CustomerSegment = 'toptan' | 'perakende' | 'ihracat';
export const CUSTOMER_SEGMENTS: Record<CustomerSegment, string> = {
  toptan: 'Toptan',
  perakende: 'Perakende',
  ihracat: 'İhracat',
};

export interface Customer {
  id: ID;
  name: string;
  taxNo?: string; // VKN / TCKN
  taxOffice?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  segment: CustomerSegment;
  notes?: string;
  createdAt: number;
}

export type Currency = 'TRY' | 'USD' | 'EUR';

export type OrderStatus = 'teklif' | 'onaylandi' | 'uretimde' | 'sevk' | 'tamamlandi' | 'iptal';
export const ORDER_STATUS: Record<OrderStatus, string> = {
  teklif: 'Teklif',
  onaylandi: 'Onaylandı',
  uretimde: 'Üretimde',
  sevk: 'Sevk edildi',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
};

export interface OrderLine {
  productId: ID;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: ID;
  orderNo: string;
  customerId: ID;
  lines: OrderLine[];
  status: OrderStatus;
  orderDate: number;
  dueDate: number;
  total: number;
  currency: Currency;
  note?: string;
}

// ---------- Finans ----------
export type InvoiceType = 'satis' | 'alis';
export type InvoiceStatus = 'taslak' | 'kesildi' | 'odendi' | 'gecikti' | 'iptal';
export const INVOICE_STATUS: Record<InvoiceStatus, string> = {
  taslak: 'Taslak',
  kesildi: 'Kesildi',
  odendi: 'Ödendi',
  gecikti: 'Gecikti',
  iptal: 'İptal',
};

/** Gider / gelir kategorileri — AI sınıflandırıcı bunlardan birini seçer */
export type FinanceCategory =
  | 'hammadde'
  | 'iplik-kumas'
  | 'boya-kimyasal'
  | 'enerji'
  | 'personel'
  | 'kira'
  | 'nakliye'
  | 'makine-bakim'
  | 'vergi-sgk'
  | 'banka-finansman'
  | 'pazarlama'
  | 'ofis-genel'
  | 'satis-geliri'
  | 'diger';

export const FINANCE_CATEGORIES: Record<FinanceCategory, string> = {
  hammadde: 'Hammadde',
  'iplik-kumas': 'İplik / Kumaş alımı',
  'boya-kimyasal': 'Boya ve kimyasal',
  enerji: 'Enerji (elektrik, doğalgaz, su)',
  personel: 'Personel',
  kira: 'Kira',
  nakliye: 'Nakliye ve lojistik',
  'makine-bakim': 'Makine ve bakım',
  'vergi-sgk': 'Vergi ve SGK',
  'banka-finansman': 'Banka ve finansman',
  pazarlama: 'Pazarlama ve fuar',
  'ofis-genel': 'Ofis ve genel gider',
  'satis-geliri': 'Satış geliri',
  diger: 'Diğer',
};

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number; // 0, 1, 10, 20
}

export interface Invoice {
  id: ID;
  invoiceNo: string;
  type: InvoiceType;
  counterpartyName: string;
  counterpartyTaxNo?: string;
  customerId?: ID;
  date: number;
  dueDate?: number;
  lines: InvoiceLine[];
  subtotal: number;
  vatTotal: number;
  total: number;
  currency: Currency;
  status: InvoiceStatus;
  category: FinanceCategory;
  source: 'manuel' | 'ocr' | 'pdf' | 'siparis';
  sourceDocumentId?: ID;
  aiConfidence?: number; // 0..1 — OCR/çıkarım güveni
  aiNotes?: string[]; // AI'nin uyarıları (örn. "KDV toplamı satırlarla uyuşmuyor")
  createdAt: number;
}

export type PaymentMethod = 'nakit' | 'havale' | 'kredi-karti' | 'cek' | 'senet';
export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  nakit: 'Nakit',
  havale: 'Havale / EFT',
  'kredi-karti': 'Kredi kartı',
  cek: 'Çek',
  senet: 'Senet',
};

export interface Payment {
  id: ID;
  invoiceId?: ID;
  direction: 'tahsilat' | 'odeme';
  amount: number;
  date: number;
  method: PaymentMethod;
  counterparty?: string;
  note?: string;
}

/** Tek Düzen Hesap Planı'na göre otomatik yevmiye kaydı */
export interface JournalLine {
  account: string; // örn. "120 Alıcılar"
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: ID;
  date: number;
  description: string;
  lines: JournalLine[];
  refType: 'fatura' | 'odeme' | 'manuel';
  refId?: ID;
  auto: boolean; // AI tarafından üretildi
  createdAt: number;
}

// ---------- Belgeler (OCR / PDF) ----------
export type DocumentKind = 'fatura' | 'irsaliye' | 'sozlesme' | 'siparis-formu' | 'diger';
export const DOCUMENT_KINDS: Record<DocumentKind, string> = {
  fatura: 'Fatura',
  irsaliye: 'İrsaliye',
  sozlesme: 'Sözleşme',
  'siparis-formu': 'Sipariş formu',
  diger: 'Diğer',
};

export interface InvoiceExtraction {
  invoiceNo?: string;
  date?: number;
  dueDate?: number;
  counterpartyName?: string;
  counterpartyTaxNo?: string;
  subtotal?: number;
  vatTotal?: number;
  total?: number;
  vatRate?: number;
  currency?: Currency;
  lines: InvoiceLine[];
  category: FinanceCategory;
  type: InvoiceType;
  confidence: number;
  notes: string[];
}

export interface StoredDocument {
  id: ID;
  name: string;
  mimeType: string;
  size: number;
  kind: DocumentKind;
  text: string; // çıkarılan metin (arama için)
  pages: number;
  ocrConfidence?: number;
  blob?: Blob;
  thumbnailDataUrl?: string;
  extraction?: InvoiceExtraction;
  linkedInvoiceId?: ID;
  createdAt: number;
}

// ---------- Kamera analizi ----------
export interface CameraZone {
  id: ID;
  name: string; // örn. "Giriş", "Kumaş reyonu", "Kasa"
  // kare içindeki normalize koordinatlar (0..1)
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CameraSession {
  id: ID;
  startedAt: number;
  endedAt?: number;
  label?: string; // örn. "Mağaza girişi"
  zones: CameraZone[];
}

/** Dakikalık özet — ham görüntü asla saklanmaz (KVKK) */
export interface VisitorSample {
  id: ID;
  sessionId: ID;
  at: number; // dakika başı (ms)
  avgCount: number; // o dakikadaki ortalama kişi sayısı
  maxCount: number;
  entries: number; // yeni giren tahmini kişi
  avgDwellSec: number; // ortalama kalış süresi
  zoneCounts: Record<string, number>; // zoneId → ortalama kişi
  heat: number[]; // 8×6 ısı haritası (48 hücre, normalize 0..1)
}

// ---------- Ayarlar ----------
export interface LlmSettings {
  provider: 'none' | 'ollama' | 'openai-compatible';
  baseUrl: string; // örn. http://localhost:11434/v1
  model: string; // örn. llama3.1, qwen2.5
  apiKey?: string;
}

export interface AppSettings {
  id: 'main';
  companyName: string;
  taxNo?: string;
  address?: string;
  currency: Currency;
  llm: LlmSettings;
  cameraSampleIntervalSec: number;
  ocrLanguages: string; // tesseract dil kodu, örn. "tur+eng"
  seeded: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'main',
  companyName: 'Şirketim Tekstil',
  currency: 'TRY',
  llm: { provider: 'none', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
  cameraSampleIntervalSec: 2,
  ocrLanguages: 'tur+eng',
  seeded: false,
};
