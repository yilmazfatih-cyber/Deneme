/**
 * Türkçe fatura metninden yapılandırılmış çıkarım — saf fonksiyon, DOM gerektirmez.
 * OCR veya PDF metninden: fatura no, tarih, vade, VKN, karşı taraf, ara toplam, KDV, toplam, para birimi, satırlar.
 * Kural tabanlıdır; LLM gerekmez. Güven puanı bulunan alanların ağırlığı ve OCR güveninden hesaplanır.
 */
import type { Currency, InvoiceExtraction, InvoiceLine, InvoiceType } from '../db/schema';
import { parseTrNumber } from '../lib/format';
import { categorize } from './finance';
import { foldLower, foldTr } from '../lib/text';

export interface ParseContext {
  companyName?: string;
  taxNo?: string;
  ocrConfidence?: number; // 0..1
}

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');
const isOwnName = (line: string, own?: string) => {
  if (!own) return false;
  const a = foldLower(line);
  const b = foldLower(own);
  return a.includes(b) || (b.length >= 6 && b.includes(a));
};

/** OCR'nin sık karıştırdığı harfleri sayı bağlamında düzeltir: O→0, l/I→1, S→5, B→8.
 *  Yalnızca en az iki rakam içeren ve sadece rakam/ayraç/karışan-harf karakterlerinden oluşan parçalara dokunur. */
export function fixOcrDigits(s: string): string {
  const MAP: Record<string, string> = { O: '0', o: '0', I: '1', l: '1', S: '5', B: '8' };
  return s.replace(/[\dOoIlSB.,]+/g, (tok) => {
    const digits = (tok.match(/\d/g) ?? []).length;
    const eligible = digits >= 2 || (digits >= 1 && tok.length >= 2 && /^\d/.test(tok));
    if (!eligible || !/[OoIlSB]/.test(tok)) return tok;
    return tok.replace(/[OoIlSB]/g, (ch) => MAP[ch] ?? ch);
  });
}

const NUM = String.raw`-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|-?\d+(?:[.,]\d{1,2})?`;

function num(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  let s = fixOcrDigits(raw).trim().replace(/\s/g, '');
  // "1.800" gibi yalnızca nokta ayraçlı ve 3'lü grupları olan sayı binlik ayraçtır (Türk biçimi)
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return parseTrNumber(s);
}

function parseDate(raw: string): number | undefined {
  const s = fixOcrDigits(raw.trim());
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return undefined;
}

const DATE_RE = String.raw`(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2})`;

function findAfterLabel(text: string, labels: RegExp, valueRe: string): string | undefined {
  // Etiketten sonra aynı satırda (en fazla 40 karakter içinde) değeri arar
  const re = new RegExp(`(?:${labels.source})[^\\n\\d-]{0,40}?(${valueRe})`, 'i' + (labels.flags.includes('u') ? 'u' : ''));
  const m = text.match(re);
  return m?.[1];
}

function findAmount(text: string, labels: RegExp): number | undefined {
  // Etiket ile aynı satırda sondaki para tutarını yakala
  const lines = text.split('\n');
  for (const line of lines) {
    if (!labels.test(line)) continue;
    const after = line.replace(labels, '§');
    const tail = after.slice(after.indexOf('§') + 1);
    const matches = [...fixOcrDigits(tail).matchAll(new RegExp(NUM, 'g'))].map((m) => m[0]).filter((m) => /\d/.test(m));
    // yüzde değerini (örn. %20) atla
    const candidates = matches.filter((m) => !new RegExp(`%\\s*${m.replace('.', '\\.')}`).test(fixOcrDigits(tail)));
    const last = candidates[candidates.length - 1] ?? matches[matches.length - 1];
    const v = num(last);
    if (v !== undefined) return Math.abs(v);
  }
  return undefined;
}

function detectCurrency(text: string): Currency {
  if (/€|\bEUR\b|\bEURO\b/i.test(text)) return 'EUR';
  if (/\$|\bUSD\b|\bDOLAR\b/i.test(text)) return 'USD';
  return 'TRY';
}

function detectInvoiceNo(text: string): string | undefined {
  const efatura = text.match(/\b([A-Z]{3}20\d{2}\d{9})\b/);
  if (efatura) return efatura[1];
  const labeled = findAfterLabel(text, /fatura\s*no(?:su)?|belge\s*no|seri\s*[-/]?\s*s[ıi]ra\s*no|fatura\s*numaras[ıi]|invoice\s*no/i, String.raw`[A-Z0-9][A-Z0-9/-]{3,24}`);
  if (labeled && !/^tarih/i.test(labeled)) return labeled.toUpperCase();
  return undefined;
}

function detectTaxNo(text: string, ownTaxNo?: string): string | undefined {
  const all = [...fixOcrDigits(text).matchAll(/(?:vkn|vergi\s*no(?:su)?|vergi\s*kimlik\s*no|tckn|tc\s*kimlik\s*no)[^\d\n]{0,25}(\d{10,11})/gi)].map((m) => m[1]);
  const others = all.filter((t) => t !== ownTaxNo);
  if (others.length) return others[0];
  // Etiketsiz 10 haneli sayı (telefon olmasın: 0 ile başlamayan)
  const loose = [...fixOcrDigits(text).matchAll(/\b([1-9]\d{9})\b/g)].map((m) => m[1]).filter((t) => t !== ownTaxNo);
  return loose[0];
}

const TITLE_RE = /(?:\ba\.\s?s\.?|\ba\.s\b|\bas\.|\bltd\.?|\bsti\.?|\blimited\b|\banonim\b|\bsan\.|\btic\.|\bsanayi\b|\bticaret\b|\bgmbh\b|\binc\.?|\bs\.?r\.?l\.?\b|\bkoll\.)/i;

/**
 * Karşı taraf unvanı. Fatura türüne göre öncelik değişir:
 *  - alış faturasında satıcı (başlıktaki unvan, "Satıcı:" etiketi) aranır; "Sayın/Alıcı" bölümü bizimdir,
 *  - satış faturasında "Sayın/Alıcı" sonrası aranır.
 * Karşılaştırmalar aksan katlamalı yapılır (OCR "Ş"yi "S" okuyabilir).
 */
function detectCounterparty(text: string, type: InvoiceType, companyName?: string): string | undefined {
  const rawLines = text.split('\n').map((l) => l.replace(/\s{2,}/g, ' ').trim());
  const idx = rawLines.map((_, i) => i).filter((i) => rawLines[i].length >= 4 && rawLines[i].length <= 90);
  const folded = rawLines.map((l) => foldTr(l));
  const own = (l: string) => isOwnName(l, companyName);
  let buyer: string | undefined;
  let seller: string | undefined;
  const titles: string[] = [];
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const f = folded[i];
    const m = f.match(/^(?:sayin|alici|musteri|unvani?)\s*[:：]?\s*(.*)$/i);
    const ms = f.match(/^(?:satici|duzenleyen|tedarikci)\s*[:：]?\s*(.*)$/i);
    const pick = (rest: string) => {
      const cand = rest.trim() ? rawLines[i].slice(rawLines[i].length - rest.trim().length) : rawLines[idx[k + 1] ?? -1];
      return cand && !own(cand) && !/^\d/.test(cand) ? cleanName(cand) : undefined;
    };
    if (m) buyer = buyer ?? pick(m[1]);
    else if (ms) seller = seller ?? pick(ms[1]);
    else if (TITLE_RE.test(f) && !own(rawLines[i]) && !/fatura|kdv|toplam|tarih/i.test(f)) titles.push(cleanName(rawLines[i]));
  }
  if (type === 'satis') return buyer ?? titles[0];
  return seller ?? titles.find((t) => t !== buyer) ?? buyer;
}

function cleanName(s: string): string {
  return s
    .replace(/\s*(vkn|vergi\s*no|tckn|tel|adres).*$/i, '')
    .replace(/[|•·]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const UNIT_RE = String.raw`(?:kg|adet|ad|m|mt|metre|top|lt|paket|çift|kutu|saat|ay|gün|hizmet)`;

function detectLines(text: string): InvoiceLine[] {
  const out: InvoiceLine[] = [];
  const re = new RegExp(
    String.raw`^(.{3,60}?)\s+(${NUM})\s*(${UNIT_RE})?\.?\s+(${NUM})\s+(?:%\s*(\d{1,2})\s+)?(?:(${NUM})\s+)?(${NUM})\s*(?:₺|tl|try|€|eur|\$|usd)?\s*$`,
    'i',
  );
  for (const rawLine of text.split('\n')) {
    const line = fixOcrDigits(rawLine.trim());
    if (/toplam|kdv|matrah|ödenecek|iskonto|tutar[ıi]\s*$/i.test(line) && !/^\S.{3,}\s+\d/.test(line)) continue;
    const m = line.match(re);
    if (!m) continue;
    const desc = m[1].replace(/^\d+\s*[-.)]?\s*/, '').trim();
    const qty = num(m[2]);
    const unitPrice = num(m[4]);
    const vat = m[5] ? Number(m[5]) : undefined;
    const amount = num(m[7]);
    if (!desc || qty === undefined || unitPrice === undefined || amount === undefined) continue;
    if (/toplam|kdv|matrah|ödenecek/i.test(desc)) continue;
    // miktar × fiyat ≈ tutar (±%3) olmalı — rastgele sayı dizilerini ele
    if (Math.abs(qty * unitPrice - amount) > Math.max(1, amount * 0.03)) continue;
    out.push({ description: desc, quantity: qty, unitPrice, vatRate: vat ?? 20 });
  }
  return out;
}

export function parseInvoiceText(rawText: string, ctx: ParseContext = {}): InvoiceExtraction {
  const text = rawText.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const ftext = foldTr(text); // etiket aramaları aksansız metinde yapılır
  const notes: string[] = [];
  let found = 0;
  let weight = 0;
  const mark = (ok: unknown, w: number) => {
    weight += w;
    if (ok !== undefined && ok !== '' && ok !== null) found += w;
  };

  const invoiceNo = detectInvoiceNo(text);
  mark(invoiceNo, 2);

  const dateRaw = findAfterLabel(ftext, /fatura\s*tarihi|duzenle(?:n)?me\s*tarihi|tarih|date/i, DATE_RE);
  let date = dateRaw ? parseDate(dateRaw) : undefined;
  if (!date) {
    const any = text.match(new RegExp(DATE_RE));
    if (any) date = parseDate(any[1]);
  }
  mark(date, 2);

  const dueRaw = findAfterLabel(ftext, /vade\s*tarihi|son\s*odeme(?:\s*tarihi)?|odeme\s*tarihi|vade/i, DATE_RE);
  const dueDate = dueRaw ? parseDate(dueRaw) : undefined;
  mark(dueDate, 0.5);

  const counterpartyTaxNo = detectTaxNo(text, ctx.taxNo);
  mark(counterpartyTaxNo, 1);

  // Tür: kendi şirketimiz satıcı konumunda mı?
  let type: InvoiceType = 'alis';
  const lowered = foldLower(text);
  const ownIdx = ctx.companyName ? lowered.indexOf(foldLower(ctx.companyName)) : -1;
  const ownTaxIdx = ctx.taxNo ? text.indexOf(ctx.taxNo) : -1;
  const buyerIdx = lowered.search(/sayin|alici/);
  const ownPos = ownIdx >= 0 ? ownIdx : ownTaxIdx;
  if (ownPos >= 0) {
    // Kendi adımız "Sayın/Alıcı" bölümünden ÖNCE geçiyorsa satıcıyız (fatura başlığı satıcıya aittir)
    if (buyerIdx < 0 || ownPos < buyerIdx) type = 'satis';
  }
  if (/\bsatis\s*faturasi\b/i.test(lowered) && ownPos >= 0) type = 'satis';

  const counterpartyName = detectCounterparty(text, type, ctx.companyName);
  mark(counterpartyName, 2);

  const currency = detectCurrency(text);

  let subtotal = findAmount(ftext, /mal\s*\/?\s*hizmet\s*toplam\s*tutari|ara\s*toplam|matrah|kdv\s*matrahi|toplam\s*tutar(?!\s*\(kdv\s*dahil\))|net\s*tutar/i);
  let vatTotal = findAmount(ftext, /hesaplanan\s*kdv|toplam\s*kdv|kdv\s*tutari|kdv\s*\(?%?\s*\d{1,2}\)?|kdv/i);
  let total = findAmount(ftext, /odenecek\s*tutar|vergiler\s*dahil\s*toplam(?:\s*tutar)?|genel\s*toplam|kdv\s*dahil\s*toplam|toplam\s*\(kdv\s*dahil\)|^\s*toplam\s*[:\s]|grand\s*total|total/im);
  // "TOPLAM" tek başına; ara toplam ile aynıysa genel toplam değildir
  if (total !== undefined && subtotal !== undefined && Math.abs(total - subtotal) < 0.01 && vatTotal) total = subtotal + vatTotal;

  const vatRateRaw = text.match(/kdv\s*\(?\s*%\s*(\d{1,2})|%\s*(\d{1,2})\s*kdv/i);
  let vatRate = vatRateRaw ? Number(vatRateRaw[1] ?? vatRateRaw[2]) : undefined;

  // Tutarlılık ve türetme
  if (subtotal !== undefined && vatTotal !== undefined && total !== undefined) {
    if (Math.abs(subtotal + vatTotal - total) > Math.max(1, total * 0.01)) {
      notes.push(`Ara toplam (${subtotal}) + KDV (${vatTotal}) ≠ genel toplam (${total}); değerleri kontrol edin.`);
    }
  } else if (subtotal !== undefined && vatTotal !== undefined) {
    total = Math.round((subtotal + vatTotal) * 100) / 100;
    notes.push('Genel toplam metinde bulunamadı; ara toplam + KDV olarak türetildi.');
  } else if (subtotal !== undefined && total !== undefined) {
    vatTotal = Math.round((total - subtotal) * 100) / 100;
    notes.push('KDV tutarı metinde bulunamadı; toplam − ara toplam olarak türetildi.');
  } else if (vatTotal !== undefined && total !== undefined) {
    subtotal = Math.round((total - vatTotal) * 100) / 100;
    notes.push('Ara toplam metinde bulunamadı; toplam − KDV olarak türetildi.');
  } else if (total !== undefined && vatRate !== undefined) {
    subtotal = Math.round((total / (1 + vatRate / 100)) * 100) / 100;
    vatTotal = Math.round((total - subtotal) * 100) / 100;
    notes.push(`Sadece genel toplam bulundu; %${vatRate} KDV varsayımıyla ayrıştırıldı.`);
  } else if (subtotal !== undefined && vatRate !== undefined) {
    vatTotal = Math.round(((subtotal * vatRate) / 100) * 100) / 100;
    total = Math.round((subtotal + vatTotal) * 100) / 100;
    notes.push(`Sadece ara toplam bulundu; %${vatRate} KDV eklendi.`);
  }
  if (vatRate === undefined && subtotal && vatTotal !== undefined) {
    const r = Math.round((vatTotal / subtotal) * 100);
    if ([0, 1, 10, 18, 20].includes(r)) vatRate = r;
  }
  mark(subtotal, 1.5);
  mark(vatTotal, 1.5);
  mark(total, 2);

  if (total === undefined) notes.push('Fatura toplamı bulunamadı; elle girin.');
  if (!date) notes.push('Fatura tarihi bulunamadı.');
  if (!counterpartyName) notes.push('Karşı taraf unvanı tespit edilemedi.');

  let lines = detectLines(text).filter((l) => !ctx.companyName || !trLower(l.description).includes(trLower(ctx.companyName)));
  if (vatRate !== undefined) lines = lines.map((l) => ({ ...l, vatRate: l.vatRate === 20 && vatRate !== undefined ? vatRate : l.vatRate }));
  if (lines.length) {
    const sum = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    if (subtotal !== undefined && Math.abs(sum - subtotal) > Math.max(1, subtotal * 0.02)) {
      notes.push(`Satır toplamı (${Math.round(sum)}) ara toplamla (${Math.round(subtotal)}) uyuşmuyor; satırlar tek kalemde özetlendi.`);
      lines = [];
    }
  }
  if (!lines.length) {
    lines = [
      {
        description: 'Fatura toplamı',
        quantity: 1,
        unitPrice: subtotal ?? total ?? 0,
        vatRate: vatRate ?? (subtotal && vatTotal ? Math.round((vatTotal / subtotal) * 100) : 20),
      },
    ];
  } else {
    found += 1;
  }
  weight += 1;

  const cat = categorize(`${counterpartyName ?? ''} ${lines.map((l) => l.description).join(' ')} ${text.slice(0, 600)}`, type);
  const fieldScore = weight ? found / weight : 0;
  const ocr = ctx.ocrConfidence ?? 0.9;
  const confidence = Math.round(Math.max(0.05, Math.min(0.99, 0.7 * fieldScore + 0.3 * ocr - notes.length * 0.03)) * 100) / 100;

  return {
    invoiceNo,
    date,
    dueDate,
    counterpartyName,
    counterpartyTaxNo,
    subtotal,
    vatTotal,
    total,
    vatRate,
    currency,
    lines,
    category: cat.category,
    type,
    confidence,
    notes,
  };
}
