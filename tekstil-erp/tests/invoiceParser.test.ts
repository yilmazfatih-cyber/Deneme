import { describe, expect, it } from 'vitest';
import { fixOcrDigits, parseInvoiceText } from '../src/ai/invoiceParser';

const ctx = { companyName: 'Şirketim Tekstil', taxNo: '1234567890' };

const efatura = `
e-FATURA
Bursa Elektrik Dağıtım A.Ş.
VKN: 6120345678   Bursa
Fatura No: BED2025000112233
Fatura Tarihi: 21.10.2025
Vade Tarihi: 05.11.2025
SAYIN
Şirketim Tekstil
VKN: 1234567890
Açıklama            Miktar  Birim Fiyat   KDV   Tutar
Elektrik tüketimi (Ekim)  1 adet  184.300,00  %20  184.300,00
Mal Hizmet Toplam Tutarı: 184.300,00 TL
Hesaplanan KDV (%20): 36.860,00 TL
Vergiler Dahil Toplam Tutar: 221.160,00 TL
Ödenecek Tutar: 221.160,00 TL
`;

const satis = `
Şirketim Tekstil San. Tic. Ltd. Şti.
VKN 1234567890  Organize Sanayi Bölgesi
SATIŞ FATURASI   Fatura No: TKS2025000000101   Tarih: 08/10/2025
Sayın Denizli Havlu ve Tekstil A.Ş.
Vergi No: 2890123456
1  Denim 12 oz   1.800 m   140,00   252.000,00
Ara Toplam      252.000,00
KDV %10          25.200,00
Genel Toplam    277.200,00 ₺
`;

const ocrBozuk = `
DyeStar Kimya Ltd. Şti.
Vergi No : 8l20345679
Fatura No : DYS2025000003344     Tarih : 07.10.2025
Reaktif boya lacivert   8O kg  79O,OO   63.2OO,OO
Ara Toplam : 63.2OO,OO
KDV %20 : 12.64O,OO
TOPLAM : 75.84O,OO TL
`;

const eksik = `
Aras Lojistik Hizmetleri A.Ş.
Ankara sevkiyatı 2 palet nakliye
Genel Toplam: 11.760,00 TL
KDV %20
`;

describe('fixOcrDigits', () => {
  it('sayı bağlamındaki harfleri düzeltir', () => {
    expect(fixOcrDigits('1.234,5O')).toBe('1.234,50');
    expect(fixOcrDigits('79O,OO')).toBe('790,00');
    expect(fixOcrDigits('Toplam')).toBe('Toplam');
  });
});

describe('parseInvoiceText', () => {
  it('e-fatura alış faturasını okur', () => {
    const r = parseInvoiceText(efatura, ctx);
    expect(r.invoiceNo).toBe('BED2025000112233');
    expect(r.date).toBe(new Date(2025, 9, 21).getTime());
    expect(r.dueDate).toBe(new Date(2025, 10, 5).getTime());
    expect(r.counterpartyTaxNo).toBe('6120345678');
    expect(r.counterpartyName).toMatch(/Bursa Elektrik/);
    expect(r.subtotal).toBe(184300);
    expect(r.vatTotal).toBe(36860);
    expect(r.total).toBe(221160);
    expect(r.vatRate).toBe(20);
    expect(r.type).toBe('alis');
    expect(r.category).toBe('enerji');
    expect(r.currency).toBe('TRY');
    expect(r.confidence).toBeGreaterThan(0.75);
  });

  it('kendi şirketimiz satıcıysa satış faturası sayar ve satırları çözer', () => {
    const r = parseInvoiceText(satis, ctx);
    expect(r.type).toBe('satis');
    expect(r.invoiceNo).toBe('TKS2025000000101');
    expect(r.counterpartyName).toMatch(/Denizli Havlu/);
    expect(r.counterpartyTaxNo).toBe('2890123456');
    expect(r.subtotal).toBe(252000);
    expect(r.vatTotal).toBe(25200);
    expect(r.total).toBe(277200);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].description).toMatch(/Denim/);
    expect(r.lines[0].quantity).toBe(1800);
    expect(r.lines[0].unitPrice).toBe(140);
    expect(r.lines[0].vatRate).toBe(10);
    expect(r.category).toBe('satis-geliri');
  });

  it('OCR hatalı rakamları toparlar', () => {
    const r = parseInvoiceText(ocrBozuk, { ...ctx, ocrConfidence: 0.7 });
    expect(r.subtotal).toBe(63200);
    expect(r.vatTotal).toBe(12640);
    expect(r.total).toBe(75840);
    expect(r.counterpartyTaxNo).toBe('8120345679');
    expect(r.category).toBe('boya-kimyasal');
    expect(r.lines[0].quantity).toBe(80);
    expect(r.lines[0].unitPrice).toBe(790);
  });

  it('eksik alanları türetir ve not düşer', () => {
    const r = parseInvoiceText(eksik, ctx);
    expect(r.total).toBe(11760);
    expect(r.subtotal).toBe(9800);
    expect(r.vatTotal).toBe(1960);
    expect(r.category).toBe('nakliye');
    expect(r.notes.some((n) => n.includes('varsayım'))).toBe(true);
    expect(r.confidence).toBeLessThan(0.75);
  });
});

describe('aksansız OCR metni (Ş→S, Ö→O)', () => {
  const text = `FATURA
Bursa Elektrik Dagitim A.S.
VKN: 1234567890  Vergi Dairesi: Nilufer
Fatura No: BED2025000112299
Fatura Tarihi: 15.10.2026
Son Odeme Tarihi: 30.10.2026
Sayin: Sirketim Tekstil San. Tic. Ltd. Sti.
Elektrik tuketimi Eylul 2026   1 adet   184.300,00   184.300,00
Mal Hizmet Toplam Tutari: 184.300,00 TL
Hesaplanan KDV (%20): 36.860,00 TL
Odenecek Tutar: 221.160,00 TL`;
  const r = parseInvoiceText(text, { companyName: 'Şirketim Tekstil', taxNo: '9990001112' });

  it('satıcıyı karşı taraf olarak seçer, kendi şirketimizi değil', () => {
    expect(r.type).toBe('alis');
    expect(r.counterpartyName).toMatch(/Bursa Elektrik/);
  });
  it('aksansız etiketlerden vade ve tutarları okur', () => {
    expect(r.dueDate).toBeDefined();
    expect(r.subtotal).toBe(184300);
    expect(r.vatTotal).toBe(36860);
    expect(r.total).toBe(221160);
  });
  it('KDV/vergi dairesi kalıplarına aldanmadan enerji kategorisi verir', () => {
    expect(r.category).toBe('enerji');
  });
});
