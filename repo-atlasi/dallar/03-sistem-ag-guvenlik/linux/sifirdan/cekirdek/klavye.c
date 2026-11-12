/*
 * klavye.c — tarama kodu set 1 → ASCII (ABD QWERTY düzeni).
 *
 * Klavye denetleyicisi her tuş basışında ve bırakışında 0x60 portuna bir
 * tarama kodu koyar ve IRQ1'i tetikler. Bırakma kodu = basma kodu | 0x80.
 * Shift durumunu biz tutarız. Türkçe Q düzeni bir alıştırmadır (README).
 */
#include "klavye.h"

#define SOL_SHIFT 0x2A
#define SAG_SHIFT 0x36
#define TAMPON_BOYU 64

static const char normal[0x3A] = {
    0,    27,  '1', '2', '3',  '4', '5', '6', '7', '8', '9', '0', '-', '=', '\b', '\t',
    'q',  'w', 'e', 'r', 't',  'y', 'u', 'i', 'o', 'p', '[', ']', '\n', 0,  'a',  's',
    'd',  'f', 'g', 'h', 'j',  'k', 'l', ';', '\'', '`', 0, '\\', 'z', 'x', 'c',  'v',
    'b',  'n', 'm', ',', '.',  '/', 0,   '*', 0,   ' ',
};

static const char shiftli[0x3A] = {
    0,    27,  '!', '@', '#',  '$', '%', '^', '&', '*', '(', ')', '_', '+', '\b', '\t',
    'Q',  'W', 'E', 'R', 'T',  'Y', 'U', 'I', 'O', 'P', '{', '}', '\n', 0,  'A',  'S',
    'D',  'F', 'G', 'H', 'J',  'K', 'L', ':', '"', '~', 0,   '|', 'Z', 'X', 'C',  'V',
    'B',  'N', 'M', '<', '>',  '?', 0,   '*', 0,   ' ',
};

static int shift_basili;

/* Tek üretici (IRQ1) / tek tüketici (ana döngü) halka tampon. volatile:
 * derleyici, kesmenin değiştirdiği indisleri yazmaçta önbelleklemesin. */
static volatile char tampon[TAMPON_BOYU];
static volatile unsigned bas;
static volatile unsigned son;

void klavye_sifirla(void)
{
    shift_basili = 0;
    bas = son = 0;
}

char klavye_cevir(uint8_t kod)
{
    if (kod == SOL_SHIFT || kod == SAG_SHIFT) {
        shift_basili = 1;
        return 0;
    }
    if (kod == (SOL_SHIFT | 0x80) || kod == (SAG_SHIFT | 0x80)) {
        shift_basili = 0;
        return 0;
    }
    if (kod & 0x80) /* diğer tuşların bırakılması */
        return 0;
    if (kod >= sizeof(normal))
        return 0;
    return shift_basili ? shiftli[kod] : normal[kod];
}

void klavye_tampona_ekle(char c)
{
    unsigned sonraki = (son + 1) % TAMPON_BOYU;
    if (sonraki == bas) /* dolu: en yeni karakteri düşür */
        return;
    tampon[son] = c;
    son = sonraki;
}

int klavye_oku(void)
{
    if (bas == son)
        return -1;
    char c = tampon[bas];
    bas = (bas + 1) % TAMPON_BOYU;
    return (unsigned char)c;
}
