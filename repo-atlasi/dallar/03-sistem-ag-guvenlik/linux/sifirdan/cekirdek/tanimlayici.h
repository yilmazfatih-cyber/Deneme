/*
 * tanimlayici.h — GDT (kesim tanımlayıcıları) ve IDT (kesme kapıları).
 * Linux'taki karşılıkları: arch/x86/include/asm/desc.h, arch/x86/kernel/idt.c,
 * arch/x86/kernel/cpu/common.c (GDT sayfası)
 */
#ifndef TANIMLAYICI_H
#define TANIMLAYICI_H

#include <stdint.h>

#define SECICI_KOD 0x08 /* GDT[1] */
#define SECICI_VERI 0x10 /* GDT[2] */
#define KAPI_KESME32 0x8E /* var, halka 0, 32 bit kesme kapısı */

/* Saf kodlayıcılar: donanıma dokunmaz, ana makinede test edilir. */
uint64_t gdt_girdisi_kodla(uint32_t taban, uint32_t limit, uint8_t erisim, uint8_t bayraklar);
uint64_t idt_kapisi_kodla(uint32_t adres, uint16_t secici, uint8_t tur);

/* Tabloları doldurur ve lgdt/lidt ile yükler (yalnız çekirdekte). */
void gdt_kur(void);
void idt_kur(void);

#endif
