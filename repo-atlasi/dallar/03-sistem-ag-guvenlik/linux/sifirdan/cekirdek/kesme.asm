; kesme.asm — GDT/IDT yükleme yardımcıları ve kesme giriş saplamaları (stub).
;
; İşlemci bir kesmede yalnızca EFLAGS, CS, EIP (bazı istisnalarda hata kodu)
; iter. Ortak saplama geri kalan yazmaçları saklar, C işleyicisini çağırır ve
; IRET ile kesilen koda döner. Linux'taki karşılıkları:
; arch/x86/entry/entry_64.S, arch/x86/kernel/idt.c

section .text

; void gdt_yukle(const struct gdt_isaretci *p)
global gdt_yukle
gdt_yukle:
    mov eax, [esp + 4]
    lgdt [eax]
    mov ax, 0x10                 ; çekirdek veri seçicisi = GDT[2]
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax
    mov ss, ax
    jmp 0x08:.cs_yenile          ; uzak atlama CS'yi GDT[1] ile yeniden yükler
.cs_yenile:
    ret

; void idt_yukle(const struct idt_isaretci *p)
global idt_yukle
idt_yukle:
    mov eax, [esp + 4]
    lidt [eax]
    ret

extern kesme_isleyici

%macro HATASIZ 1                 ; işlemcinin hata kodu itmediği vektörler
isr%1:
    push dword 0                 ; yığın düzeni her vektörde aynı olsun
    push dword %1
    jmp ortak_saplama
%endmacro

%macro HATALI 1                  ; işlemcinin hata kodu ittiği istisnalar
isr%1:
    push dword %1
    jmp ortak_saplama
%endmacro

HATASIZ 0
HATASIZ 1
HATASIZ 2
HATASIZ 3
HATASIZ 4
HATASIZ 5
HATASIZ 6
HATASIZ 7
HATALI  8
HATASIZ 9
HATALI  10
HATALI  11
HATALI  12
HATALI  13
HATALI  14
HATASIZ 15
HATASIZ 16
HATALI  17
HATASIZ 18
HATASIZ 19
HATASIZ 20
HATALI  21
HATASIZ 22
HATASIZ 23
HATASIZ 24
HATASIZ 25
HATASIZ 26
HATASIZ 27
HATASIZ 28
HATALI  29
HATALI  30
HATASIZ 31
; Donanım kesmeleri: PIC yeniden eşlendikten sonra IRQ0-15 → vektör 32-47
%assign v 32
%rep 16
HATASIZ v
%assign v v + 1
%endrep

ortak_saplama:
    pusha                        ; EAX, ECX, EDX, EBX, ESP, EBP, ESI, EDI
    push ds
    push es
    push fs
    push gs
    mov ax, 0x10                 ; C kodu çekirdek veri kesimleriyle çalışsın
    mov ds, ax
    mov es, ax
    mov fs, ax
    mov gs, ax
    cld                          ; C ABI'si yön bayrağının temiz olmasını bekler
    push esp                     ; argüman: struct kayitlar *
    call kesme_isleyici
    add esp, 4
    pop gs
    pop fs
    pop es
    pop ds
    popa
    add esp, 8                   ; kesme numarası + hata kodu
    iret

section .rodata
; C tarafının IDT'yi doldurması için 48 saplamanın adres tablosu
global isr_tablosu
isr_tablosu:
%assign v 0
%rep 48
    dd isr %+ v
%assign v v + 1
%endrep

section .note.GNU-stack noalloc noexec nowrite progbits
