# Linux için sıfırdan: mini kabuk + önyüklenebilir mini çekirdek

İki küçük program, sistem çağrısı sınırının iki yakasını gösterir:

- **`kabuk/`** — kullanıcı alanı. `fork`, `execve`, `pipe2`, `dup2`, `wait4`, `chdir` çağrılarını doğrudan kullanan
  bir Unix kabuğu (~430 satır C). Linux'un `kernel/fork.c`, `fs/exec.c`, `fs/pipe.c` dosyalarına "dışarıdan" bakar.
- **`cekirdek/`** — çekirdek alanı. Multiboot ile açılan, kendi GDT/IDT'sini kuran, PIC/PIT'i programlayan, zamanlayıcı
  ve klavye kesmelerini işleyen 32 bit x86 çekirdeği (~950 satır: C, başlıklar, NASM, bağlayıcı betiği). Linux'un `arch/x86/boot`, `init/main.c`,
  `arch/x86/kernel/idt.c` dosyalarının oyuncak kardeşi.

## Gereksinimler

- `gcc` (32 bit hedef için `-m32` desteği: yalnız derleme, 32 bit libc **gerekmez**), `nasm`, GNU `ld` (`elf_i386`),
  `make`, `python3` (testler için).
- İsteğe bağlı: `strace` (kabuk testlerinden biri sistem çağrılarını izler), `qemu-system-i386` (çekirdeği çalıştırmak
  ve `make qemu-test`).

`make test` çekirdeği **çalıştırmaz**: derlemeyi, Multiboot başlığını, ELF düzenini ve donanımdan bağımsız parçaları
(birim testleri) doğrular. QEMU kuruluysa `make qemu-test` çekirdeği ekransız açar, VGA belleğini QEMU'nun denetim
protokolüyle (QMP) okur ve açılış satırlarını, zamanlayıcı sayacının ilerlemesini ve klavye yankısını denetler; QEMU
yoksa açık bir mesajla atlanır.

## Çalıştırma ve test

```bash
make test            # ikisini birden: 21 kabuk senaryosu + 74 çekirdek birim kontrolü + multiboot denetimi
make qemu-test       # isteğe bağlı: çekirdeği QEMU'da açıp ekranı ve kesmeleri denetler (QEMU yoksa atlanır)
make -C kabuk        # yalnız kabuğu derle
./kabuk/kabuk        # etkileşimli kabuk; çıkmak için Ctrl-D ya da exit
./kabuk/kabuk -c 'seq 1 100 | grep 7 | wc -l'
make clean
```

Çekirdeği kendi makinende QEMU ile açmak için:

```bash
sudo apt install qemu-system-x86          # Debian/Ubuntu
make -C cekirdek qemu                     # = qemu-system-i386 -kernel cekirdek.elf -append "selam=dunya"
```

Ekranda önyükleyici adı (`qemu`), bellek miktarı, komut satırı, `[tamam]` satırları ve sağ üstte saniye sayacı
görünür; klavyeden yazdıkların ekrana düşer. GRUB ile açmak istersen `menuentry` içinde `multiboot /cekirdek.elf`
kullanılır (Linux için ise `linux /vmlinuz` — farklı protokol).

## Aşamalar

| Aşama | Dosya(lar)                       | Ne öğrenirsin                                                                                                 |
| ----- | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| K1    | `kabuk/kabuk.c` → `jetonla`      | Tırnaklar, kaçışlar, `$?`/`$AD` genişletmesi: kabuk dili çekirdekte değil                                     |
| K2    | `kabuk/kabuk.c` → `ayristir`     | Boru hattı ve yönlendirmenin veri yapısı                                                                      |
| K3    | `kabuk/kabuk.c` → `calistir`     | `pipe2` + `fork` + `dup2` + `execvp` + `waitpid`; tanıtıcı kapatma disiplini                                  |
| K4    | `cd`/`exit` yerleşikleri         | Neden bazı komutlar kabuğun kendi sürecinde çalışmak zorunda                                                  |
| Ç1    | `cekirdek/boot.asm`, `linker.ld` | Multiboot başlığı, yığın kurma, 1 MiB'a yükleme                                                               |
| Ç2    | `vga.c`                          | Bellek eşlemeli G/Ç (0xB8000), UTF-8 → CP437, imleç portları                                                  |
| Ç3    | `tanimlayici.c`, `kesme.asm`     | GDT (düz model), IDT kapıları, ortak kesme saplaması, `iret`                                                  |
| Ç4    | `pic.c`, `kesme.c`               | PIC yeniden eşleme (ICW1-4), EOI, PIT böleni, istisna/IRQ ayrımı                                              |
| Ç5    | `klavye.c`, `cekirdek.c`         | Tarama kodu set 1, tek üretici/tek tüketici halka tampon, yarışsız `cli` + denetim + `sti; hlt` boşta döngüsü |
| T     | `cekirdek/tests/*`               | Donanım olmadan test: sahte `outb()` günlüğü, ELF/Multiboot statik doğrulaması; QEMU ile açılış denetimi      |

## Testler neyi kanıtlıyor?

- `kabuk/tests/test_kabuk.py`: boru hatları, yönlendirme, tırnaklar, çıkış kodları (`127` bulunamadı, `128+sinyal`),
  sözdizimi hataları. `test_tanitici_sizintisi_yok` çocuk süreçlere fazladan boru ucu sızmadığını
  `/proc/self/fd` ile denetler (bilerek bozulmuş bir kabukla denendi: test düşüyor).
  `test_pipe2_hatasi_yarida_temizler` tanıtıcı sınırını 5'e indirip boru hattının ortasında `pipe2`'yi düşürür:
  kabuk açık kalan okuma ucunu kapatmalı, çatallanan çocuğu beklemeli ve kendi tablosunda yalnız 0, 1, 2 kalmalı.
  `strace` varsa `pipe2`/`clone`/`dup2`/`execve`/`wait4` çağrılarının gerçekten yapıldığı izlenir.
- `cekirdek/tests/multiboot_denetle.py`: ELF32 + EM_386 + ET_EXEC, başlık ilk 8 KiB içinde ve sağlaması doğru,
  bütün `PT_LOAD` bölütleri ≥ 1 MiB, giriş noktası çalıştırılabilir bölütte, `kmain` sembolü var.
- `cekirdek/tests/birim_testleri.c`: VGA tamponu (kaydırma, sarma, Türkçe karakter ve `→` eşlemesi), klavye
  çevirisi, halka tampon, PIC/PIT/EOI port yazma **sırası**, GDT/IDT girdilerinin bit düzeyinde kodlaması.
- `cekirdek/tests/qemu_denetle.py` (`make qemu-test`): QEMU'da gerçek açılış; dört `[tamam]` satırı, önyükleyici adı,
  komut satırı, sayacın ilerlemesi (IRQ0) ve `h`, `i`, Shift+`a`, Enter tuşlarının yankısı (IRQ1).

## Mini ile gerçek depo eşlemesi

| Mini'deki parça                           | Gerçek depodaki karşılığı (dosya yolu)                                                                                                                      | Fark                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cekirdek/boot.asm` (Multiboot, `_start`) | `arch/x86/boot/header.S`, `arch/x86/boot/main.c`, `arch/x86/boot/compressed/misc.c`, `drivers/firmware/efi/libstub/x86-stub.c`, `arch/x86/kernel/head_64.S` | Linux kendi "HdrS" önyükleme protokolünü kullanır. Eski BIOS'ta, 16 bit protokolde gerçek kipten başlar (`header.S` → `main.c`); UEFI ve kexec 32/64 bit girişleri ya da EFI stub'ı kullanır ve gerçek kipi atlar. Sıkıştırılmış çekirdeği `compressed/misc.c` açar (`extract_kernel`, EFI'de `efi_decompress_kernel`)                                                      |
| `cekirdek.c: kmain()`                     | `init/main.c: start_kernel()`, `rest_init()`, `kernel_init()`                                                                                               | Linux düzinelerce alt sistemi başlatır ve sonunda PID 1'i (`/sbin/init`) çalıştırır                                                                                                                                                                                                                                                                                         |
| `tanimlayici.c` (GDT/IDT)                 | `arch/x86/kernel/cpu/common.c`, `arch/x86/kernel/idt.c`, `arch/x86/include/asm/desc.h`                                                                      | 64 bit kapılar, IST yığınları, yeni işlemcilerde FRED (`arch/x86/entry/entry_fred.c`)                                                                                                                                                                                                                                                                                       |
| `kesme.asm: ortak_saplama`                | `arch/x86/entry/entry_64.S` (mini 32 bit: doğrudan karşılığı `arch/x86/entry/entry_32.S`)                                                                   | `struct pt_regs`, kullanıcı/çekirdek geçişi, Spectre azaltımları                                                                                                                                                                                                                                                                                                            |
| `kesme.c` (istisna mesajı ve durma)       | `arch/x86/kernel/traps.c`                                                                                                                                   | Linux süreci sinyalle (SIGSEGV...) durdurur; çekirdek hatasında "oops"/panik                                                                                                                                                                                                                                                                                                |
| `pic.c` (8259 + 8253)                     | `arch/x86/kernel/i8259.c`, `drivers/clocksource/i8253.c`                                                                                                    | Modern donanımda APIC/IOAPIC (`arch/x86/kernel/apic/`) ve TSC/HPET                                                                                                                                                                                                                                                                                                          |
| `klavye.c`                                | `drivers/input/serio/i8042.c`, `drivers/input/keyboard/atkbd.c`, `drivers/tty/vt/keyboard.c`                                                                | atkbd tarama kodunu çekirdekte keycode'a çevirir (`atkbd_set2_keycode`) ve olayı input alt sistemiyle `/dev/input/event*`'e taşır; karaktere çeviri metin konsolunda çekirdekteki tuş haritasıyla yapılır (`drivers/tty/vt/keyboard.c`: `kbd_keycode`, `key_maps`; varsayılan harita `defkeymap.map`, `loadkeys` ile değişir), grafik oturumda ise kullanıcı alanında (xkb) |
| `vga.c`                                   | `drivers/video/console/vgacon.c`, `drivers/video/fbdev/core/fbcon.c`                                                                                        | Unicode konsol, yazı tipi yükleme, çerçeve tamponu                                                                                                                                                                                                                                                                                                                          |
| `kabuk.c` → `pipe2` / `fork` / `execvp`   | `fs/pipe.c`, `kernel/fork.c` (`kernel_clone`), `fs/exec.c` (`do_execveat_common`)                                                                           | Kabuk bu çağrıları kullanır; gerçek depo onları **uygular**                                                                                                                                                                                                                                                                                                                 |
| `kabuk.c` → `dup2`, `waitpid`, `chdir`    | `fs/file.c`, `kernel/exit.c` (`wait4`), `fs/open.c` (`chdir`)                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                           |

## Bilinçli eksikler (alıştırma adayları)

Sayfalama, kullanıcı kipi (halka 3), sistem çağrısı (`int 0x80`), görev değiştirme, bellek ayırıcı, dosya sistemi,
APIC, SMP, sahte IRQ7 (spurious) ayıklama; kabukta iş denetimi (`&`, `fg`, süreç grupları), `&&`/`||`/`;`,
joker genişletme (`*.c`), yerleşiklere yönlendirme ve alan bölme (word splitting): tırnaksız `$AD` tek argüman kalır,
boşsa boş argüman olur (bash'teki `"$AD"` gibi davranır; `printf '[%s]' a $YOK b` bash'te `[a][b]`, burada
`[a][][b]` basar). Dosya ayrıntıları için dosyaların başındaki açıklamalara bak;
yol haritası [dosyanın](../README.md#4-sıfırdan-yol-dallanma) 4. bölümündedir.
