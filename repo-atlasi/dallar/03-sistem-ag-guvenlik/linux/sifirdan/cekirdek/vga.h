/*
 * vga.h — VGA metin kipi konsolu (80x25, her hücre 2 bayt: karakter + renk).
 * Linux'taki karşılığı: drivers/video/console/vgacon.c
 */
#ifndef VGA_H
#define VGA_H

#include <stdint.h>

#define VGA_GENISLIK 80
#define VGA_YUKSEKLIK 25
#define VGA_ADRES 0xB8000u

void vga_baslat(volatile uint16_t *tampon);
void vga_temizle(void);
void vga_renk(uint8_t on, uint8_t arka);
void vga_karakter(uint8_t c);
void vga_yaz(const char *utf8);
void vga_onluk(uint32_t sayi);
void vga_onaltilik(uint32_t sayi);
void vga_konuma_yaz(int satir, int sutun, const char *utf8);
uint8_t cp437_donustur(uint32_t kod_noktasi);
int vga_satir(void);
int vga_sutun(void);

#endif
