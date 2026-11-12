# İki mini uygulamayı birlikte derler/test eder.
#   kabuk/    : kullanıcı alanı — fork/exec/wait, boru, yönlendirme
#   cekirdek/ : çekirdek alanı — multiboot, GDT/IDT, PIC/PIT, klavye IRQ'su

.PHONY: all test qemu-test clean

all:
	$(MAKE) -C kabuk
	$(MAKE) -C cekirdek

test:
	$(MAKE) -C kabuk test
	$(MAKE) -C cekirdek test

# İsteğe bağlı: çekirdeği QEMU'da açıp ekranı denetler (QEMU yoksa atlanır)
qemu-test:
	$(MAKE) -C cekirdek qemu-test

clean:
	$(MAKE) -C kabuk clean
	$(MAKE) -C cekirdek clean
