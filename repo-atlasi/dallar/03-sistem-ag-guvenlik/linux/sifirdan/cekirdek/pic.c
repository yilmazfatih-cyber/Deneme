/*
 * pic.c — PIC'i yeniden eşleme ve PIT'i programlama.
 *
 * Açılışta PIC, IRQ0-7'yi vektör 8-15'e eşler; bu vektörler işlemci
 * istisnalarıyla (ör. 8 = çift hata) çakışır. Bu yüzden IRQ'ları 32-47'ye
 * taşırız. Sıra sabittir: ICW1 (başlat) → ICW2 (taban vektör) → ICW3 (zincir)
 * → ICW4 (8086 kipi). Birim testi bu sırayı sahte outb() ile doğrular.
 */
#include "pic.h"
#include "io.h"

#define PIC1_KOMUT 0x20
#define PIC1_VERI 0x21
#define PIC2_KOMUT 0xA0
#define PIC2_VERI 0xA1
#define ICW1_BASLAT 0x11 /* ICW4 gelecek, zincirli kip */
#define ICW4_8086 0x01
#define PIC_EOI 0x20

void pic_yeniden_esle(uint8_t ana_taban, uint8_t yardimci_taban)
{
    outb(PIC1_KOMUT, ICW1_BASLAT);
    io_bekle();
    outb(PIC2_KOMUT, ICW1_BASLAT);
    io_bekle();
    outb(PIC1_VERI, ana_taban); /* ICW2 */
    io_bekle();
    outb(PIC2_VERI, yardimci_taban);
    io_bekle();
    outb(PIC1_VERI, 0x04); /* ICW3: yardımcı PIC ana PIC'in IRQ2 hattında */
    io_bekle();
    outb(PIC2_VERI, 0x02); /* ICW3: yardımcının zincir kimliği = 2 */
    io_bekle();
    outb(PIC1_VERI, ICW4_8086);
    io_bekle();
    outb(PIC2_VERI, ICW4_8086);
    io_bekle();
}

void pic_maske(uint8_t ana, uint8_t yardimci)
{
    /* Bit 1 = o IRQ kapalı. 0xFC: yalnız IRQ0 (zamanlayıcı) ve IRQ1 (klavye) açık. */
    outb(PIC1_VERI, ana);
    outb(PIC2_VERI, yardimci);
}

void pic_eoi(int irq)
{
    if (irq >= 8)
        outb(PIC2_KOMUT, PIC_EOI); /* yardımcıdan gelen kesme: ikisine de EOI */
    outb(PIC1_KOMUT, PIC_EOI);
}

uint16_t pit_bolen(uint32_t hz)
{
    uint32_t b = PIT_TABAN_HZ / hz;
    if (b > 0xFFFF)
        b = 0xFFFF; /* ~18,2 Hz'den yavaşı sığmaz */
    if (b < 1)
        b = 1;
    return (uint16_t)b;
}

void pit_ayarla(uint32_t hz)
{
    uint16_t b = pit_bolen(hz);
    outb(0x43, 0x36); /* kanal 0, düşük+yüksek bayt, kip 3 (kare dalga) */
    outb(0x40, (uint8_t)(b & 0xFF));
    outb(0x40, (uint8_t)(b >> 8));
}
