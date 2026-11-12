/*
 * birim_testleri.c — çekirdeğin donanımdan bağımsız parçalarını normal bir
 * Linux süreci olarak test eder (make test). Port G/Ç'si sahtedir: outb()
 * çağrıları bir günlüğe yazılır, böylece PIC/PIT programlama sırası
 * QEMU olmadan doğrulanır.
 */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "klavye.h"
#include "pic.h"
#include "tanimlayici.h"
#include "vga.h"

static int toplam, basarisiz;

#define KONTROL(kosul)                                                           \
    do {                                                                         \
        toplam++;                                                                \
        if (!(kosul)) {                                                          \
            basarisiz++;                                                         \
            fprintf(stderr, "BAŞARISIZ %s:%d: %s\n", __FILE__, __LINE__, #kosul); \
        }                                                                        \
    } while (0)

/* ---- sahte port G/Ç ---- */
struct yazma {
    uint16_t port;
    uint8_t deger;
};
static struct yazma gunluk[512];
static int gunluk_n;

void outb(uint16_t port, uint8_t deger)
{
    if (port == 0x80) /* io_bekle(): yalnız gecikme, sıraya dahil değil */
        return;
    if (gunluk_n < 512)
        gunluk[gunluk_n++] = (struct yazma){port, deger};
}

uint8_t inb(uint16_t port)
{
    (void)port;
    return 0;
}

static int gunluk_esit(const struct yazma *beklenen, int n)
{
    if (gunluk_n != n)
        return 0;
    for (int i = 0; i < n; i++)
        if (gunluk[i].port != beklenen[i].port || gunluk[i].deger != beklenen[i].deger)
            return 0;
    return 1;
}

/* ---- sahte VGA belleği ---- */
static uint16_t ekran[VGA_GENISLIK * VGA_YUKSEKLIK];

static uint8_t kar(int s, int k)
{
    return (uint8_t)(ekran[s * VGA_GENISLIK + k] & 0xFF);
}

static void test_vga_yazi(void)
{
    vga_baslat(ekran);
    vga_yaz("Merhaba");
    KONTROL(kar(0, 0) == 'M' && kar(0, 6) == 'a');
    KONTROL(vga_satir() == 0 && vga_sutun() == 7);
    KONTROL((ekran[0] >> 8) == 0x0F); /* varsayılan renk: siyah üstüne beyaz */
    vga_yaz("\nx");
    KONTROL(vga_satir() == 1 && kar(1, 0) == 'x');
}

static void test_vga_turkce(void)
{
    vga_baslat(ekran);
    vga_yaz("çÖü ğşıİ");
    const uint8_t beklenen[] = {0x87, 0x99, 0x81, ' ', 'g', 's', 'i', 'I'};
    for (int i = 0; i < 8; i++)
        KONTROL(kar(0, i) == beklenen[i]);
    KONTROL(cp437_donustur(0x00C7) == 0x80); /* Ç */
    KONTROL(cp437_donustur(0x2192) == 0x1A); /* →: açılış mesajında kullanılıyor */
    KONTROL(cp437_donustur(0x2603) == '?');  /* kar adamı: karşılığı yok */
}

static void test_vga_gecersiz_utf8(void)
{
    vga_baslat(ekran);
    vga_yaz("a\xFF" "b");
    KONTROL(kar(0, 0) == 'a' && kar(0, 1) == '?' && kar(0, 2) == 'b');
}

static void test_vga_kaydirma(void)
{
    vga_baslat(ekran);
    for (int i = 0; i < VGA_YUKSEKLIK; i++) {
        vga_karakter((uint8_t)('a' + i));
        vga_karakter('\n');
    }
    /* 25. satır sonu ekranı bir satır yukarı kaydırır: 'a' kaybolur. */
    KONTROL(kar(0, 0) == 'b');
    KONTROL(kar(23, 0) == 'y');
    KONTROL(kar(24, 0) == ' ');
    KONTROL(vga_satir() == VGA_YUKSEKLIK - 1);
}

static void test_vga_sarma_ve_geri_al(void)
{
    vga_baslat(ekran);
    for (int i = 0; i < VGA_GENISLIK + 1; i++)
        vga_karakter('z');
    KONTROL(vga_satir() == 1 && vga_sutun() == 1);
    vga_baslat(ekran);
    vga_yaz("ab\b");
    KONTROL(vga_sutun() == 1 && kar(0, 1) == ' ');
}

static void test_sayilar(void)
{
    vga_baslat(ekran);
    vga_onluk(0);
    vga_karakter(' ');
    vga_onluk(4294967295u);
    vga_karakter(' ');
    vga_onaltilik(0x2BADB002u);
    const char *beklenen = "0 4294967295 0x2BADB002";
    for (int i = 0; beklenen[i]; i++)
        KONTROL(kar(0, i) == (uint8_t)beklenen[i]);
}

static void test_imlec_portlari(void)
{
    vga_baslat(ekran);
    vga_yaz("abc");
    gunluk_n = 0;
    vga_karakter('d'); /* imleç (0,4) → konum 4 */
    const struct yazma beklenen[] = {{0x3D4, 0x0F}, {0x3D5, 4}, {0x3D4, 0x0E}, {0x3D5, 0}};
    KONTROL(gunluk_esit(beklenen, 4));
}

static void test_konuma_yaz(void)
{
    vga_baslat(ekran);
    vga_yaz("x");
    vga_konuma_yaz(0, 70, "ışık");
    KONTROL(kar(0, 70) == 'i' && kar(0, 71) == 's' && kar(0, 72) == 'i' && kar(0, 73) == 'k');
    KONTROL(vga_sutun() == 1); /* imleç yerinden oynamaz */
}

static void test_klavye(void)
{
    klavye_sifirla();
    KONTROL(klavye_cevir(0x23) == 'h');
    KONTROL(klavye_cevir(0x17) == 'i');
    KONTROL(klavye_cevir(0x97) == 0); /* 'i' bırakıldı */
    KONTROL(klavye_cevir(0x2A) == 0); /* sol Shift basıldı */
    KONTROL(klavye_cevir(0x1E) == 'A');
    KONTROL(klavye_cevir(0x02) == '!');
    KONTROL(klavye_cevir(0xAA) == 0); /* sol Shift bırakıldı */
    KONTROL(klavye_cevir(0x1E) == 'a');
    KONTROL(klavye_cevir(0x1C) == '\n');
    KONTROL(klavye_cevir(0x0E) == '\b');
    KONTROL(klavye_cevir(0x39) == ' ');
    KONTROL(klavye_cevir(0x58) == 0); /* F12: tabloda yok */
}

static void test_halka_tampon(void)
{
    klavye_sifirla();
    KONTROL(klavye_oku() == -1);
    for (int i = 0; i < 70; i++)
        klavye_tampona_ekle((char)('0' + i % 10));
    int okunan = 0;
    int ilk = klavye_oku();
    if (ilk >= 0)
        okunan++;
    while (klavye_oku() >= 0)
        okunan++;
    KONTROL(ilk == '0');   /* FIFO sırası */
    KONTROL(okunan == 63); /* 64 yuva: dolu/boş ayrımı için biri hep boş */
}

static void test_pic_sirasi(void)
{
    gunluk_n = 0;
    pic_yeniden_esle(0x20, 0x28);
    const struct yazma beklenen[] = {
        {0x20, 0x11}, {0xA0, 0x11}, /* ICW1 */
        {0x21, 0x20}, {0xA1, 0x28}, /* ICW2: taban vektörler */
        {0x21, 0x04}, {0xA1, 0x02}, /* ICW3: zincir */
        {0x21, 0x01}, {0xA1, 0x01}, /* ICW4: 8086 kipi */
    };
    KONTROL(gunluk_esit(beklenen, 8));
}

static void test_eoi(void)
{
    gunluk_n = 0;
    pic_eoi(1);
    const struct yazma ana[] = {{0x20, 0x20}};
    KONTROL(gunluk_esit(ana, 1));
    gunluk_n = 0;
    pic_eoi(12);
    const struct yazma ikisi[] = {{0xA0, 0x20}, {0x20, 0x20}};
    KONTROL(gunluk_esit(ikisi, 2));
}

static void test_pit(void)
{
    KONTROL(pit_bolen(100) == 11931);
    KONTROL(pit_bolen(1) == 0xFFFF);  /* 1 Hz sığmaz: en yavaşa kırpılır */
    KONTROL(pit_bolen(2000000) == 1); /* taban frekansın üstü: en hızlıya kırpılır */
    gunluk_n = 0;
    pit_ayarla(100);
    const struct yazma beklenen[] = {{0x43, 0x36}, {0x40, 0x9B}, {0x40, 0x2E}};
    KONTROL(gunluk_esit(beklenen, 3));
}

static void test_tanimlayicilar(void)
{
    KONTROL(gdt_girdisi_kodla(0, 0xFFFFF, 0x9A, 0xC) == 0x00CF9A000000FFFFull);
    KONTROL(gdt_girdisi_kodla(0, 0xFFFFF, 0x92, 0xC) == 0x00CF92000000FFFFull);
    KONTROL(gdt_girdisi_kodla(0x12345678, 0xABCDE, 0x92, 0xC) == 0x12CA92345678BCDEull);
    KONTROL(idt_kapisi_kodla(0x00101234, SECICI_KOD, KAPI_KESME32) == 0x00108E0000081234ull);
}

int main(void)
{
    test_vga_yazi();
    test_vga_turkce();
    test_vga_gecersiz_utf8();
    test_vga_kaydirma();
    test_vga_sarma_ve_geri_al();
    test_sayilar();
    test_imlec_portlari();
    test_konuma_yaz();
    test_klavye();
    test_halka_tampon();
    test_pic_sirasi();
    test_eoi();
    test_pit();
    test_tanimlayicilar();
    printf("birim testleri: %d kontrol, %d başarısız\n", toplam, basarisiz);
    return basarisiz ? 1 : 0;
}
