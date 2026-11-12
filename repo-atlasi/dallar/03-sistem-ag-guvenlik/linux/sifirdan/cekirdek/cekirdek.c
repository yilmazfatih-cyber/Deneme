/*
 * cekirdek.c — kmain: Linux'ta init/main.c:start_kernel() neyse bu odur.
 *
 * Sıra: ekran → multiboot bilgisi → GDT → IDT → PIC → PIT → IRQ işleyicileri
 * → sti (kesmeleri aç) → yarışsız "cli; denetle; sti; hlt" boşta döngüsü.
 * Linux'un boşta görevi de (kernel/sched/idle.c) iş yokken işlemciyi uyutur.
 */
#include <stdint.h>

#include "kesme.h"
#include "klavye.h"
#include "multiboot.h"
#include "pic.h"
#include "tanimlayici.h"
#include "io.h"
#include "vga.h"

#define ZAMANLAYICI_HZ 100

static volatile uint32_t tik;

static void zamanlayici_irq(struct kayitlar *r)
{
    (void)r;
    tik++;
    if (tik % ZAMANLAYICI_HZ == 0) {
        /* Sağ üst köşede çalışma süresi: imleci bozmadan yazılır. Etiket ve
         * rakamlar ayrı yazılır; çünkü "ç", "ı", "ş" UTF-8'de 2 bayttır ve
         * bayt indeksi ekran sütunuyla aynı değildir. */
        char rakamlar[6] = "00000";
        uint32_t sn = tik / ZAMANLAYICI_HZ;
        for (int i = 4; i >= 0; i--) {
            rakamlar[i] = (char)('0' + sn % 10);
            sn /= 10;
        }
        vga_konuma_yaz(0, VGA_GENISLIK - 19, " çalışma: "); /* 10 sütun */
        vga_konuma_yaz(0, VGA_GENISLIK - 9, rakamlar);      /* 5 sütun */
        vga_konuma_yaz(0, VGA_GENISLIK - 4, " sn ");        /* 4 sütun */
    }
}

static void klavye_irq(struct kayitlar *r)
{
    (void)r;
    char c = klavye_cevir(inb(0x60)); /* 0x60: PS/2 veri portu */
    if (c)
        klavye_tampona_ekle(c);
}

static void multiboot_bilgisi_yaz(uint32_t sihir, uint32_t mbi_adres)
{
    if (sihir != MULTIBOOT_ONYUKLEYICI_SIHRI) {
        vga_yaz("Uyarı: multiboot ile açılmadık, sihirli sayı ");
        vga_onaltilik(sihir);
        vga_karakter('\n');
        return;
    }
    const struct multiboot_bilgi *mbi = (const struct multiboot_bilgi *)(uintptr_t)mbi_adres;
    if (mbi->bayraklar & MB_ONYUKLEYICI_ADI) {
        vga_yaz("Önyükleyici: ");
        vga_yaz((const char *)(uintptr_t)mbi->onyukleyici_adi);
        vga_karakter('\n');
    }
    if (mbi->bayraklar & MB_BELLEK) {
        vga_yaz("Bellek: alt ");
        vga_onluk(mbi->bellek_alt_kb);
        vga_yaz(" KiB, üst ");
        vga_onluk(mbi->bellek_ust_kb);
        vga_yaz(" KiB\n");
    }
    if (mbi->bayraklar & MB_KOMUT_SATIRI) {
        vga_yaz("Komut satırı: ");
        vga_yaz((const char *)(uintptr_t)mbi->komut_satiri);
        vga_karakter('\n');
    }
}

void kmain(uint32_t sihir, uint32_t mbi_adres)
{
    vga_baslat((volatile uint16_t *)(uintptr_t)VGA_ADRES);
    vga_renk(0x0B, 0x00);
    vga_yaz("mini çekirdek — Repo Atlası D03\n");
    vga_renk(0x07, 0x00);
    multiboot_bilgisi_yaz(sihir, mbi_adres);

    gdt_kur();
    vga_yaz("[tamam] GDT: düz bellek modeli\n");
    idt_kur();
    vga_yaz("[tamam] IDT: 32 istisna + 16 IRQ kapısı\n");
    pic_yeniden_esle(0x20, 0x28);
    pic_maske(0xFC, 0xFF);
    vga_yaz("[tamam] PIC: IRQ0-15 → vektör 32-47\n");
    pit_ayarla(ZAMANLAYICI_HZ);
    klavye_sifirla();
    irq_kaydet(0, zamanlayici_irq);
    irq_kaydet(1, klavye_irq);
    vga_yaz("[tamam] PIT: 100 Hz\n");

    __asm__ volatile("sti"); /* bundan sonra kesmeler gelir */
    vga_yaz("Klavyeden yazın (ABD düzeni):\n> ");

    for (;;) {
        /* Yarışsız boşta bekleme. Tampon kesmeler KAPALIYKEN denetlenir; boşsa
         * "sti; hlt" ikilisi çalışır. sti'nin bir komutluk kesme gölgesi
         * yüzünden denetim ile uyku arasına IRQ giremez: bekleyen bir IRQ hlt'yi
         * hemen uyandırır. Önce denetleyip sonra çıplak "hlt" yapsaydık, arada
         * gelen tuş bir sonraki zamanlayıcı tikine kadar (10 ms) beklerdi.
         * Linux'taki karşılığı: arch/x86/include/asm/irqflags.h native_safe_halt(). */
        __asm__ volatile("cli" ::: "memory");
        int c = klavye_oku();
        if (c < 0) {
            __asm__ volatile("sti; hlt" ::: "memory");
            continue;
        }
        __asm__ volatile("sti" ::: "memory");
        vga_karakter((uint8_t)c);
        if (c == '\n')
            vga_yaz("> ");
    }
}
