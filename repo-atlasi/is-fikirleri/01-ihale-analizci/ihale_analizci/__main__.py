"""Komut satırı: python3 -m ihale_analizci GIRDI_KLASORU -o CIKTI [--ollama-url URL --model MODEL]"""

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from .bolum import Bolum, birimlere_ayir, bolumlere_ayir, satirlari_normallestir
from .cikaricilar import Bulgu, eksik_kontroller, kurallari_uygula, tekillestir
from .donustur import EN_BUYUK_BAYT, DonusturmeHatasi, boyut_denetle, donusturucu_sec
from .llm import VARSAYILAN_MODEL, LLMHatasi, OllamaIstemci, llm_ile_cikar
from .rapor import kontrol_listesi_csv, kontrol_listesi_md

# yaz()'ın cikti/markdown altına ürettiği kopyaların listesi. Sonraki çalıştırma yalnızca bu listedeki
# dosyaları siler; klasördeki başka dosyalara dokunulmaz.
URETILENLER = ".uretilen-dosyalar.json"


@dataclass
class Analiz:
    belgeler: list[str] = field(default_factory=list)
    bulgular: list[Bulgu] = field(default_factory=list)
    eksikler: list[tuple[str, str]] = field(default_factory=list)
    notlar: list[str] = field(default_factory=list)
    markdownlar: dict[str, str] = field(default_factory=dict)


def _girdi_dosyalari(klasor: Path, analiz: Analiz, uzantilar: set[str]) -> list[Path]:
    """Klasörün üst düzeyindeki işlenecek dosyalar; atlananlar not olarak düşer."""
    dosyalar = []
    for yol in sorted(klasor.iterdir()):
        if yol.name.startswith("."):
            continue  # gizli dosya (.DS_Store vb.)
        if yol.is_symlink():
            analiz.notlar.append(f"Atlandı (sembolik bağlantı izlenmez): {yol.name}")
        elif yol.is_dir():
            analiz.notlar.append(f"Atlandı (alt klasörler taranmaz): {yol.name}/")
        elif not yol.is_file():
            continue
        elif yol.name.startswith("~$"):
            analiz.notlar.append(f"Atlandı (Office kilit dosyası): {yol.name}")
        elif yol.suffix.lower() not in uzantilar:
            analiz.notlar.append(f"Atlandı (desteklenmeyen biçim): {yol.name}")
        else:
            dosyalar.append(yol)
    return dosyalar


def analiz_et(
    klasor: Path, donusturucu, istemci: OllamaIstemci | None = None, en_buyuk_bayt: int = EN_BUYUK_BAYT
) -> Analiz:
    analiz, bolumler = Analiz(), []
    for yol in _girdi_dosyalari(klasor, analiz, donusturucu.uzantilar):
        try:
            boyut_denetle(yol, en_buyuk_bayt)
            markdown = satirlari_normallestir(donusturucu.markdown(yol))
        except DonusturmeHatasi as hata:
            analiz.notlar.append(f"Dönüştürülemedi: {hata}")
            continue
        if len(markdown.strip()) < 50:
            analiz.notlar.append(f"{yol.name}: neredeyse hiç metin çıkmadı; taranmış belge olabilir, önce OCR gerekir.")
        analiz.belgeler.append(yol.name)
        analiz.markdownlar[yol.name] = markdown
        bolumler += bolumlere_ayir(yol.name, markdown)

    if not analiz.belgeler:
        # Belge yokken "kesin teminat bulunamadı" demek yanıltıcı olur: eksik kontrol listesi üretilmez.
        analiz.notlar.append("Hiçbir belge işlenemedi; kontrol listesi üretilmedi.")
        return analiz
    birimler = [b for bolum in bolumler for b in birimlere_ayir(bolum)]
    bulgular = kurallari_uygula(birimler)
    analiz.notlar.append(f"Dönüştürücü: {donusturucu.ad}; {len(bolumler)} bölüm, {len(birimler)} birim tarandı.")
    if istemci is not None:
        bulgular += _llm_bulgulari(bolumler, istemci, bulgular, analiz.notlar)

    sira = {ad: i for i, ad in enumerate(analiz.belgeler)}
    analiz.bulgular = sorted(bulgular, key=lambda b: (sira[b.birim.dosya], b.birim.satir))
    analiz.eksikler = eksik_kontroller(analiz.bulgular)
    return analiz


def _llm_bulgulari(bolumler: list[Bolum], istemci: OllamaIstemci, mevcut: list[Bulgu], notlar: list[str]) -> list[Bulgu]:
    try:
        istemci.dogrula()
        sonuc = llm_ile_cikar(bolumler, istemci)
    except LLMHatasi as hata:
        notlar.append(f"Yerel LLM kullanılamadı, yalnızca kurallar uygulandı: {hata}")
        return []
    if (uzak := getattr(istemci, "uzak_sunucu", lambda: None)()) is not None:
        notlar.append(f"Dikkat: belge metni yerel ağ dışındaki {uzak} sunucusuna gönderildi (--uzak-ollama).")
    # Kuralın zaten yakaladığı cümleyi tekrar etme; LLM yalnızca kuralın kaçırdığını eklesin.
    gorulen = {(b.kategori, b.birim.metin) for b in mevcut}
    yeni = tekillestir([b for b in sonuc.bulgular if (b.kategori, b.birim.metin) not in gorulen])
    notlar.append(
        f"Yerel LLM ({istemci.model}): {sonuc.parca} parça soruldu, {len(yeni)} yeni madde; kaynağı doğrulanamayan "
        f"{sonuc.atilan} madde atıldı; {sonuc.bozuk_yanit} parçanın yanıtı bozuktu."
    )
    return yeni


def _eski_kopyalari_sil(md_klasoru: Path) -> None:
    """Önceki çalıştırmanın ürettiği Markdown kopyalarını siler (yalnızca listede kayıtlı .md dosyaları)."""
    liste = md_klasoru / URETILENLER
    if not liste.is_file():
        return
    try:
        adlar = json.loads(liste.read_text(encoding="utf-8"))
    except ValueError:
        adlar = []
    for ad in adlar if isinstance(adlar, list) else []:
        hedef = md_klasoru / str(ad)
        # Klasör dışına çıkan ("../x.md") ya da .md olmayan ad silinmez.
        if Path(str(ad)).name == ad and hedef.suffix == ".md" and hedef.is_file() and not hedef.is_symlink():
            hedef.unlink()
    liste.unlink()


def yaz(analiz: Analiz, cikti: Path, markdown_yaz: bool = True) -> list[Path]:
    cikti.mkdir(parents=True, exist_ok=True)
    md_klasoru = cikti / "markdown"
    if md_klasoru.is_dir():
        _eski_kopyalari_sil(md_klasoru)
    if markdown_yaz and analiz.markdownlar:
        md_klasoru.mkdir(exist_ok=True)
        adlar = []
        for ad, markdown in analiz.markdownlar.items():
            (md_klasoru / f"{ad}.md").write_text(markdown, encoding="utf-8", newline="\n")
            adlar.append(f"{ad}.md")
        (md_klasoru / URETILENLER).write_text(json.dumps(adlar, ensure_ascii=False), encoding="utf-8")
    md_yolu, csv_yolu = cikti / "kontrol-listesi.md", cikti / "kontrol-listesi.csv"
    md_yolu.write_text(kontrol_listesi_md(analiz.bulgular, analiz.eksikler, analiz.belgeler, analiz.notlar), encoding="utf-8")
    kontrol_listesi_csv(analiz.bulgular, analiz.eksikler, csv_yolu)
    return [md_yolu, csv_yolu]


def _hata(mesaj: str, kod: int) -> int:
    print(mesaj, file=sys.stderr)
    return kod


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ihale_analizci", description="İhale şartnamesinden uyum kontrol listesi çıkarır.")
    p.add_argument("girdi", type=Path, help="şartname dosyalarının bulunduğu klasör")
    p.add_argument("-o", "--cikti", type=Path, default=Path("cikti"))
    p.add_argument("--donusturucu", choices=["otomatik", "markitdown", "yerel"], default="otomatik")
    p.add_argument("--markdown-yazma", action="store_true", help="dönüştürülmüş tam metin kopyalarını cikti/markdown altına yazma")
    p.add_argument("--en-buyuk-mb", type=int, default=EN_BUYUK_BAYT // (1024 * 1024), help="tek belge için üst sınır (MB)")
    p.add_argument("--ollama-url", help="yerel Ollama adresi, ör. http://127.0.0.1:11434 (verilmezse LLM kullanılmaz)")
    p.add_argument("--model", default=VARSAYILAN_MODEL)
    p.add_argument("--num-ctx", type=int, default=8192, help="Ollama bağlam uzunluğu (options.num_ctx)")
    p.add_argument("--uzak-ollama", action="store_true", help="yerel ağ dışındaki Ollama sunucusuna izin ver (belge oraya gider)")
    a = p.parse_args(argv)

    if not a.girdi.is_dir():
        return _hata(f"Klasör bulunamadı: {a.girdi}", 2)
    if a.cikti.resolve() == a.girdi.resolve():
        return _hata("Çıktı klasörü girdi klasörüyle aynı olamaz (rapor bir sonraki çalıştırmada belge sanılır).", 2)
    if a.en_buyuk_mb < 1 or a.num_ctx < 2048:
        return _hata("--en-buyuk-mb en az 1, --num-ctx en az 2048 olmalı.", 2)
    try:
        donusturucu = donusturucu_sec(a.donusturucu)
    except ImportError:
        return _hata("markitdown kurulu değil: pip install -r requirements.txt (ya da --donusturucu yerel).", 2)
    istemci = None
    if a.ollama_url:
        try:
            istemci = OllamaIstemci(a.ollama_url, a.model, baglam=a.num_ctx, uzak_izni=a.uzak_ollama)
        except LLMHatasi as hata:
            return _hata(str(hata), 2)
    analiz = analiz_et(a.girdi, donusturucu, istemci, a.en_buyuk_mb * 1024 * 1024)
    if not analiz.belgeler:
        return _hata("\n".join(analiz.notlar), 3)
    for yol in yaz(analiz, a.cikti, markdown_yaz=not a.markdown_yazma):
        print(f"Yazıldı: {yol}")
    print(f"{len(analiz.bulgular)} madde, {len(analiz.eksikler)} bulunamayan kontrol.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
