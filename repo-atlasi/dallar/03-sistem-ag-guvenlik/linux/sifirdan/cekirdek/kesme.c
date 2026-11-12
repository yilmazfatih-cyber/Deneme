/*
 * kesme.c — tüm vektörlerin geldiği tek C giriş noktası.
 *
 * 0-31: işlemci istisnaları → mesaj yaz ve dur (gerçek çekirdek burada
 *       sinyal gönderir ya da "oops" basar: arch/x86/kernel/traps.c).
 * 32-47: donanım IRQ'ları → kayıtlı işleyiciyi çağır, sonra PIC'e EOI gönder.
 */
#include "kesme.h"
#include "pic.h"
#include "vga.h"

static irq_isleyici_t isleyiciler[16];

static const char *const istisna_adlari[32] = {
    "Sıfıra bölme", "Hata ayıklama", "NMI", "Kesme noktası",
    "Taşma", "Sınır aşımı", "Geçersiz komut", "Aygıt yok",
    "Çift hata", "Yardımcı işlemci kesimi", "Geçersiz TSS", "Kesim yok",
    "Yığın kesimi hatası", "Genel koruma hatası", "Sayfa hatası", "Ayrılmış",
    "x87 kayan nokta", "Hizalama denetimi", "Makine denetimi", "SIMD kayan nokta",
    "Sanallaştırma", "Denetim koruması", "Ayrılmış", "Ayrılmış",
    "Ayrılmış", "Ayrılmış", "Ayrılmış", "Ayrılmış",
    "Hipervizör enjeksiyonu", "VMM iletişimi", "Güvenlik", "Ayrılmış",
};

void irq_kaydet(int irq, irq_isleyici_t isleyici)
{
    if (irq >= 0 && irq < 16)
        isleyiciler[irq] = isleyici;
}

void kesme_isleyici(struct kayitlar *r)
{
    if (r->kesme_no < 32) {
        vga_renk(0x0F, 0x04);
        vga_yaz("\nİSTİSNA: ");
        vga_yaz(istisna_adlari[r->kesme_no]);
        vga_yaz(" vektör=");
        vga_onluk(r->kesme_no);
        vga_yaz(" hata kodu=");
        vga_onaltilik(r->hata_kodu);
        vga_yaz(" EIP=");
        vga_onaltilik(r->eip);
        vga_yaz("\nSistem durduruldu.");
        for (;;)
            __asm__ volatile("cli; hlt");
    }
    if (r->kesme_no < 48) {
        int irq = (int)r->kesme_no - 32;
        if (isleyiciler[irq])
            isleyiciler[irq](r);
        pic_eoi(irq); /* EOI gelmezse PIC aynı ya da düşük öncelikli IRQ'yu bir daha vermez */
    }
}
