/*
 * io.h — x86 G/Ç portlarına erişim (in/out komutları).
 *
 * HOST_TEST tanımlıyken (birim testleri, normal Linux süreci) gerçek port
 * erişimi yerine testin sağladığı kayıt tutan sahte fonksiyonlar kullanılır.
 * Böylece PIC/PIT programlama sırası QEMU olmadan doğrulanabilir.
 * Linux'taki karşılığı: arch/x86/include/asm/io.h
 */
#ifndef IO_H
#define IO_H

#include <stdint.h>

#ifdef HOST_TEST
void outb(uint16_t port, uint8_t deger);
uint8_t inb(uint16_t port);
#else
static inline void outb(uint16_t port, uint8_t deger)
{
    __asm__ volatile("outb %0, %1" : : "a"(deger), "Nd"(port));
}

static inline uint8_t inb(uint16_t port)
{
    uint8_t deger;
    __asm__ volatile("inb %1, %0" : "=a"(deger) : "Nd"(port));
    return deger;
}
#endif

/* Eski aygıtlar ardışık komutlar arasında kısa bir bekleme ister;
 * kullanılmayan 0x80 portuna yazmak ~1 mikrosaniye oyalar. */
static inline void io_bekle(void)
{
    outb(0x80, 0);
}

#endif
