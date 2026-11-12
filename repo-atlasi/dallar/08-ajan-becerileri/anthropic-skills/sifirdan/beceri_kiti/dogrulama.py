"""Beceri doğrulayıcı: bir beceri klasörünü profil kurallarına göre denetler.

'spec' profili anthropics/skills deposundaki skills/skill-creator/scripts/quick_validate.py
kurallarını izler (incelenen commit 2c5958e, 2026-11-06): izinli alanlar, zorunlu alanlar,
ad biçimi ve uzunluk sınırları. Diğer denetimler (uyarı/bilgi) öbür depolardan derlenmiş
iyi uygulamalardır; her bulgunun mesajında nereden geldiği yazar.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .onbilgi import OnbilgiHatasi, oku

SPEC_ALANLARI = frozenset({'name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility'})

# Profil = hangi ön bilgi alanlarının kabul edildiği ve tanınmayan alanın ne kadar ciddi sayıldığı.
PROFILLER = {
    # quick_validate.py ile aynı küme; bilinmeyen alan hatadır.
    'spec': {'izinli': SPEC_ALANLARI, 'bilinmeyen': 'hata'},
    # Claude Code'a özgü, klonlarda gördüğümüz eklentiler (mattpocock/skills). Başka eklentiler
    # de olabilir (doğrulanmadı); bu yüzden bilinmeyen alan burada yalnızca uyarıdır.
    'claude-code': {'izinli': SPEC_ALANLARI | {'disable-model-invocation', 'argument-hint'}, 'bilinmeyen': 'uyari'},
    # ECC scripts/ci/validate-skill-host-compat.js: Codex kopyaları için izin listesi.
    'codex-kopya': {
        'izinli': frozenset({'name', 'description', 'metadata', 'license', 'allowed-tools'}),
        'bilinmeyen': 'hata',
    },
}

AD_DESENI = re.compile(r'^[a-z0-9-]+$')
AD_SINIRI = 64
ACIKLAMA_SINIRI = 1024
UYUMLULUK_SINIRI = 500
GOVDE_SATIR_ONERISI = 500  # skill-creator/SKILL.md: "<500 lines ideal"
SKILL_BAYT_SINIRI = 20_000  # superpowers tests/skill-size: sıkıştırma (compaction) sonrası kesme sınırı iddiası
TETIK_IPUCLARI = ('use when', 'use this', 'use it', 'when the user', 'trigger', 'kullan', 'durumunda', 'istediğinde')
GELISTIRME_DOSYASI = re.compile(r'^(CREATION-LOG\.md|test-.*\.md)$')
CLAUDE_DEGISKENI = re.compile(r'\$\{?(CLAUDE_SESSION_ID|CLAUDE_SKILL_DIR|CLAUDE_PLUGIN_ROOT|CLAUDE_PROJECT_DIR|ARGUMENTS)\b\}?')
_KOD_CITI = re.compile(r'^(```|~~~)\s*([A-Za-z0-9_+-]*)')
_BAGLANTI = re.compile(r'\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)')
_KOD_YOLU = re.compile(r'`([A-Za-z0-9_./-]+/[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,5})`')
_CIPLAK_BUYUK = re.compile(r'(?<![\w/.-])([A-Z][A-Z0-9_-]*\.md)\b')


@dataclass
class Bulgu:
    duzey: str  # 'hata' | 'uyari' | 'bilgi'
    kod: str
    mesaj: str
    yer: str = ''

    def __str__(self) -> str:
        yer = f' ({self.yer})' if self.yer else ''
        return f'[{self.duzey}] {self.kod}: {self.mesaj}{yer}'


@dataclass
class Rapor:
    beceri: str
    profil: str
    bulgular: list[Bulgu] = field(default_factory=list)
    veri: dict = field(default_factory=dict)

    @property
    def gecerli(self) -> bool:
        return not any(b.duzey == 'hata' for b in self.bulgular)

    def kodlar(self, duzey: str | None = None) -> list[str]:
        return [b.kod for b in self.bulgular if duzey is None or b.duzey == duzey]

    def ekle(self, duzey: str, kod: str, mesaj: str, yer: str = '') -> None:
        self.bulgular.append(Bulgu(duzey, kod, mesaj, yer))


def dogrula(beceri_dizini: str | Path, profil: str = 'spec') -> Rapor:
    """Bir beceri klasörünü denetler ve tüm bulguları içeren bir Rapor döndürür."""
    if profil not in PROFILLER:
        raise ValueError(f'Bilinmeyen profil: {profil} (seçenekler: {", ".join(PROFILLER)})')
    dizin = Path(beceri_dizini)
    rapor = Rapor(beceri=dizin.name, profil=profil)
    skill_md = dizin / 'SKILL.md'
    if not skill_md.is_file():
        rapor.ekle('hata', 'skill-md-yok', 'SKILL.md bulunamadı', str(dizin))
        return rapor
    ham_bayt = skill_md.read_bytes()
    metin = ham_bayt.decode('utf-8', errors='replace')
    try:
        onbilgi = oku(metin)
    except OnbilgiHatasi as hata:
        kod = 'onbilgi-yok' if 'Ön bilgi yok' in hata.mesaj else 'onbilgi-bozuk'
        rapor.ekle('hata', kod, hata.mesaj, f'SKILL.md:{hata.satir or 1}')
        return rapor
    veri = onbilgi.veri
    rapor.veri = veri

    _alanlari_denetle(rapor, veri, profil)
    _ad_ve_aciklama(rapor, veri, onbilgi.bicimler, dizin.name)
    _boyut(rapor, metin, ham_bayt, onbilgi.govde)
    _kaynaklar(rapor, dizin, onbilgi.govde, onbilgi.govde_satiri)
    _tasinabilirlik(rapor, onbilgi.govde, onbilgi.govde_satiri, profil)
    _gelistirme_dosyalari(rapor, dizin)
    return rapor


def _alanlari_denetle(rapor: Rapor, veri: dict, profil: str) -> None:
    kural = PROFILLER[profil]
    for anahtar in sorted(set(veri) - kural['izinli']):
        rapor.ekle(
            kural['bilinmeyen'],
            'bilinmeyen-alan',
            f'"{anahtar}" alanı "{profil}" profilinde tanımlı değil (izinli: {", ".join(sorted(kural["izinli"]))})',
        )
    if 'disable-model-invocation' in veri and not isinstance(veri['disable-model-invocation'], bool):
        rapor.ekle('hata', 'bool-tipi', 'disable-model-invocation true ya da false olmalı')
    if 'metadata' in veri and not isinstance(veri['metadata'], dict):
        rapor.ekle('hata', 'metadata-tipi', 'metadata bir eşleme (anahtar: değer) olmalı')
    uyumluluk = veri.get('compatibility')
    if uyumluluk:
        if not isinstance(uyumluluk, str):
            rapor.ekle('hata', 'uyumluluk-tipi', 'compatibility metin olmalı')
        elif len(uyumluluk) > UYUMLULUK_SINIRI:
            rapor.ekle('hata', 'uyumluluk-uzun', f'compatibility {len(uyumluluk)} karakter (sınır {UYUMLULUK_SINIRI})')


def _ad_ve_aciklama(rapor: Rapor, veri: dict, bicimler: dict, dizin_adi: str) -> None:
    if 'name' not in veri:
        rapor.ekle('hata', 'ad-eksik', 'Ön bilgide "name" yok')
    else:
        ad = veri['name']
        if not isinstance(ad, str):
            rapor.ekle('hata', 'ad-tipi', f'name metin olmalı, bulunan: {type(ad).__name__}')
        else:
            ad = ad.strip()
            if ad and not AD_DESENI.match(ad):
                rapor.ekle('hata', 'ad-bicimi', f'"{ad}" kebab-case değil (yalnızca küçük harf, rakam, tire)')
            elif ad and (ad.startswith('-') or ad.endswith('-') or '--' in ad):
                rapor.ekle('hata', 'ad-tire', f'"{ad}" tireyle başlayamaz/bitemez, "--" içeremez')
            if len(ad) > AD_SINIRI:
                rapor.ekle('hata', 'ad-uzun', f'name {len(ad)} karakter (sınır {AD_SINIRI})')
            if ad and ad != dizin_adi:
                rapor.ekle('uyari', 'ad-dizin-uyumsuz', f'name "{ad}" ile klasör adı "{dizin_adi}" farklı')
    if 'description' not in veri:
        rapor.ekle('hata', 'aciklama-eksik', 'Ön bilgide "description" yok')
        return
    aciklama = veri['description']
    if not isinstance(aciklama, str):
        rapor.ekle('hata', 'aciklama-tipi', f'description metin olmalı, bulunan: {type(aciklama).__name__}')
        return
    aciklama = aciklama.strip()
    if '<' in aciklama or '>' in aciklama:
        rapor.ekle('hata', 'aciklama-acili-parantez', 'description açılı parantez (< veya >) içeremez')
    if len(aciklama) > ACIKLAMA_SINIRI:
        rapor.ekle('hata', 'aciklama-uzun', f'description {len(aciklama)} karakter (sınır {ACIKLAMA_SINIRI})')
    if str(bicimler.get('description', '')).startswith('|'):
        rapor.ekle(
            'uyari',
            'aciklama-literal-blok',
            'description "|" blokla yazılmış; satır sonları korunur ve düz tablolar bozulur (ECC validate-skills.js)',
        )
    kullanici = veri.get('disable-model-invocation') is True
    if not kullanici and not any(ipucu in aciklama.lower() for ipucu in TETIK_IPUCLARI):
        rapor.ekle(
            'bilgi',
            'aciklama-ne-zaman',
            'description ne zaman kullanılacağını söylemiyor; tetiklenme açıklamaya bağlıdır (skill-creator)',
        )


def satir_sayisi(metin: str) -> int:
    """`wc -l` ve editörlerle aynı sayım: sondaki satır sonu yeni bir satır başlatmaz ('a\\nb\\n' 2 satırdır)."""
    if not metin:
        return 0
    return metin.count('\n') + (0 if metin.endswith('\n') else 1)


def _boyut(rapor: Rapor, metin: str, ham_bayt: bytes, govde: str) -> None:
    satir = satir_sayisi(govde)
    if satir > GOVDE_SATIR_ONERISI:
        rapor.ekle(
            'uyari',
            'govde-uzun',
            f'gövde {satir} satır; 500 altı önerilir, ayrıntıyı references/ altına taşı (skill-creator)',
        )
    if len(ham_bayt) >= SKILL_BAYT_SINIRI:
        rapor.ekle(
            'uyari',
            'skill-bayt',
            f'SKILL.md {len(ham_bayt)} bayt; superpowers testine göre 20000 baytı aşan kısım sıkıştırmada kesilebilir',
        )


def kod_bloklarini_ayir(govde: str) -> tuple[list[tuple[int, str]], list[tuple[str, int, str]]]:
    """Gövdeyi (düzyazı satırları, kod blokları) olarak ayırır.

    Dönen düzyazı: [(gövdedeki satır indisi, satır)], kod blokları: [(dil, başlangıç indisi, içerik)].
    """
    duzyazi: list[tuple[int, str]] = []
    bloklar: list[tuple[str, int, str]] = []
    acik: tuple[str, str, int, list[str]] | None = None  # (çit, dil, başlangıç, satırlar)
    for i, satir in enumerate(govde.split('\n')):
        cit = _KOD_CITI.match(satir.strip())
        if acik is None and cit:
            acik = (cit.group(1), cit.group(2).lower(), i, [])
        elif acik is not None and satir.strip().startswith(acik[0]) and satir.strip().strip('`~') == '':
            bloklar.append((acik[1], acik[2], '\n'.join(acik[3])))
            acik = None
        elif acik is not None:
            acik[3].append(satir)
        else:
            duzyazi.append((i, satir))
    if acik is not None:  # kapanmamış blok: içeriği yine kod say
        bloklar.append((acik[1], acik[2], '\n'.join(acik[3])))
    return duzyazi, bloklar


def kaynak_referanslari(govde: str) -> list[tuple[str, int, str]]:
    """Gövdedeki dosya referanslarını bulur: (yol, gövde satır indisi, tür).

    Tür 'baglanti' (Markdown bağlantısı), 'kod' (`scripts/x.py` gibi ters tırnaklı yol) ya da
    'ciplak' (REFERENCE.md gibi büyük harfli çıplak ad) olur. Kod blokları atlanır.
    """
    bulunan: list[tuple[str, int, str]] = []
    duzyazi, _ = kod_bloklarini_ayir(govde)
    for i, satir in duzyazi:
        for hedef in _BAGLANTI.findall(satir):
            if re.match(r'^[a-z][a-z0-9+.-]*:', hedef) or hedef.startswith('#'):
                continue  # http:, mailto: ve sayfa içi çapalar dosya değildir
            hedef = hedef.split('#')[0].split('?')[0].replace('%20', ' ')
            if hedef:
                bulunan.append((hedef, i, 'baglanti'))
        for hedef in _KOD_YOLU.findall(satir):
            bulunan.append((hedef, i, 'kod'))
        for hedef in _CIPLAK_BUYUK.findall(satir):
            bulunan.append((hedef, i, 'ciplak'))
    return bulunan


def _harf_duyarsiz_bul(kok: Path, goreli: str) -> Path | None:
    """Yolu büyük/küçük harf duyarsız arar; bulursa gerçek yolu döndürür."""
    simdiki = kok
    for parca in Path(goreli).parts:
        if not simdiki.is_dir():
            return None
        adaylar = [c for c in simdiki.iterdir() if c.name.lower() == parca.lower()]
        if not adaylar:
            return None
        simdiki = adaylar[0]
    return simdiki


def _kaynaklar(rapor: Rapor, dizin: Path, govde: str, govde_satiri: int) -> None:
    kok = dizin.resolve()
    gorulen: set[tuple[str, str]] = set()
    for hedef, i, tur in kaynak_referanslari(govde):
        if (hedef, tur) in gorulen:
            continue
        gorulen.add((hedef, tur))
        if tur == 'baglanti' and '/' not in hedef and '.' not in hedef:
            continue  # [Başlık](URL) gibi yer tutucu: dosya değil
        if tur == 'kod' and not (dizin / hedef.split('/')[0]).exists():
            continue  # `word/document.xml` gibi beceri dışı yollar: yalnızca var olan klasörleri denetle
        yer = f'SKILL.md:{govde_satiri + i}'
        yol = (dizin / hedef).resolve()
        if not yol.is_relative_to(kok):
            rapor.ekle('uyari', 'kaynak-disarida', f'"{hedef}" beceri klasörünün dışını gösteriyor', yer)
            continue
        if yol.exists() and yol.name in {p.name for p in yol.parent.iterdir()}:
            continue
        gercek = _harf_duyarsiz_bul(dizin, hedef)
        if gercek is not None:
            rapor.ekle(
                'uyari',
                'kaynak-harf',
                f'"{hedef}" yok ama "{gercek.relative_to(dizin)}" var; büyük/küçük harf duyarlı dosya '
                'sistemlerinde açılamaz',
                yer,
            )
        elif tur != 'ciplak':
            rapor.ekle('uyari', 'kaynak-kirik', f'"{hedef}" bulunamadı', yer)


def _tasinabilirlik(rapor: Rapor, govde: str, govde_satiri: int, profil: str) -> None:
    _, bloklar = kod_bloklarini_ayir(govde)
    duzey = 'uyari' if profil == 'codex-kopya' else 'bilgi'
    for dil, baslangic, icerik in bloklar:
        if dil not in ('bash', 'sh', 'zsh', 'shell'):
            continue
        for eslesme in sorted(set(CLAUDE_DEGISKENI.findall(icerik))):
            rapor.ekle(
                duzey,
                'claude-ozel-degisken',
                f'kabuk bloğunda {eslesme} değişkeni: Claude Code dışındaki ortamlarda olduğu gibi kalır '
                '(ECC validate-skill-host-compat.js)',
                f'SKILL.md:{govde_satiri + baslangic}',
            )


def _gelistirme_dosyalari(rapor: Rapor, dizin: Path) -> None:
    for yol in sorted(dizin.rglob('*')):
        if yol.is_file() and GELISTIRME_DOSYASI.match(yol.name):
            rapor.ekle(
                'uyari',
                'gelistirme-dosyasi',
                f'{yol.relative_to(dizin)} kurulan beceriyle birlikte gider; ajan bunu talimat sanabilir '
                '(superpowers tests/skill-layout)',
            )
