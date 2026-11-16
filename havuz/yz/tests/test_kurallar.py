"""Kural testleri (STANDARTLAR.md §7): temelin kendi kurallarını korur.

Her iletinin sonunda ne yapılacağı yazar. Bir kural testi kırmızıysa testi gevşetmeyin; kodu düzeltin.
"""

import ast
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

KOK = Path(__file__).resolve().parent.parent
PAKET = KOK / "yz"
KAYNAKLAR = sorted(
    p for d in ("yz", "scripts", "araclar", "ornekler") for p in (KOK / d).rglob("*.py")
)
PAKET_KAYNAKLARI = [p for p in KAYNAKLAR if p.is_relative_to(PAKET)]
AZAMI_SATIR = 400  # yumuşak sınır 300 (STANDARTLAR §6); bu sert sınırdır


def _goreli(yol: Path) -> str:
    return str(yol.relative_to(KOK))


def _agac(yol: Path) -> ast.Module:
    return ast.parse(yol.read_text(encoding="utf-8"), filename=str(yol))


def test_turkce_harf_donusumu_yalniz_metin_modulunde():
    """`str.lower()/upper()/casefold()` Türkçe'de yanlıştır (I→i, i→I)."""
    ihlaller = []
    for yol in PAKET_KAYNAKLARI:
        if yol.name == "metin.py":
            continue
        for dugum in ast.walk(_agac(yol)):
            if isinstance(dugum, ast.Attribute) and dugum.attr in {"lower", "upper", "casefold"}:
                ihlaller.append(f"{_goreli(yol)}:{dugum.lineno}")
    assert not ihlaller, (
        f"Yasaklı harf dönüşümü: {ihlaller}. Türkçe metin için yz.metin.kucuk_tr/buyuk_tr, protokol "
        "sözcükleri için kucuk_ascii/buyuk_ascii kullanın."
    )


def test_her_dosyanin_baslik_yorumu_var():
    eksik = [_goreli(p) for p in KAYNAKLAR if not ast.get_docstring(_agac(p))]
    assert not eksik, (
        f"Başlık yorumu (modül belge dizgisi) yok: {eksik}. 3–10 satırlık Türkçe başlık yazın."
    )
    genisletmesiz = [
        _goreli(p)
        for p in PAKET_KAYNAKLARI
        if p.name != "__main__.py" and "Genişletme" not in (ast.get_docstring(_agac(p)) or "")
    ]
    assert not genisletmesiz, (
        f"Başlıkta 'Genişletme:' satırı yok: {genisletmesiz}. Nasıl genişletileceğini yazın."
    )


def test_eval_exec_yok():
    ihlaller = [
        f"{_goreli(p)}:{d.lineno}"
        for p in KAYNAKLAR
        for d in ast.walk(_agac(p))
        if isinstance(d, ast.Call)
        and isinstance(d.func, ast.Name)
        and d.func.id in {"eval", "exec", "compile"}
    ]
    assert not ihlaller, (
        f"eval/exec/compile kullanımı: {ihlaller}. Hesap için yz.arac.hazir.hesap'taki AST yolunu kullanın."
    )


def test_dosya_uzunlugu():
    uzun = [
        f"{_goreli(p)} ({n})"
        for p in KAYNAKLAR
        if (n := len(p.read_text(encoding="utf-8").splitlines())) > AZAMI_SATIR
    ]
    assert not uzun, f"{AZAMI_SATIR} satırı aşan dosya: {uzun}. Dosyayı tek işlik parçalara bölün."


def test_yarim_is_yok():
    ihlaller = []
    for p in [*KAYNAKLAR, *sorted((KOK / "tests").rglob("*.py"))]:
        metin = p.read_text(encoding="utf-8")
        if p.name != "test_kurallar.py" and re.search(r"\b(TODO|FIXME|XXX)\b", metin):
            ihlaller.append(f"{_goreli(p)}: TODO/FIXME")
        for d in ast.walk(_agac(p)):
            if isinstance(d, ast.FunctionDef | ast.AsyncFunctionDef):
                govde = [
                    g
                    for g in d.body
                    if not (isinstance(g, ast.Expr) and isinstance(g.value, ast.Constant))
                ]
                if len(govde) == 1 and isinstance(govde[0], ast.Pass):
                    ihlaller.append(f"{_goreli(p)}:{d.lineno} boş gövde ({d.name})")
    assert not ihlaller, (
        f"Yarım iş: {ihlaller}. Ya tamamlayın ya da kaldırıp README 'Sınırlar'a yazın."
    )


def test_arayuz_sozlugu_eksiksiz():
    sozluk = json.loads((PAKET / "web" / "sozluk.json").read_text(encoding="utf-8"))
    kullanilan: set[str] = set()
    for sayfa in ("index.html", "kayit.html"):
        html = (PAKET / "web" / sayfa).read_text(encoding="utf-8")
        kullanilan |= set(re.findall(r'data-t(?:-ph|-aria|-title)?="([a-z_]+)"', html))
        assert not re.search(r'aria-label="[^"]*[a-zçğıöşü]', html), (
            f"{sayfa}: aria-label metnini data-t-aria ile sözlükten verin"
        )
        kullanilan |= set(re.findall(r"\bt\(\s*\"([a-z_]+)\"", html))
    eksik = sorted(kullanilan - sozluk.keys())
    assert not eksik, f"sozluk.json'da olmayan anahtar: {eksik}. yz/web/sozluk.json'a ekleyin."
    assert all(isinstance(v, str) and v.strip() for v in sozluk.values()), (
        "sozluk.json'da boş metin var."
    )


def test_her_modul_temiz_durumdan_ice_aktarilir():
    """Döngüsel içe aktarma koruması: her modül, başka hiçbir yz modülü yüklü değilken içe aktarılır."""
    betik = (
        "import importlib, pkgutil, sys\n"
        "import yz\n"
        "adlar = sorted(m.name for m in pkgutil.walk_packages(yz.__path__, 'yz.') if m.name != 'yz.__main__')\n"
        "hatalar = []\n"
        "for ad in adlar:\n"
        "    for k in [k for k in sys.modules if k == 'yz' or k.startswith('yz.')]:\n"
        "        del sys.modules[k]\n"
        "    try:\n"
        "        importlib.import_module(ad)\n"
        "    except ImportError as e:\n"
        "        hatalar.append(f'{ad}: {e}')\n"
        "print(len(adlar)); print('\\n'.join(hatalar))\n"
    )
    sonuc = subprocess.run(
        [sys.executable, "-c", betik], cwd=KOK, capture_output=True, text=True, timeout=120
    )
    satirlar = sonuc.stdout.strip().splitlines()
    assert sonuc.returncode == 0 and int(satirlar[0]) > 50, sonuc.stderr[-2000:]
    assert satirlar[1:] == [], (
        f"Döngüsel/bozuk içe aktarma: {satirlar[1:]}. Paket İÇİNDEN tanımlandığı modülden içe aktarın "
        "(ör. from yz.rag.gomme import KarmaGomme), paket __init__'inden değil."
    )


def test_belge_adlari_ve_agents_bolumleri():
    for yol in (KOK / "docs").glob("*.md"):
        assert yol.name.isascii() and yol.stem.isupper(), (
            f"{yol.name}: belge adları büyük harf ve ASCII olmalı"
        )
    agents = (KOK / "AGENTS.md").read_text(encoding="utf-8")
    for bolum in ("## Bu temel ne yapar", "## Komutlar", "## Harita", "## Değişmez kurallar", "## Tarifler",
                  "## Sık yapılan hatalar", "## Bitti tanımı"):  # fmt: skip
        assert bolum in agents, f"AGENTS.md'de '{bolum}' bölümü yok (STANDARTLAR §13)"
    assert "## Sınırlar" in (KOK / "README.md").read_text(encoding="utf-8"), (
        "README'de 'Sınırlar' bölümü zorunlu"
    )


def test_havuz_json():
    veri = json.loads((KOK / "havuz.json").read_text(encoding="utf-8"))
    for alan in (
        "ad",
        "baslik",
        "ozet",
        "tur",
        "gereksinim",
        "python",
        "denetle",
        "baslat",
        "yerTutucular",
        "kopyalamaHaric",
    ):
        assert alan in veri, f"havuz.json'da '{alan}' yok (STANDARTLAR §4)"
    assert veri["ad"] == "yz" and veri["tur"] == "python" and veri["python"]["ekstra"]


@pytest.mark.parametrize("yol", ["yz.ornek.yaml", ".env.example"])
def test_ornek_ayar_dosyalari_sir_icermez(yol):
    metin = (KOK / yol).read_text(encoding="utf-8")
    assert not re.search(
        r"(sk-[A-Za-z0-9]{10,}|hf_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,})", metin
    ), f"{yol}: gerçek anahtar yazmayın"


def test_ornek_ayar_dosyasi_gecerli():
    from yz.ayar import ayarlari_yukle

    ayarlar = ayarlari_yukle(KOK / "yz.ornek.yaml", ortam={})
    assert ayarlar.saglayicilar and ayarlar.varsayilan in ayarlar.saglayicilar
