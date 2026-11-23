"""Kural testleri (STANDARTLAR.md §7): temelin kendi kurallarını korur.

Her iletinin sonunda ne yapılacağı yazar. Bir kural testi kırmızıysa testi gevşetmeyin; kodu düzeltin.
"""

import ast
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
PAKET = KOK / "ses"
KAYNAKLAR = sorted(p for d in ("ses", "scripts") for p in (KOK / d).rglob("*.py"))
PAKET_KAYNAKLARI = [p for p in KAYNAKLAR if p.is_relative_to(PAKET)]
TUM_PY = [*KAYNAKLAR, *sorted((KOK / "tests").rglob("*.py"))]
AZAMI_SATIR = 400  # yumuşak sınır 300 (STANDARTLAR §6); bu sert sınırdır
KOPYALAR = {"sayi_yazi.py"}  # başka temelden birebir kopya: kaynağında düzeltilir


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
        f"Yasaklı harf dönüşümü: {ihlaller}. Türkçe metin için ses.metin.kucuk_tr/buyuk_tr, "
        "protokol sözcükleri (uzantı, başlık) için kucuk_ascii kullanın."
    )


def test_her_dosyanin_baslik_yorumu_var():
    eksik = [_goreli(p) for p in TUM_PY if not ast.get_docstring(_agac(p))]
    assert not eksik, f"Başlık yorumu yok: {eksik}. 3–10 satırlık Türkçe başlık yazın."
    genisletmesiz = [
        _goreli(p)
        for p in PAKET_KAYNAKLARI
        if p.name != "__main__.py" and "Genişletme" not in (ast.get_docstring(_agac(p)) or "")
    ]
    assert not genisletmesiz, (
        f"Başlıkta 'Genişletme:' yok: {genisletmesiz}. Nasıl genişletileceğini yazın."
    )


def test_kopyalarin_kaynagi_yazili():
    for yol in PAKET_KAYNAKLARI:
        if yol.name in KOPYALAR:
            assert "Kaynak: havuz/" in (ast.get_docstring(_agac(yol)) or ""), (
                f"{_goreli(yol)}: kopya dosyanın başlığına 'Kaynak: havuz/...' yazın (STANDARTLAR §2)."
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
    assert not ihlaller, f"eval/exec/compile kullanımı: {ihlaller}. Kaldırın."


def test_alt_surec_kabuksuz():
    """subprocess yalnız liste argümanla (shell=True yok): dosya adı kabuk komutu olamasın."""
    ihlaller = []
    for yol in KAYNAKLAR:
        for d in ast.walk(_agac(yol)):
            if isinstance(d, ast.keyword) and d.arg == "shell":
                ihlaller.append(f"{_goreli(yol)}:{d.value.lineno}")
    assert not ihlaller, f"shell= kullanımı: {ihlaller}. Komutu liste olarak verin."


def test_dosya_uzunlugu():
    uzun = [
        f"{_goreli(p)} ({n})"
        for p in TUM_PY
        if (n := len(p.read_text(encoding="utf-8").splitlines())) > AZAMI_SATIR
    ]
    assert not uzun, f"{AZAMI_SATIR} satırı aşan dosya: {uzun}. Dosyayı tek işlik parçalara bölün."


def test_yarim_is_yok():
    ihlaller = []
    for p in TUM_PY:
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


def _gorunmez_mi(harf: str) -> bool:
    kategori = unicodedata.category(harf)
    if kategori in ("Cf", "Zl", "Zp") or (kategori == "Zs" and harf != " "):
        return True
    return kategori == "Cc" and harf not in "\t\n\r"


def test_kaynakta_gorunmez_karakter_yok():
    """STANDARTLAR §6.11: sıfır genişlikli boşluk, BOM, bölünmez boşluk… kaçış dizisiyle yazılır."""
    dosyalar = [*TUM_PY, *(PAKET / "web").glob("*.*")]
    ihlaller = [
        f"{_goreli(p)}:{satir_no}"
        for p in dosyalar
        for satir_no, satir in enumerate(p.read_text(encoding="utf-8").splitlines(), start=1)
        if any(_gorunmez_mi(h) for h in satir)
    ]
    assert not ihlaller, (
        f"Görünmez karakter: {ihlaller}. Düzeltin: python havuz/araclar/kacis.py havuz/ses"
    )


def test_her_modul_temiz_durumdan_ice_aktarilir():
    """Döngüsel içe aktarma koruması: her modül, başka hiçbir ses modülü yüklü değilken içe aktarılır."""
    betik = (
        "import importlib, pkgutil, sys\n"
        "import ses\n"
        "adlar = sorted(m.name for m in pkgutil.walk_packages(ses.__path__, 'ses.') if m.name != 'ses.__main__')\n"
        "hatalar = []\n"
        "for ad in adlar:\n"
        "    for k in [k for k in sys.modules if k == 'ses' or k.startswith('ses.')]:\n"
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
    assert sonuc.returncode == 0 and int(satirlar[0]) > 30, sonuc.stderr[-2000:]
    assert satirlar[1:] == [], (
        f"Döngüsel/bozuk içe aktarma: {satirlar[1:]}. Tanımlandığı modülden içe aktarın."
    )


def test_belgeler_ve_agents_bolumleri():
    for yol in (KOK / "docs").glob("*.md"):
        assert yol.name.isascii() and yol.stem.isupper(), (
            f"{yol.name}: belge adları büyük harf ve ASCII olmalı"
        )
    for gerekli in ("KARARLAR", "MIMARI", "LISANSLAR", "GERCEK_MODEL_DENEMESI", "AYARLAR"):
        assert (KOK / "docs" / f"{gerekli}.md").is_file(), f"docs/{gerekli}.md yok"
    agents = (KOK / "AGENTS.md").read_text(encoding="utf-8")
    for bolum in ("## Bu temel ne yapar", "## Komutlar", "## Harita", "## Değişmez kurallar", "## Tarifler",
                  "## Sık yapılan hatalar", "## Bitti tanımı"):  # fmt: skip
        assert bolum in agents, f"AGENTS.md'de '{bolum}' bölümü yok (STANDARTLAR §13)"
    assert "## Sınırlar" in (KOK / "README.md").read_text(encoding="utf-8"), (
        "README'de 'Sınırlar' zorunlu"
    )


def test_havuz_json():
    veri = json.loads((KOK / "havuz.json").read_text(encoding="utf-8"))
    for alan in ("ad", "baslik", "ozet", "tur", "gereksinim", "python", "denetle", "baslat", "yerTutucular",
                 "kopyalamaHaric"):  # fmt: skip
        assert alan in veri, f"havuz.json'da '{alan}' yok (STANDARTLAR §4)"
    assert veri["ad"] == "ses" and veri["tur"] == "python" and veri["python"]["ekstra"] == "dev"
    assert "modeller" in veri["kopyalamaHaric"], "indirilen modeller yeni projeye kopyalanmamalı"


def test_modeller_depoya_girmez():
    yoksay = (KOK / ".gitignore").read_text(encoding="utf-8")
    for desen in ("modeller/", "*.onnx", "*.bin", ".venv/"):
        assert desen in yoksay, f".gitignore'da '{desen}' yok: indirilen model depoya girmemeli"


def test_arayuz_sozlugu_eksiksiz():
    sozluk = json.loads((PAKET / "web" / "sozluk.json").read_text(encoding="utf-8"))
    html = (PAKET / "web" / "tarayici.html").read_text(encoding="utf-8")
    kullanilan = set(re.findall(r'data-t="([a-z_]+)"', html)) | set(
        re.findall(r"\bt\('([a-z_]+)'\)", html)
    )
    kullanilan |= set(re.findall(r"'(sonuc_[a-z]+)'", html))
    eksik = sorted(kullanilan - sozluk.keys())
    assert not eksik, f"sozluk.json'da olmayan anahtar: {eksik}. ses/web/sozluk.json'a ekleyin."
    assert all(isinstance(v, str) and v.strip() for v in sozluk.values()), (
        "sozluk.json'da boş metin var"
    )
