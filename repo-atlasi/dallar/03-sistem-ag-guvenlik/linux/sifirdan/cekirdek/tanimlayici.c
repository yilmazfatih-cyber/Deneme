/*
 * tanimlayici.c — "düz" (flat) bellek modeli için GDT ve 48 girdilik IDT.
 *
 * Multiboot, GDTR'nin geçerli olduğunu garanti etmez; bu yüzden ilk iş kendi
 * GDT'mizi kurarız: 0 = boş, 1 = çekirdek kodu, 2 = çekirdek verisi. Hepsi
 * taban 0, limit 4 GiB; yani adres çevirisini kesimler değil (ileride) sayfalama
 * yapar. Linux da x86-64'te kesimleri büyük ölçüde etkisizleştirir.
 */
#include "tanimlayici.h"

uint64_t gdt_girdisi_kodla(uint32_t taban, uint32_t limit, uint8_t erisim, uint8_t bayraklar)
{
    uint64_t g = 0;
    g |= (uint64_t)(limit & 0xFFFFu);              /* limit 0-15 */
    g |= (uint64_t)(taban & 0xFFFFFFu) << 16;      /* taban 0-23 */
    g |= (uint64_t)erisim << 40;                   /* erişim baytı */
    g |= (uint64_t)((limit >> 16) & 0x0Fu) << 48;  /* limit 16-19 */
    g |= (uint64_t)(bayraklar & 0x0Fu) << 52;      /* G, D/B, L, AVL */
    g |= (uint64_t)((taban >> 24) & 0xFFu) << 56;  /* taban 24-31 */
    return g;
}

uint64_t idt_kapisi_kodla(uint32_t adres, uint16_t secici, uint8_t tur)
{
    uint64_t k = 0;
    k |= (uint64_t)(adres & 0xFFFFu);              /* hedef ofset 0-15 */
    k |= (uint64_t)secici << 16;                   /* kod kesimi seçicisi */
    k |= (uint64_t)tur << 40;                      /* P | DPL | tür */
    k |= (uint64_t)((adres >> 16) & 0xFFFFu) << 48; /* hedef ofset 16-31 */
    return k;
}

#ifndef HOST_TEST

struct tablo_isaretci {
    uint16_t limit;
    uint32_t taban;
} __attribute__((packed));

extern void gdt_yukle(const struct tablo_isaretci *p); /* kesme.asm */
extern void idt_yukle(const struct tablo_isaretci *p); /* kesme.asm */
extern const uint32_t isr_tablosu[48];                 /* kesme.asm */

static uint64_t gdt[3] __attribute__((aligned(8)));
static uint64_t idt[256] __attribute__((aligned(8)));

void gdt_kur(void)
{
    static struct tablo_isaretci p;
    gdt[0] = 0;
    gdt[1] = gdt_girdisi_kodla(0, 0xFFFFF, 0x9A, 0xC); /* kod: var, halka 0, oku/çalıştır */
    gdt[2] = gdt_girdisi_kodla(0, 0xFFFFF, 0x92, 0xC); /* veri: var, halka 0, oku/yaz */
    p.limit = sizeof(gdt) - 1;
    p.taban = (uint32_t)(uintptr_t)gdt;
    gdt_yukle(&p);
}

void idt_kur(void)
{
    static struct tablo_isaretci p;
    for (int i = 0; i < 48; i++)
        idt[i] = idt_kapisi_kodla(isr_tablosu[i], SECICI_KOD, KAPI_KESME32);
    /* 48-255 boş kalır: "var" biti 0 olan kapı #NP/#GP istisnası doğurur. */
    p.limit = sizeof(idt) - 1;
    p.taban = (uint32_t)(uintptr_t)idt;
    idt_yukle(&p);
}

#endif
