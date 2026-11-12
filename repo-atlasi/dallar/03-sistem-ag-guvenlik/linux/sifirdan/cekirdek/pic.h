/*
 * pic.h — 8259A kesme denetleyicisi (PIC) ve 8253/8254 zamanlayıcısı (PIT).
 * Linux'taki karşılıkları: arch/x86/kernel/i8259.c, drivers/clocksource/i8253.c
 */
#ifndef PIC_H
#define PIC_H

#include <stdint.h>

#define PIT_TABAN_HZ 1193182u

void pic_yeniden_esle(uint8_t ana_taban, uint8_t yardimci_taban);
void pic_maske(uint8_t ana, uint8_t yardimci);
void pic_eoi(int irq);
uint16_t pit_bolen(uint32_t hz);
void pit_ayarla(uint32_t hz);

#endif
