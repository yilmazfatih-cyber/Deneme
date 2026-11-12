/*
 * Bağlayıcı betiği: çekirdeği 1 MiB fiziksel adrese yerleştirir.
 * Multiboot başlığı (.multiboot) dosyanın ilk 8 KiB'ı içinde kalsın diye
 * .text bölümünün en başına konur. Linux'taki karşılığı:
 * arch/x86/kernel/vmlinux.lds.S
 */
ENTRY(_start)

SECTIONS
{
    . = 1M;

    .text BLOCK(4K) : ALIGN(4K)
    {
        *(.multiboot)
        *(.text*)
    }

    .rodata BLOCK(4K) : ALIGN(4K)
    {
        *(.rodata*)
    }

    .data BLOCK(4K) : ALIGN(4K)
    {
        *(.data*)
    }

    .bss BLOCK(4K) : ALIGN(4K)
    {
        *(COMMON)
        *(.bss*)
    }

    /* Önyükleyicinin işine yaramayan bölümleri at: dosya düzeni öngörülebilir kalsın. */
    /DISCARD/ :
    {
        *(.comment)
        *(.note*)
        *(.eh_frame*)
    }
}
