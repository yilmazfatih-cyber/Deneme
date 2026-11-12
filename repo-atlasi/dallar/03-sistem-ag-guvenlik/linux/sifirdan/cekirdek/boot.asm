; boot.asm — Multiboot (sürüm 1) başlığı ve çekirdeğin giriş noktası.
;
; GRUB veya QEMU (-kernel) bu başlığı dosyanın ilk 8 KiB'ında arar, ELF'i
; belleğe yükler ve _start'a 32 bit korumalı kipte atlar:
;   EAX = 0x2BADB002 (önyükleyicinin sihirli sayısı)
;   EBX = multiboot bilgi yapısının fiziksel adresi
; Sayfalama kapalıdır, kesmeler kapalıdır, yığın (ESP) TANIMSIZDIR.
; Linux bunun yerine kendi önyükleme protokolünü kullanır:
; arch/x86/boot/header.S ("HdrS" imzası) ve Documentation/arch/x86/boot.rst.

MBALIGN  equ 1 << 0              ; modülleri sayfa sınırına hizala
MEMINFO  equ 1 << 1              ; mem_lower/mem_upper alanlarını iste
MBFLAGS  equ MBALIGN | MEMINFO
MAGIC    equ 0x1BADB002          ; başlık sihirli sayısı
CHECKSUM equ -(MAGIC + MBFLAGS)  ; üçünün toplamı 32 bitte 0 olmalı

section .multiboot
align 4
    dd MAGIC
    dd MBFLAGS
    dd CHECKSUM

section .bss
align 16
yigin_alt:
    resb 16384                   ; 16 KiB çekirdek yığını
yigin_ust:

section .text
global _start
extern kmain

_start:
    mov esp, yigin_ust           ; C kodu çağırmadan önce yığın şart
    push ebx                     ; 2. argüman: multiboot bilgi adresi
    push eax                     ; 1. argüman: sihirli sayı
    call kmain                   ; kmain(sihir, mbi_adres) — cdecl
    cli                          ; kmain dönerse: kesmeleri kapat ve dur
.dur:
    hlt
    jmp .dur

section .note.GNU-stack noalloc noexec nowrite progbits
