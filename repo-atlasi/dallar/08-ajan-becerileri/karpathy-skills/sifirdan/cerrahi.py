#!/usr/bin/env python3
"""Cerrahi değişiklik puanlayıcı: bir git diff'inde "gereğinden fazla dokunma" işaretlerini sayar.

multica-ai/andrej-karpathy-skills (2c60614) dört ilke önerir; ikisi doğrudan diff'te görünür:
  - Surgical Changes (cerrahi değişiklik): "her değişen satır kullanıcının isteğine bağlanabilmeli";
    komşu kodu, yorumları, biçimi "iyileştirme".
  - Simplicity First (önce sadelik): istenmeyen soyutlama, esneklik, özellik ekleme.
Üçüncüsü dolaylı görünür: Goal-Driven Execution (hedefe dayalı yürütme) "hatayı yeniden üreten bir
test yaz" der; kod değişip hiçbir test değişmemişse bu bir işarettir.

README'nin "çalışıyor mu" ölçütü: diff'lerde daha az gereksiz değişiklik. Bu betik o ölçütü sayıya
döker. Bir *sohbet başlatıcıdır*, hakem değildir: bazen biçim değişikliği tam da istenen şeydir.

Kullanım:
  git diff | python3 cerrahi.py --izinli 'fatura/kdv.py' --izinli 'tests/*' --butce 20
  python3 cerrahi.py ornekler/tasan.diff --json
"""

from __future__ import annotations

import argparse
import difflib
import fnmatch
import json
import re
import sys
from dataclasses import asdict, dataclass, field

KOD_UZANTILARI = ('.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.go', '.rs', '.java', '.kt', '.rb', '.php', '.cs')
TEST_DESENLERI = ('test_*.py', '*_test.py', '*.test.*', '*.spec.*', '*_test.go', 'tests/*', '*/tests/*', 'test/*', '*/test/*')
YORUM_BASI = ('#', '//', '/*', '*', '--', '"""', "'''")
SOYUTLAMA = re.compile(r'^\s*(?:export\s+)?(?:async\s+)?(?:def|class|function|interface|struct|trait)\s+([A-Za-z_]\w*)')
SONDAKI_YORUM = re.compile(r'\s+(#|//).*$')
BELIRTEC = re.compile(r'[A-Za-z_çğıöşüÇĞİÖŞÜ][\wçğıöşüÇĞİÖŞÜ]*|\S')
ANAHTAR_SOZCUKLER = {
    'def', 'class', 'return', 'if', 'else', 'elif', 'for', 'while', 'import', 'from', 'as', 'in', 'not', 'and', 'or',
    'function', 'const', 'let', 'var', 'new', 'async', 'await', 'try', 'except', 'catch', 'finally', 'with', 'None',
    'True', 'False', 'null', 'true', 'false', 'self', 'this',
}  # fmt: skip
CEZALAR = {
    'kapsam-disi': 15,
    'bosluk': 3,
    'tirnak': 3,
    'yorum': 3,
    'ad-degisimi': 3,
    'yorum-silindi': 2,
    'yorum-eklendi': 2,
    'yeni-soyutlama': 5,
    'buyukluk': 1,
    'test-yok': 5,
}
KOZMETIK_TAVAN = 30


@dataclass
class Parca:
    eski_bas: int
    yeni_bas: int
    satirlar: list[tuple[str, str]] = field(default_factory=list)  # ('+'|'-'|' ', metin)


@dataclass
class DosyaFarki:
    eski_yol: str | None
    yeni_yol: str | None
    parcalar: list[Parca] = field(default_factory=list)
    ikili: bool = False

    @property
    def yol(self) -> str:
        return self.yeni_yol or self.eski_yol or '?'


@dataclass
class Isaret:
    tur: str
    ilke: str
    yer: str
    aciklama: str


def _yol(ham: str) -> str | None:
    ham = ham.split('\t')[0].strip()
    if ham == '/dev/null':
        return None
    return ham[2:] if ham.startswith(('a/', 'b/')) else ham


def diff_ayristir(metin: str) -> list[DosyaFarki]:
    """Birleşik (unified) diff metnini dosya ve parça listesine çevirir.

    Parça başlığındaki satır sayıları (@@ -a,b +c,d @@) kadar satır tüketilir; böylece içeriği
    "---" ile başlayan bir satır (ör. SQL yorumu) dosya başlığıyla karışmaz.
    """
    dosyalar: list[DosyaFarki] = []
    simdiki: DosyaFarki | None = None
    parca: Parca | None = None
    kalan_eski = kalan_yeni = 0
    for satir in metin.replace('\r\n', '\n').split('\n'):
        if parca is not None and (kalan_eski > 0 or kalan_yeni > 0):
            if satir.startswith('\\'):  # "\ No newline at end of file"
                continue
            tur = satir[:1] if satir[:1] in ('+', '-', ' ') else ' '  # boş bağlam satırının boşluğu silinmiş olabilir
            parca.satirlar.append((tur, satir[1:] if satir[:1] in ('+', '-', ' ') else ''))
            kalan_eski -= tur in (' ', '-')
            kalan_yeni -= tur in (' ', '+')
            continue
        if satir.startswith('diff --git '):
            m = re.match(r'diff --git a/(.*) b/(.*)$', satir)
            simdiki = DosyaFarki(m.group(1) if m else None, m.group(2) if m else None)
            dosyalar.append(simdiki)
        elif satir.startswith('--- '):
            if simdiki is None or simdiki.parcalar:
                simdiki = DosyaFarki(None, None)
                dosyalar.append(simdiki)
            simdiki.eski_yol = _yol(satir[4:])
        elif satir.startswith('+++ ') and simdiki is not None:
            simdiki.yeni_yol = _yol(satir[4:])
        elif satir.startswith('rename from ') and simdiki is not None:
            simdiki.eski_yol = satir[len('rename from ') :]
        elif satir.startswith('rename to ') and simdiki is not None:
            simdiki.yeni_yol = satir[len('rename to ') :]
        elif satir.startswith('Binary files') and simdiki is not None:
            simdiki.ikili = True
        elif satir.startswith('@@') and simdiki is not None:
            m = re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@', satir)
            if not m:
                raise ValueError(f'Bozuk parça başlığı: {satir}')
            parca = Parca(int(m.group(1)), int(m.group(3)))
            kalan_eski = int(m.group(2)) if m.group(2) is not None else 1
            kalan_yeni = int(m.group(4)) if m.group(4) is not None else 1
            simdiki.parcalar.append(parca)
    return dosyalar


def _yorum_mu(satir: str) -> bool:
    return satir.strip().startswith(YORUM_BASI)


def _tanim_adi(satir: str) -> str | None:
    """'def ad(', 'class Ad', 'function ad' satırlarındaki tanım adı."""
    m = SOYUTLAMA.match(satir)
    return m.group(1) if m else None


def eslestir(silinen: list[str], eklenen: list[str], esik: float = 0.5):
    """Silinen ve eklenen satırları benzerliğe göre eşler (açgözlü). (çiftler, eşsiz silinen, eşsiz eklenen)."""
    ciftler: list[tuple[int, int]] = []
    kullanilan: set[int] = set()
    for i, eski in enumerate(silinen):
        en_iyi, en_iyi_j = 0.0, None
        for j, yeni in enumerate(eklenen):
            if j in kullanilan:
                continue
            oran = difflib.SequenceMatcher(None, eski.strip(), yeni.strip()).ratio()
            if oran > en_iyi:
                en_iyi, en_iyi_j = oran, j
        if en_iyi_j is not None and en_iyi >= esik:
            kullanilan.add(en_iyi_j)
            ciftler.append((i, en_iyi_j))
    eslesen = {i for i, _ in ciftler}
    return ciftler, [i for i in range(len(silinen)) if i not in eslesen], [j for j in range(len(eklenen)) if j not in kullanilan]


def cift_turu(eski: str, yeni: str) -> str | None:
    """Silinen/eklenen satır çifti yalnızca kozmetik bir değişiklikse türünü döndürür."""
    if eski == yeni:
        return None
    if re.sub(r'\s+', '', eski) == re.sub(r'\s+', '', yeni):
        return 'bosluk'
    if eski.replace('"', "'") == yeni.replace('"', "'"):
        return 'tirnak'
    if _yorum_mu(eski) and _yorum_mu(yeni):
        return 'yorum'
    if SONDAKI_YORUM.sub('', eski).rstrip() == SONDAKI_YORUM.sub('', yeni).rstrip():
        return 'yorum'
    a, b = BELIRTEC.findall(eski), BELIRTEC.findall(yeni)
    if len(a) == len(b) and a != b:
        farklar = [(x, y) for x, y in zip(a, b) if x != y]
        if all(x[0].isalpha() or x[0] == '_' for x, _ in farklar) and all(y[0].isalpha() or y[0] == '_' for _, y in farklar):
            if not any(x in ANAHTAR_SOZCUKLER or y in ANAHTAR_SOZCUKLER for x, y in farklar):
                return 'ad-degisimi'
    return None


def _bloklar(parca: Parca):
    """Parçayı (silinenler, eklenenler, ilk yeni satır no) değişiklik bloklarına böler."""
    silinen: list[str] = []
    eklenen: list[str] = []
    yeni_no = parca.yeni_bas
    blok_basi = yeni_no
    for tur, metin in parca.satirlar + [(' ', None)]:
        if tur == ' ':
            if silinen or eklenen:
                yield silinen, eklenen, blok_basi
                silinen, eklenen = [], []
            yeni_no += 1
            blok_basi = yeni_no
        elif tur == '-':
            silinen.append(metin)
        else:
            eklenen.append(metin)
            yeni_no += 1


def test_dosyasi_mi(yol: str) -> bool:
    ad = yol.rsplit('/', 1)[-1]
    return any(fnmatch.fnmatch(yol, d) or fnmatch.fnmatch(ad, d) for d in TEST_DESENLERI)


def puanla(dosyalar: list[DosyaFarki], izinli: list[str] | None = None, butce: int | None = None, soyutlama_izni: int = 1) -> dict:
    isaretler: list[Isaret] = []
    eklenen_toplam = silinen_toplam = 0
    yeni_soyut = 0
    for dosya in dosyalar:
        if izinli and not any(fnmatch.fnmatch(dosya.yol, d) for d in izinli):
            isaretler.append(Isaret('kapsam-disi', 'Cerrahi değişiklik', dosya.yol, 'görevin dosya listesinde yok'))
        silinen_adlar: set[str] = set()
        eklenen_tanimlar: list[tuple[str, str]] = []
        for parca in dosya.parcalar:
            for silinen, eklenen, satir_no in _bloklar(parca):
                eklenen_toplam += len(eklenen)
                silinen_toplam += len(silinen)
                ciftler, essiz_silinen, essiz_eklenen = eslestir(silinen, eklenen)
                for i, j in ciftler:
                    tur = cift_turu(silinen[i], eklenen[j])
                    if tur:
                        once, sonra = (repr(silinen[i]), repr(eklenen[j])) if tur == 'bosluk' else (repr(silinen[i].strip()), repr(eklenen[j].strip()))
                        isaretler.append(Isaret(tur, 'Cerrahi değişiklik', f'{dosya.yol}:{satir_no + j}', f'{once} → {sonra}'))
                for i in essiz_silinen:
                    if _yorum_mu(silinen[i]):
                        isaretler.append(Isaret('yorum-silindi', 'Cerrahi değişiklik', f'{dosya.yol}:{satir_no}', silinen[i].strip()))
                for j in essiz_eklenen:
                    if _yorum_mu(eklenen[j]):
                        isaretler.append(Isaret('yorum-eklendi', 'Cerrahi değişiklik', f'{dosya.yol}:{satir_no + j}', eklenen[j].strip()))
                silinen_adlar.update(ad for ad in map(_tanim_adi, silinen) if ad)
                eklenen_tanimlar += [(ad, e.strip()) for e in eklenen if (ad := _tanim_adi(e))]
        if test_dosyasi_mi(dosya.yol):
            continue  # yeni test fonksiyonu soyutlama değil, hedefe dayalı yürütmenin kendisidir
        for ad, satir in eklenen_tanimlar:
            if ad not in silinen_adlar:  # yeniden adlandırılan/değiştirilen tanım yeni soyutlama değildir
                yeni_soyut += 1
                isaretler.append(Isaret('yeni-soyutlama', 'Önce sadelik', dosya.yol, satir))
    degisen = eklenen_toplam + silinen_toplam
    if butce is not None and degisen > butce:
        isaretler.append(Isaret('buyukluk', 'Önce sadelik', '-', f'{degisen} satır değişti, bütçe {butce}'))
    kod_degisti = any(d.yol.endswith(KOD_UZANTILARI) and not test_dosyasi_mi(d.yol) for d in dosyalar)
    if kod_degisti and not any(test_dosyasi_mi(d.yol) for d in dosyalar):
        isaretler.append(Isaret('test-yok', 'Hedefe dayalı yürütme', '-', 'kod değişti ama hiçbir test dosyası değişmedi'))

    ceza = CEZALAR['yeni-soyutlama'] * max(0, yeni_soyut - soyutlama_izni)  # ilk 'izin' kadarı serbest
    kozmetik = 0
    for isaret in isaretler:
        if isaret.tur in ('bosluk', 'tirnak', 'yorum', 'ad-degisimi', 'yorum-silindi', 'yorum-eklendi'):
            kozmetik += CEZALAR[isaret.tur]
        elif isaret.tur == 'buyukluk':
            ceza += min(20, (degisen - butce) // 5 * CEZALAR['buyukluk'])
        elif isaret.tur != 'yeni-soyutlama':
            ceza += CEZALAR[isaret.tur]
    ceza += min(kozmetik, KOZMETIK_TAVAN)
    puan = max(0, 100 - ceza)
    karar = 'cerrahi' if puan >= 85 else 'dikkat' if puan >= 60 else 'taşkın'
    return {
        'puan': puan,
        'karar': karar,
        'dosya': len(dosyalar),
        'eklenen': eklenen_toplam,
        'silinen': silinen_toplam,
        'isaretler': [asdict(i) for i in isaretler],
    }


def rapor_metni(sonuc: dict) -> str:
    satirlar = [
        f'Puan: {sonuc["puan"]}/100 ({sonuc["karar"]}) — {sonuc["dosya"]} dosya, +{sonuc["eklenen"]} -{sonuc["silinen"]}'
    ]
    for i in sonuc['isaretler']:
        satirlar.append(f'  [{i["ilke"]}] {i["tur"]:14} {i["yer"]}  {i["aciklama"]}')
    satirlar.append('Not: işaretler sohbet başlatıcıdır; her biri için "bu satır isteğe bağlanıyor mu?" diye sor.')
    return '\n'.join(satirlar)


def ana(argv: list[str] | None = None, girdi=None) -> int:
    ayr = argparse.ArgumentParser(prog='cerrahi', description='git diff için cerrahi değişiklik puanı')
    ayr.add_argument('dosya', nargs='?', help='diff dosyası; verilmezse standart girdi okunur')
    ayr.add_argument('--izinli', action='append', help='görevin dokunabileceği yol deseni (tekrarlanabilir)')
    ayr.add_argument('--butce', type=int, help='değişen satır bütçesi')
    ayr.add_argument('--json', action='store_true')
    arg = ayr.parse_args(argv)
    if arg.dosya:
        with open(arg.dosya, encoding='utf-8') as f:
            metin = f.read()
    else:
        metin = (girdi or sys.stdin).read()
    sonuc = puanla(diff_ayristir(metin), arg.izinli, arg.butce)
    print(json.dumps(sonuc, ensure_ascii=False, indent=2) if arg.json else rapor_metni(sonuc))
    return 0 if sonuc['karar'] != 'taşkın' else 1


if __name__ == '__main__':
    sys.exit(ana())
