# Mini çekirdek: nasm + gcc (-m32, freestanding) + ld (elf_i386).
# Hedefler: make (derle) · make test (yapı + birim testleri) · make qemu-test
# (QEMU'da açılış denetimi; QEMU yoksa atlanır) · make qemu (etkileşimli) · make clean

AS      = nasm
CC      = gcc
LD      = ld
HOSTCC  = gcc
PYTHON  = python3

# -ffreestanding: libc yok, main() yok. -mgeneral-regs-only: derleyici SSE/x87
# yazmaçlarına dokunmasın (FPU'yu biz başlatmadık). -fcf-protection=none:
# .note.gnu.property üretilmesin, dosya düzeni öngörülebilir kalsın.
CFLAGS  = -m32 -std=gnu11 -ffreestanding -fno-pie -fno-pic -fno-stack-protector \
          -fno-builtin -fcf-protection=none -fno-asynchronous-unwind-tables \
          -mgeneral-regs-only -O2 -Wall -Wextra
LDFLAGS = -m elf_i386 -T linker.ld -nostdlib -z noexecstack -z max-page-size=0x1000

C_KAYNAK  = cekirdek.c vga.c tanimlayici.c pic.c klavye.c kesme.c
NESNELER  = boot.o kesme_asm.o $(C_KAYNAK:.c=.o)
TEST_KAYNAK = tests/birim_testleri.c vga.c klavye.c pic.c tanimlayici.c

.PHONY: all test qemu-test qemu clean

all: cekirdek.elf

cekirdek.elf: $(NESNELER) linker.ld
	$(LD) $(LDFLAGS) -o $@ $(NESNELER)

boot.o: boot.asm
	$(AS) -f elf32 $< -o $@

kesme_asm.o: kesme.asm
	$(AS) -f elf32 $< -o $@

%.o: %.c $(wildcard *.h)
	$(CC) $(CFLAGS) -c $< -o $@

# Donanımdan bağımsız parçalar (VGA tamponu, klavye çevirisi, PIC/PIT sırası,
# tanımlayıcı kodlama) normal bir Linux süreci olarak derlenip test edilir.
birim_testleri: $(TEST_KAYNAK) $(wildcard *.h)
	$(HOSTCC) -std=c11 -O1 -Wall -Wextra -DHOST_TEST -I. -o $@ $(TEST_KAYNAK)

test: cekirdek.elf birim_testleri
	$(PYTHON) tests/multiboot_denetle.py cekirdek.elf
	./birim_testleri

# Çekirdeği gerçekten açar: VGA belleğini QMP ile okuyup açılış satırlarını,
# zamanlayıcı sayacını ve klavye yankısını denetler. QEMU kurmak için
# (Debian/Ubuntu): sudo apt install qemu-system-x86
qemu-test: cekirdek.elf
	$(PYTHON) tests/qemu_denetle.py cekirdek.elf

qemu: cekirdek.elf
	qemu-system-i386 -kernel cekirdek.elf -append "selam=dunya"

clean:
	rm -f *.o cekirdek.elf birim_testleri
