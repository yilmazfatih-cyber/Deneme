"""Üçüncü taraf beceri tarayıcısı: kurmadan önce bir beceri klasörünü okuyarak denetler.

Bir beceri yalnızca metin değildir: içindeki her şey modelin bağlamına girebilir ve
betikleri/kancaları senin yetkilerinle çalışabilir. Bu tarayıcı ECC'nin
the-security-guide.md belgesindeki "ucuz ilk geçiş" fikrini (gizli Unicode, HTML yorumu,
ağ komutları, tehlikeli ayarlar) ve superpowers'ın "geliştirme dosyası kurulumla gitmesin"
dersini birleştirir.

Önemli: bu bir sezgisel (heuristic) tarayıcıdır. Temiz sonuç "güvenli" demek değildir;
yalnızca bilinen kalıpların bulunmadığını söyler. Asıl savunma, kurmadan önce okumak,
sürümü sabitlemek ve ajana gereğinden fazla yetki vermemektir.
"""

from __future__ import annotations

import re
import stat
from dataclasses import dataclass
from pathlib import Path

SIDDET_SIRASI = {'yüksek': 0, 'orta': 1, 'düşük': 2}

# Sıfır genişlikli ve yön denetimi karakterleri: insan görmez, model görür.
GIZLI_KARAKTERLER = {
    '\u200b': 'SIFIR GENİŞLİKLİ BOŞLUK',
    '\u200c': 'SIFIR GENİŞLİKLİ BİRLEŞTİRMEYEN',
    '\u200d': 'SIFIR GENİŞLİKLİ BİRLEŞTİREN',
    '\u200e': 'SOLDAN SAĞA İŞARETİ',
    '\u200f': 'SAĞDAN SOLA İŞARETİ',
    '\u2060': 'SÖZCÜK BİRLEŞTİRİCİ',
    '\ufeff': 'BOM / SIFIR GENİŞLİKLİ BÖLÜNMEZ BOŞLUK',
    **{chr(c): f'YÖN DENETİMİ U+{c:04X}' for c in range(0x202A, 0x202F)},
    **{chr(c): f'YÖN YALITIMI U+{c:04X}' for c in range(0x2066, 0x206A)},
}

ENJEKSIYON_KALIPLARI = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r'ignore (all |any )?(previous|prior|above) (instructions|rules)',
        r'disregard (the |all )?(system|previous) (prompt|instructions)',
        r'do not (tell|inform|mention (this )?to) the user',
        r"(don't|do not) (ask|wait) for (permission|approval|confirmation)",
        r'önceki (tüm )?talimatları (yok say|unut|görmezden gel)',
        r'kullanıcıya (bunu )?(söyleme|bildirme|gösterme)',
        r'onay (isteme|beklemeden)',
    )
]
AG_KOMUTU = re.compile(r'\b(curl|wget|nc|ncat|netcat|scp|sftp|ssh|telnet|ftp)\b|Invoke-WebRequest|\biwr\s')
SIZINTI_KALIBI = re.compile(
    r'(~/\.ssh|id_rsa|\.aws/credentials|\.netrc|ANTHROPIC_API_KEY|OPENAI_API_KEY|GITHUB_TOKEN|\benv\s*\|'
    r'|printenv\s*\||/etc/passwd)'
)
TEHLIKELI_AYAR = re.compile(
    r'enableAllProjectMcpServers|ANTHROPIC_BASE_URL|dangerously-skip-permissions|bypassPermissions'
    r'|"defaultMode"\s*:\s*"bypass'
)
BASE64_BLOK = re.compile(r'[A-Za-z0-9+/]{200,}={0,2}')
GELISTIRME_DOSYASI = re.compile(r'^(CREATION-LOG\.md|test-.*\.md)$')
BETIK_UZANTILARI = {'.sh', '.bash', '.zsh', '.py', '.js', '.mjs', '.cjs', '.ts', '.ps1', '.cmd', '.bat', '.rb', '.pl'}
_KOD_CITI = re.compile(r'^\s*(```|~~~)')


@dataclass
class Bulgu:
    siddet: str  # 'yüksek' | 'orta' | 'düşük'
    kural: str
    yol: str
    satir: int
    mesaj: str

    def __str__(self) -> str:
        return f'[{self.siddet}] {self.kural} {self.yol}:{self.satir} — {self.mesaj}'


def _metin_mi(veri: bytes) -> bool:
    return b'\0' not in veri[:8192]


def _kod_satirlari(metin: str) -> set[int]:
    """Markdown içindeki kod bloğu satırlarının numaraları (1 tabanlı)."""
    icerde = False
    satirlar = set()
    for no, satir in enumerate(metin.split('\n'), start=1):
        if _KOD_CITI.match(satir):
            icerde = not icerde
            continue
        if icerde:
            satirlar.add(no)
    return satirlar


def dosya_tara(yol: Path, goreli: str) -> list[Bulgu]:
    bulgular: list[Bulgu] = []
    veri = yol.read_bytes()
    if not _metin_mi(veri):
        return [Bulgu('düşük', 'ikili-dosya', goreli, 0, 'İkili dosya: içeriği gözle denetlenemez')]
    metin = veri.decode('utf-8', errors='replace')
    markdown = yol.suffix.lower() in {'.md', '.mdc', '.txt'}
    betik = yol.suffix.lower() in BETIK_UZANTILARI or metin.startswith('#!')
    kod_satirlari = _kod_satirlari(metin) if markdown else set()

    if GELISTIRME_DOSYASI.match(yol.name):
        bulgular.append(
            Bulgu('orta', 'gelistirme-dosyasi', goreli, 0, 'Baskı senaryosu/geliştirme notu kurulumla gidiyor')
        )
    if betik:
        izin = yol.stat().st_mode
        not_ = 'çalıştırılabilir' if izin & stat.S_IXUSR else 'betik'
        bulgular.append(Bulgu('düşük', 'betik', goreli, 0, f'{not_}: kurmadan önce baştan sona oku'))

    for no, satir in enumerate(metin.split('\n'), start=1):
        for karakter, ad in GIZLI_KARAKTERLER.items():
            if karakter in satir and not (no == 1 and satir.startswith('\ufeff') and satir.count(karakter) == 1):
                bulgular.append(Bulgu('yüksek', 'gizli-unicode', goreli, no, f'{ad} karakteri'))
        if markdown and '<!--' in satir:
            bulgular.append(Bulgu('orta', 'html-yorumu', goreli, no, 'HTML yorumu: önizlemede görünmez, model görür'))
        for kalip in ENJEKSIYON_KALIPLARI:
            if kalip.search(satir):
                bulgular.append(Bulgu('yüksek', 'enjeksiyon-kalibi', goreli, no, f'şüpheli ifade: "{kalip.pattern}"'))
        komut_baglami = betik or no in kod_satirlari
        if komut_baglami and AG_KOMUTU.search(satir):
            bulgular.append(Bulgu('orta', 'ag-komutu', goreli, no, 'dışarıya bağlantı kuran komut'))
        if SIZINTI_KALIBI.search(satir):
            siddet = 'yüksek' if AG_KOMUTU.search(satir) else 'orta'
            bulgular.append(Bulgu(siddet, 'gizli-veri', goreli, no, 'gizli dosya/anahtar/ortam değişkeni erişimi'))
        if TEHLIKELI_AYAR.search(satir):
            bulgular.append(Bulgu('yüksek', 'tehlikeli-ayar', goreli, no, 'izinleri gevşeten ya da API trafiğini yönlendiren ayar'))
        if BASE64_BLOK.search(satir):
            bulgular.append(Bulgu('orta', 'base64-blok', goreli, no, 'uzun base64 bloğu: gizlenmiş içerik olabilir'))
    if yol.name in {'hooks.json', 'settings.json', 'settings.local.json'} and '"hooks"' in metin:
        bulgular.append(
            Bulgu('orta', 'kanca', goreli, 0, 'kanca tanımı: olaylarda senin yetkinle komut çalıştırır; her komutu oku')
        )
    return bulgular


def tara(dizin: str | Path) -> list[Bulgu]:
    """Klasördeki tüm dosyaları tarar; bulguları önce şiddete, sonra yola göre sıralar."""
    kok = Path(dizin)
    bulgular: list[Bulgu] = []
    for yol in sorted(kok.rglob('*')):
        goreli = yol.relative_to(kok).as_posix()
        if yol.is_symlink():
            bulgular.append(Bulgu('orta', 'sembolik-baglanti', goreli, 0, f'bağlantı hedefi: {yol.readlink()}'))
            continue
        if yol.is_file():
            bulgular.extend(dosya_tara(yol, goreli))
    bulgular.sort(key=lambda b: (SIDDET_SIRASI[b.siddet], b.yol, b.satir, b.kural))
    return bulgular
