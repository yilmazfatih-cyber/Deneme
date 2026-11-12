/*
 * vga.c — VGA metin kipi sürücüsü.
 *
 * Ekran belleği 0xB8000 adresindeki 80x25'lik bir uint16_t dizisidir:
 * düşük bayt karakter (kod sayfası 437), yüksek bayt renk (ön | arka << 4).
 * Kaynak kod UTF-8'dir; vga_yaz() UTF-8'i çözüp CP437'ye eşler. CP437'de
 * ç ö ü Ç Ö Ü vardır ama ğ ş ı İ Ğ Ş yoktur; onlar en yakın ASCII harfe düşer.
 */
#include "vga.h"
#include "io.h"

static volatile uint16_t *tampon;
static int satir;
static int sutun;
static uint8_t renk = 0x0F; /* siyah üzerine beyaz */

static uint16_t hucre(uint8_t c, uint8_t r)
{
    return (uint16_t)c | (uint16_t)((uint16_t)r << 8);
}

static void imlec_guncelle(void)
{
    uint16_t konum = (uint16_t)(satir * VGA_GENISLIK + sutun);
    outb(0x3D4, 0x0F); /* CRT denetleyicisi: imleç konumu düşük bayt */
    outb(0x3D5, (uint8_t)(konum & 0xFF));
    outb(0x3D4, 0x0E); /* yüksek bayt */
    outb(0x3D5, (uint8_t)(konum >> 8));
}

void vga_baslat(volatile uint16_t *t)
{
    tampon = t;
    renk = 0x0F;
    vga_temizle();
}

void vga_temizle(void)
{
    for (int i = 0; i < VGA_GENISLIK * VGA_YUKSEKLIK; i++)
        tampon[i] = hucre(' ', renk);
    satir = 0;
    sutun = 0;
    imlec_guncelle();
}

void vga_renk(uint8_t on, uint8_t arka)
{
    renk = (uint8_t)((on & 0x0F) | (uint8_t)((arka & 0x0F) << 4));
}

static void kaydir(void)
{
    for (int i = 0; i < VGA_GENISLIK * (VGA_YUKSEKLIK - 1); i++)
        tampon[i] = tampon[i + VGA_GENISLIK];
    for (int i = 0; i < VGA_GENISLIK; i++)
        tampon[(VGA_YUKSEKLIK - 1) * VGA_GENISLIK + i] = hucre(' ', renk);
    satir = VGA_YUKSEKLIK - 1;
}

void vga_karakter(uint8_t c)
{
    if (c == '\n') {
        sutun = 0;
        satir++;
    } else if (c == '\r') {
        sutun = 0;
    } else if (c == '\b') {
        if (sutun > 0) {
            sutun--;
            tampon[satir * VGA_GENISLIK + sutun] = hucre(' ', renk);
        }
    } else if (c == '\t') {
        sutun = (sutun + 8) & ~7;
    } else {
        tampon[satir * VGA_GENISLIK + sutun] = hucre(c, renk);
        sutun++;
    }
    if (sutun >= VGA_GENISLIK) {
        sutun = 0;
        satir++;
    }
    if (satir >= VGA_YUKSEKLIK)
        kaydir();
    imlec_guncelle();
}

uint8_t cp437_donustur(uint32_t kp)
{
    if (kp < 0x80)
        return (uint8_t)kp;
    switch (kp) {
    case 0x00C7: return 0x80; /* Ç */
    case 0x00FC: return 0x81; /* ü */
    case 0x00E7: return 0x87; /* ç */
    case 0x00F6: return 0x94; /* ö */
    case 0x00D6: return 0x99; /* Ö */
    case 0x00DC: return 0x9A; /* Ü */
    case 0x011F: return 'g';  /* ğ: CP437'de yok */
    case 0x011E: return 'G';  /* Ğ */
    case 0x015F: return 's';  /* ş */
    case 0x015E: return 'S';  /* Ş */
    case 0x0131: return 'i';  /* ı */
    case 0x0130: return 'I';  /* İ */
    case 0x2014: return '-';  /* uzun tire */
    case 0x2192: return 0x1A; /* →: CP437'de 0x1A konumundaki ok glifi */
    default:     return '?';
    }
}

/* Bir UTF-8 dizisinden sıradaki kod noktasını okur; *s ilerletilir. */
static uint32_t utf8_oku(const char **s)
{
    const unsigned char *p = (const unsigned char *)*s;
    uint32_t kp;
    int devam;
    if (p[0] < 0x80) {
        kp = p[0];
        devam = 0;
    } else if ((p[0] & 0xE0) == 0xC0) {
        kp = p[0] & 0x1F;
        devam = 1;
    } else if ((p[0] & 0xF0) == 0xE0) {
        kp = p[0] & 0x0F;
        devam = 2;
    } else if ((p[0] & 0xF8) == 0xF0) {
        kp = p[0] & 0x07;
        devam = 3;
    } else {
        *s += 1; /* geçersiz başlangıç baytı */
        return 0xFFFD;
    }
    for (int i = 1; i <= devam; i++) {
        if ((p[i] & 0xC0) != 0x80) { /* yarım kalmış dizi */
            *s += i;
            return 0xFFFD;
        }
        kp = (kp << 6) | (p[i] & 0x3F);
    }
    *s += devam + 1;
    return kp;
}

void vga_yaz(const char *s)
{
    while (*s)
        vga_karakter(cp437_donustur(utf8_oku(&s)));
}

void vga_onluk(uint32_t sayi)
{
    char b[11];
    int i = 0;
    do {
        b[i++] = (char)('0' + sayi % 10); /* 32 bit bölme: libgcc gerekmez */
        sayi /= 10;
    } while (sayi);
    while (i)
        vga_karakter((uint8_t)b[--i]);
}

void vga_onaltilik(uint32_t sayi)
{
    static const char rakam[] = "0123456789ABCDEF";
    vga_yaz("0x");
    for (int kayma = 28; kayma >= 0; kayma -= 4)
        vga_karakter((uint8_t)rakam[(sayi >> kayma) & 0xF]);
}

void vga_konuma_yaz(int s, int k, const char *metin)
{
    /* Durum satırı için: imleci ve kaydırmayı etkilemeden yazar. */
    while (*metin && k < VGA_GENISLIK) {
        tampon[s * VGA_GENISLIK + k] = hucre(cp437_donustur(utf8_oku(&metin)), 0x1F);
        k++;
    }
}

int vga_satir(void)
{
    return satir;
}

int vga_sutun(void)
{
    return sutun;
}
