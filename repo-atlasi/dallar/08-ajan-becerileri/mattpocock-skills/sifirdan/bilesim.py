#!/usr/bin/env python3
"""Beceri bileşimi denetleyicisi: küçük becerilerin birbirini nasıl çağırdığını doğrular.

mattpocock/skills deposunun kuralları (4ae2317, .agents/invocation.md ve CLAUDE.md):

- Her beceri ya **kullanıcı çağırır** (yalnızca insan /ad yazarak; ön bilgide
  ``disable-model-invocation: true`` ve agents/openai.yaml'da ``policy.allow_implicit_invocation:
  false``) ya da **model çağırır**dır (model de insan da ulaşabilir).
- Kullanıcı-çağırır beceri model-çağırır becerileri çağırabilir; hiçbir beceri kullanıcı-çağırır
  bir beceriyi çağıramaz. Böyle bir önkoşul varsa "kullanıcıya /x çalıştırmasını söyle" denir.
- Bağımlılık açıkça "Beceri aracını \"x\" ile çağır" diye yazılır; iki beceri iki çağrıdır.
- Kullanıcı-çağırır becerinin açıklaması insana yönelik tek satırdır; model-çağırır becerinin
  açıklaması tetik ifadeleri taşır.
- Alt ajan başlatan her beceri "taze bağlam" ister (bazı harness'ler alt ajanı ana bağlamı
  kopyalayarak başlatır).
- Yönlendirici (ask-matt) her kullanıcı-çağırır beceriyi anar; olmayan bir beceriye yönlendiren
  yönlendirici "yalan söyler".

Kullanım:
  python3 bilesim.py denetle ornek-takim --yonlendirici yol-goster
  python3 bilesim.py tablo ornek-takim
  python3 bilesim.py graf ornek-takim        # mermaid çıktısı
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import _cekirdek  # noqa: E402,F401
from beceri_kiti.onbilgi import OnbilgiHatasi, oku, yaml_oku  # noqa: E402

CAGRI_CUMLESI = re.compile(r'(call the skill tool|beceri aracını)[^\n.]*', re.IGNORECASE)
TIRNAKLI_AD = re.compile(r'"([a-z0-9][a-z0-9-]*)"')
SLASH_AD = re.compile(r'(?<![\w/.])/([a-z][a-z0-9-]*)\b(?!/)')  # '/x/' bir yol parçasıdır, komut değil
KULLANICIYA = re.compile(r'(tell the user|kullanıcıya|kullanıcıdan)', re.IGNORECASE)
TETIK = re.compile(r'(use when|use this when|use it when|\bkullan\b|istendiğinde|dediğinde|durumunda)', re.IGNORECASE)
ALT_AJAN = re.compile(r'(sub-?agent|background agent|alt ajan|arka plan ajanı)', re.IGNORECASE)
TAZE_BAGLAM = re.compile(
    r'(fresh (context|agent|background agent|sub-?agent)|taze bağlam|temiz bağlam)', re.IGNORECASE
)
# Harness'in kendi komutları beceri değildir (Claude Code'da /clear ve /compact gibi; liste doğrulanmadı).
HARNESS_KOMUTLARI = {'clear', 'compact', 'help', 'init', 'model', 'plugin'}


@dataclass
class Beceri:
    ad: str
    dizin: Path
    aciklama: str
    kullanici_cagirir: bool
    govde: str
    openai: dict | None
    cagrilar: list[str] = field(default_factory=list)

    def tum_metin(self) -> str:
        """Gövde + klasördeki diğer .md dosyaları (ayrıntı çoğu zaman references/ altındadır)."""
        ekler = [y.read_text(encoding='utf-8', errors='replace') for y in sorted(self.dizin.rglob('*.md')) if y.name != 'SKILL.md']
        return '\n'.join([self.govde, *ekler])


@dataclass
class Bulgu:
    duzey: str  # 'hata' | 'uyari' | 'bilgi'
    kod: str
    beceri: str
    mesaj: str

    def __str__(self) -> str:
        return f'[{self.duzey}] {self.kod} ({self.beceri}): {self.mesaj}'


def cumleler(metin: str) -> list[str]:
    return [c.strip() for c in re.split(r'(?<=[.!?])\s+|\n+', metin) if c.strip()]


def cagrilari_cikar(govde: str) -> list[str]:
    """'Beceri aracını "x" ile çağır' / 'Call the Skill tool with "x"' cümlelerindeki adlar, sırayla."""
    adlar: list[str] = []
    for eslesme in CAGRI_CUMLESI.finditer(govde):
        for ad in TIRNAKLI_AD.findall(eslesme.group(0)):
            if ad not in adlar:
                adlar.append(ad)
    return adlar


def yukle(*kokler: str | Path) -> tuple[dict[str, Beceri], list[Bulgu]]:
    beceriler: dict[str, Beceri] = {}
    bulgular: list[Bulgu] = []
    for skill_md in sorted(y for kok in kokler for y in Path(kok).rglob('SKILL.md')):
        dizin = skill_md.parent
        try:
            onbilgi = oku(skill_md.read_text(encoding='utf-8'))
        except OnbilgiHatasi as hata:
            bulgular.append(Bulgu('hata', 'onbilgi-bozuk', dizin.name, str(hata)))
            continue
        ad = str(onbilgi.veri.get('name', dizin.name))
        sidecar = dizin / 'agents' / 'openai.yaml'
        openai = None
        if sidecar.is_file():
            try:
                openai = yaml_oku(sidecar.read_text(encoding='utf-8'))
            except OnbilgiHatasi as hata:
                bulgular.append(Bulgu('hata', 'openai-bozuk', ad, str(hata)))
        if ad != dizin.name:
            bulgular.append(Bulgu('uyari', 'ad-dizin', ad, f'klasör adı "{dizin.name}"'))
        beceriler[ad] = Beceri(
            ad=ad,
            dizin=dizin,
            aciklama=str(onbilgi.veri.get('description', '')),
            kullanici_cagirir=onbilgi.veri.get('disable-model-invocation') is True,
            govde=onbilgi.govde,
            openai=openai,
            cagrilar=cagrilari_cikar(onbilgi.govde),
        )
    return beceriler, bulgular


def _ortuk_cagri_kapali(openai: dict | None) -> bool | None:
    if openai is None:
        return None
    politika = openai.get('policy') or {}
    return politika.get('allow_implicit_invocation') is False


def donguler(beceriler: dict[str, Beceri]) -> list[list[str]]:
    """Çağrı grafiğindeki döngüleri bulur (DFS, her döngü bir kez)."""
    bulunan: list[list[str]] = []
    gorulen: set[frozenset] = set()

    def gez(ad: str, yol: list[str]) -> None:
        for hedef in beceriler[ad].cagrilar:
            if hedef not in beceriler:
                continue
            if hedef in yol:
                dongu = yol[yol.index(hedef) :]
                anahtar = frozenset(dongu)
                if anahtar not in gorulen:
                    gorulen.add(anahtar)
                    bulunan.append(dongu + [hedef])
                continue
            gez(hedef, yol + [hedef])

    for ad in sorted(beceriler):
        gez(ad, [ad])
    return bulunan


def denetle(beceriler: dict[str, Beceri], yonlendirici: str | None = None) -> list[Bulgu]:
    bulgular: list[Bulgu] = []
    for ad, b in sorted(beceriler.items()):
        for hedef in b.cagrilar:
            if hedef not in beceriler:
                bulgular.append(Bulgu('hata', 'hedef-yok', ad, f'"{hedef}" adlı beceri yok'))
            elif beceriler[hedef].kullanici_cagirir:
                bulgular.append(
                    Bulgu(
                        'hata',
                        'kullanici-becerisi-cagrildi',
                        ad,
                        f'"{hedef}" yalnızca insanın çağırabileceği bir beceri; bunun yerine kullanıcıya /{hedef} '
                        'çalıştırmasını söyle',
                    )
                )
        for cumle in cumleler(b.govde):
            for hedef in SLASH_AD.findall(cumle):
                if hedef in beceriler and hedef != ad and not KULLANICIYA.search(cumle) and ad != yonlendirici:
                    bulgular.append(
                        Bulgu(
                            'bilgi',
                            'slash-operatif',
                            ad,
                            f'/{hedef} düz yazıda geçiyor; operatif çağrı için Beceri aracını "{hedef}" ile adlandır, '
                            'kullanıcı-çağırır ise kullanıcıya söyle',
                        )
                    )
        kapali = _ortuk_cagri_kapali(b.openai)
        if kapali is None:
            bulgular.append(Bulgu('uyari', 'openai-yok', ad, 'agents/openai.yaml yok (Codex arayüz bilgisi)'))
        elif kapali != b.kullanici_cagirir:
            bulgular.append(
                Bulgu(
                    'hata',
                    'senkron-degil',
                    ad,
                    f'disable-model-invocation={b.kullanici_cagirir} ama allow_implicit_invocation kapalı={kapali}; '
                    'beceri iki harness’te de ya kullanıcı-çağırır olmalı ya da hiçbirinde',
                )
            )
        tetikli = bool(TETIK.search(b.aciklama))
        if b.kullanici_cagirir and tetikli:
            bulgular.append(
                Bulgu('uyari', 'aciklama-kullanici', ad, 'insana yönelik açıklama tetik listesi taşımamalı')
            )
        if not b.kullanici_cagirir and not tetikli:
            bulgular.append(Bulgu('uyari', 'aciklama-model', ad, 'model-çağırır açıklama ne zaman kullanılacağını söylemiyor'))
        if ad != yonlendirici and ALT_AJAN.search(b.govde) and not TAZE_BAGLAM.search(b.tum_metin()):
            bulgular.append(Bulgu('bilgi', 'taze-baglam', ad, 'alt ajandan söz ediyor ama taze bağlam istemiyor'))
    for dongu in donguler(beceriler):
        bulgular.append(Bulgu('uyari', 'dongu', dongu[0], ' -> '.join(dongu)))
    if yonlendirici:
        bulgular += yonlendiriciyi_denetle(beceriler, yonlendirici)
    return bulgular


def yonlendiriciyi_denetle(beceriler: dict[str, Beceri], yonlendirici: str) -> list[Bulgu]:
    if yonlendirici not in beceriler:
        return [Bulgu('hata', 'yonlendirici-yok', yonlendirici, 'yönlendirici beceri bulunamadı')]
    govde = beceriler[yonlendirici].govde
    anilan = set(SLASH_AD.findall(govde))
    bulgular = []
    for ad, b in sorted(beceriler.items()):
        if b.kullanici_cagirir and ad != yonlendirici and ad not in anilan:
            bulgular.append(Bulgu('uyari', 'yonlendirici-eksik', yonlendirici, f'/{ad} yönlendiricide anılmıyor'))
    for ad in sorted(anilan - set(beceriler) - HARNESS_KOMUTLARI):
        bulgular.append(Bulgu('hata', 'yonlendirici-yalan', yonlendirici, f'/{ad} adlı beceri yok ama öneriliyor'))
    return bulgular


def tablo(beceriler: dict[str, Beceri]) -> str:
    """Kök README'deki gibi iki grup: kullanıcı-çağırır ve model-çağırır."""
    satirlar: list[str] = []
    for baslik, kullanici in (('Kullanıcı çağırır', True), ('Model çağırır', False)):
        satirlar += [f'### {baslik}', '', '| Beceri | Açıklama | Çağırdıkları |', '| --- | --- | --- |']
        for ad, b in sorted(beceriler.items()):
            if b.kullanici_cagirir == kullanici:
                cagrilar = ', '.join(b.cagrilar) or '—'
                satirlar.append(f'| {"/" if kullanici else ""}{ad} | {b.aciklama} | {cagrilar} |')
        satirlar.append('')
    return '\n'.join(satirlar).rstrip() + '\n'


def _dugum(ad: str) -> str:
    return ad.replace('-', '_')  # mermaid kimliğinde tire yerine alt çizgi; etiket gerçek adı taşır


def graf(beceriler: dict[str, Beceri]) -> str:
    """Mermaid çağrı grafiği: paralelkenar = kullanıcı çağırır, hap = model çağırır."""
    satirlar = ['flowchart LR']
    for ad, b in sorted(beceriler.items()):
        bicim = f'{_dugum(ad)}[/"/{ad}"/]' if b.kullanici_cagirir else f'{_dugum(ad)}(["{ad}"])'
        satirlar.append(f'  {bicim}')
    for ad, b in sorted(beceriler.items()):
        for hedef in b.cagrilar:
            satirlar.append(f'  {_dugum(ad)} --> {_dugum(hedef)}')
    return '\n'.join(satirlar)


def ana(argv: list[str] | None = None) -> int:
    ayr = argparse.ArgumentParser(prog='bilesim')
    alt = ayr.add_subparsers(dest='komut', required=True)
    p = alt.add_parser('denetle')
    p.add_argument('kokler', nargs='+')
    p.add_argument('--yonlendirici')
    for komut in ('tablo', 'graf'):
        alt.add_parser(komut).add_argument('kokler', nargs='+')
    arg = ayr.parse_args(argv)
    beceriler, bulgular = yukle(*arg.kokler)
    if arg.komut == 'tablo':
        print(tablo(beceriler))
        return 0
    if arg.komut == 'graf':
        print(graf(beceriler))
        return 0
    bulgular += denetle(beceriler, arg.yonlendirici)
    for bulgu in bulgular:
        print(bulgu)
    hata = sum(1 for b in bulgular if b.duzey == 'hata')
    print(f'{len(beceriler)} beceri, {len(bulgular)} bulgu, {hata} hata')
    return 1 if hata else 0


if __name__ == '__main__':
    sys.exit(ana())
