/*
 * kesme.h — kesme anında yığına kaydedilen yazmaçlar ve IRQ kayıt arayüzü.
 * Linux'taki karşılıkları: struct pt_regs (arch/x86/include/asm/ptrace.h),
 * request_irq() (kernel/irq/manage.c)
 */
#ifndef KESME_H
#define KESME_H

#include <stdint.h>

/* Düzen kesme.asm'deki itme sırasının TERSİDİR (yığın aşağı büyür). */
struct kayitlar {
    uint32_t gs, fs, es, ds;                              /* ortak saplama */
    uint32_t edi, esi, ebp, esp_kopya, ebx, edx, ecx, eax; /* pusha */
    uint32_t kesme_no, hata_kodu;                          /* saplama */
    uint32_t eip, cs, eflags;                              /* işlemci */
};

typedef void (*irq_isleyici_t)(struct kayitlar *r);

void irq_kaydet(int irq, irq_isleyici_t isleyici);
void kesme_isleyici(struct kayitlar *r);

#endif
