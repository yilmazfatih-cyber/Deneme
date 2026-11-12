/*
 * klavye.h — PS/2 klavye tarama kodu (set 1) çevirisi ve halka tampon.
 * Linux'taki karşılıkları: drivers/input/serio/i8042.c, drivers/input/keyboard/atkbd.c
 */
#ifndef KLAVYE_H
#define KLAVYE_H

#include <stdint.h>

void klavye_sifirla(void);
/* Bir tarama kodunu işler; basılan tuş yazılabilir bir karakterse onu,
 * değilse (bırakma, Shift, bilinmeyen) 0 döndürür. */
char klavye_cevir(uint8_t tarama_kodu);
/* IRQ1 işleyicisinin çağırdığı üretici ve ana döngünün tüketicisi. */
void klavye_tampona_ekle(char c);
int klavye_oku(void); /* tampon boşsa -1 */

#endif
