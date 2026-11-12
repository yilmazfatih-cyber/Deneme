"""Beceriyi dağıtılabilir bir .skill dosyasına (zip) paketler ve paketi güvenle açar.

Hariç tutma kuralları skill-creator/scripts/package_skill.py ile aynıdır (2c5958e):
__pycache__ ve node_modules klasörleri, *.pyc, .DS_Store ve yalnızca kök düzeyindeki evals/.
Özgün betiğe iki şey ekliyoruz:

- **Belirlenimci paket:** dosyalar sıralı, zaman damgaları sabit; aynı girdi her zaman aynı
  baytları üretir. Böylece paketin özetini (SHA-256) yayımlamak anlamlı olur.
- **Özet dosyası ve güvenli açma:** .skill.sha256 içinde her dosyanın özeti durur; açarken
  zip-slip (../ ile dışarı yazma), sembolik bağlantı ve zip bombası denetlenir.
"""

from __future__ import annotations

import fnmatch
import hashlib
import stat
import zipfile
from pathlib import Path, PurePosixPath

from .dogrulama import dogrula

HARIC_DIZINLER = {'__pycache__', 'node_modules'}
HARIC_DESENLER = {'*.pyc'}
HARIC_DOSYALAR = {'.DS_Store'}
KOK_HARIC_DIZINLER = {'evals'}  # yalnızca beceri kökünde: değerlendirme verisi pakete girmez
SABIT_ZAMAN = (1980, 1, 1, 0, 0, 0)  # zip biçiminin izin verdiği en eski tarih
ACMA_BOYUT_SINIRI = 50 * 1024 * 1024


class PaketHatasi(RuntimeError):
    pass


def haric_mi(goreli: PurePosixPath) -> bool:
    """goreli: beceri klasörüne göre yol (ör. 'evals/x.json' ya da 'scripts/__pycache__/a.pyc')."""
    parcalar = goreli.parts
    if any(p in HARIC_DIZINLER for p in parcalar):
        return True
    if len(parcalar) > 1 and parcalar[0] in KOK_HARIC_DIZINLER:
        return True
    if goreli.name in HARIC_DOSYALAR:
        return True
    return any(fnmatch.fnmatch(goreli.name, d) for d in HARIC_DESENLER)


def dosyalari_topla(beceri_dizini: Path) -> tuple[list[tuple[Path, str]], list[str]]:
    """(dosya, arşivdeki ad) listesi ve atlanan yollar. Arşiv adları 'beceri-adi/...' biçimindedir."""
    alinan: list[tuple[Path, str]] = []
    atlanan: list[str] = []
    for yol in sorted(beceri_dizini.rglob('*')):
        if yol.is_symlink():
            atlanan.append(f'{yol.relative_to(beceri_dizini)} (sembolik bağlantı)')
            continue
        if not yol.is_file():
            continue
        goreli = PurePosixPath(yol.relative_to(beceri_dizini).as_posix())
        if haric_mi(goreli):
            atlanan.append(str(goreli))
            continue
        alinan.append((yol, f'{beceri_dizini.name}/{goreli}'))
    return alinan, atlanan


def ozet(veri: bytes) -> str:
    return hashlib.sha256(veri).hexdigest()


def paketle(beceri_dizini: str | Path, cikti_dizini: str | Path, profil: str = 'spec') -> tuple[Path, Path]:
    """Beceriyi doğrular, <ad>.skill ve <ad>.skill.sha256 dosyalarını üretir."""
    dizin = Path(beceri_dizini)
    rapor = dogrula(dizin, profil)
    if not rapor.gecerli:
        hatalar = '; '.join(str(b) for b in rapor.bulgular if b.duzey == 'hata')
        raise PaketHatasi(f'Doğrulama başarısız, paketlenmedi: {hatalar}')
    cikti = Path(cikti_dizini)
    cikti.mkdir(parents=True, exist_ok=True)
    zip_yolu = cikti / f'{dizin.name}.skill'
    dosyalar, _ = dosyalari_topla(dizin)
    satirlar = []
    with zipfile.ZipFile(zip_yolu, 'w', zipfile.ZIP_DEFLATED) as arsiv:
        for yol, ad in dosyalar:
            veri = yol.read_bytes()
            bilgi = zipfile.ZipInfo(ad, date_time=SABIT_ZAMAN)
            calistirilabilir = yol.stat().st_mode & stat.S_IXUSR
            bilgi.external_attr = ((0o755 if calistirilabilir else 0o644) | stat.S_IFREG) << 16
            bilgi.compress_type = zipfile.ZIP_DEFLATED
            arsiv.writestr(bilgi, veri)
            satirlar.append(f'{ozet(veri)}  {ad}')
    ozet_yolu = cikti / f'{dizin.name}.skill.sha256'
    ozet_yolu.write_text('\n'.join(satirlar) + f'\n# paket {ozet(zip_yolu.read_bytes())}\n', encoding='utf-8')
    return zip_yolu, ozet_yolu


def paketi_dogrula(zip_yolu: str | Path, ozet_yolu: str | Path) -> list[str]:
    """Paketin özet dosyasıyla uyuştuğunu denetler; sorun listesini döndürür (boş = temiz)."""
    beklenen: dict[str, str] = {}
    paket_ozeti = None
    for satir in Path(ozet_yolu).read_text(encoding='utf-8').splitlines():
        if satir.startswith('# paket '):
            paket_ozeti = satir.split()[-1]
        elif satir.strip():
            deger, ad = satir.split('  ', 1)
            beklenen[ad] = deger
    sorunlar = []
    if paket_ozeti and ozet(Path(zip_yolu).read_bytes()) != paket_ozeti:
        sorunlar.append('paketin tamamının özeti değişmiş')
    with zipfile.ZipFile(zip_yolu) as arsiv:
        adlar = set(arsiv.namelist())
        for ad, deger in beklenen.items():
            if ad not in adlar:
                sorunlar.append(f'eksik: {ad}')
            elif ozet(arsiv.read(ad)) != deger:
                sorunlar.append(f'değişmiş: {ad}')
        for ad in sorted(adlar - set(beklenen)):
            sorunlar.append(f'beklenmeyen dosya: {ad}')
    return sorunlar


def guvenli_ac(zip_yolu: str | Path, hedef_dizin: str | Path) -> list[Path]:
    """Paketi açar; tehlikeli bir girdi görürse hiçbir şey yazmadan PaketHatasi fırlatır."""
    hedef = Path(hedef_dizin).resolve()
    with zipfile.ZipFile(zip_yolu) as arsiv:
        bilgiler = arsiv.infolist()
        ust_dizinler = set()
        toplam = 0
        for bilgi in bilgiler:
            ad = PurePosixPath(bilgi.filename)
            if ad.is_absolute() or '..' in ad.parts or '\\' in bilgi.filename or ':' in ad.parts[0]:
                raise PaketHatasi(f'Tehlikeli yol (zip-slip): {bilgi.filename}')
            if stat.S_ISLNK(bilgi.external_attr >> 16):
                raise PaketHatasi(f'Sembolik bağlantı içeren paket reddedildi: {bilgi.filename}')
            ust_dizinler.add(ad.parts[0])
            toplam += bilgi.file_size
        if len(ust_dizinler) != 1:
            raise PaketHatasi(f'Paket tek bir beceri klasörü içermeli, bulunan: {sorted(ust_dizinler)}')
        if toplam > ACMA_BOYUT_SINIRI:
            raise PaketHatasi(f'Açılmış boyut {toplam} bayt; sınır {ACMA_BOYUT_SINIRI} (zip bombası olabilir)')
        yazilan = []
        for bilgi in bilgiler:
            if bilgi.is_dir():
                continue
            yol = (hedef / bilgi.filename).resolve()
            if not yol.is_relative_to(hedef):  # yukarıdaki denetimin ikinci kilidi
                raise PaketHatasi(f'Hedef dışına yazma girişimi: {bilgi.filename}')
            yol.parent.mkdir(parents=True, exist_ok=True)
            yol.write_bytes(arsiv.read(bilgi))
            yazilan.append(yol)
    return yazilan
