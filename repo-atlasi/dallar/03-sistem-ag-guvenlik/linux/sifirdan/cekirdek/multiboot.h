/*
 * multiboot.h — Multiboot 0.6.96 bilgi yapısının kullandığımız kısmı.
 * Önyükleyici bu yapının fiziksel adresini EBX'te verir; hangi alanların
 * geçerli olduğunu "bayraklar" bitleri söyler.
 */
#ifndef MULTIBOOT_H
#define MULTIBOOT_H

#include <stdint.h>

#define MULTIBOOT_ONYUKLEYICI_SIHRI 0x2BADB002u
#define MB_BELLEK (1u << 0) /* mem_lower / mem_upper geçerli */
#define MB_KOMUT_SATIRI (1u << 2) /* cmdline geçerli */
#define MB_ONYUKLEYICI_ADI (1u << 9) /* boot_loader_name geçerli */

struct multiboot_bilgi {
    uint32_t bayraklar;        /* 0 */
    uint32_t bellek_alt_kb;    /* 4: 0-640 KiB arası */
    uint32_t bellek_ust_kb;    /* 8: 1 MiB üstü */
    uint32_t onyukleme_aygiti; /* 12 */
    uint32_t komut_satiri;     /* 16: C dizisinin fiziksel adresi */
    uint32_t modul_sayisi;     /* 20 */
    uint32_t modul_adresi;     /* 24 */
    uint32_t semboller[4];     /* 28 */
    uint32_t mmap_uzunluk;     /* 44 */
    uint32_t mmap_adres;       /* 48 */
    uint32_t suruculer_uzunluk; /* 52 */
    uint32_t suruculer_adres;  /* 56 */
    uint32_t yapilandirma;     /* 60 */
    uint32_t onyukleyici_adi;  /* 64 */
};

#endif
