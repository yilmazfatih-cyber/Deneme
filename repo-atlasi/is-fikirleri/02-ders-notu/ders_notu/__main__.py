"""Komut satırı: python3 -m ders_notu KAYNAK [-o CIKTI] [--izinli-alan ALAN] [--ollama-url URL] [--asr]

KAYNAK: yerel .vtt/.srt, altyazısı yanında duran yerel video/ses dosyası ya da müşterinin kendi
sitesindeki ders sayfasının adresi (yalnızca --izinli-alan ile verilen alan adlarında).
"""

import argparse
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from .altyazi import ayristir, metni_coz
from .asr import ses_cikar, whisper_ile_yaz
from .cikti import anki_csv, atomik_yaz, not_md, transkript_md
from .kaynak import GUVENLI_DIL, KaynakHatasi, gizle, url_mi, yerel_kaynak, ytdlp_ile_indir
from .llm import LLMHatasi, OllamaIstemci
from .ozet import DersNotu, ders_notu_olustur

AZAMI_ALTYAZI = 50 * 1024 * 1024  # bayt; üç saatlik dersin altyazısı bile birkaç MB'yi geçmez


def calistir(
    kaynak_adresi: str,
    cikti: Path,
    diller: list[str],
    izinli: list[str],
    istemci=None,
    asr: bool = False,
    whisper_model: str = "openai/whisper-small",
    deste: str = "Ders notları",
    ydl_sinifi=None,
    boru=None,
    bekleme_sn: float = 1.0,
    *,
    azami_mb: int = 2048,
    yerel_aga_izin: bool = False,
    ara_dosyalari_sakla: bool = False,
    yalniz_yerel_model: bool = False,
    simdi: datetime | None = None,
) -> DersNotu:
    """Kaynaktan not, transkript ve Anki dosyasını üretir.

    İndirilen medya/altyazı ve WAV, çıktı klasöründeki geçici bir klasörde tutulur ve iş bitince (hata olsa da)
    silinir. ara_dosyalari_sakla=True ise cikti/ara/ altında kalır.
    """
    cikti.mkdir(parents=True, exist_ok=True)
    ayar = dict(diller=diller, izinli=izinli, istemci=istemci, asr=asr, whisper_model=whisper_model, deste=deste)
    ayar.update(ydl_sinifi=ydl_sinifi, boru=boru, bekleme_sn=bekleme_sn, azami_mb=azami_mb)
    ayar.update(yerel_aga_izin=yerel_aga_izin, yalniz_yerel_model=yalniz_yerel_model, simdi=simdi)
    if ara_dosyalari_sakla:
        (cikti / "ara").mkdir(exist_ok=True)
        return _isle(kaynak_adresi, cikti, cikti / "ara", **ayar)
    with tempfile.TemporaryDirectory(prefix=".ders-notu-", dir=cikti) as gecici:
        return _isle(kaynak_adresi, cikti, Path(gecici), **ayar)


def _isle(
    kaynak_adresi: str,
    cikti: Path,
    calisma: Path,
    *,
    diller: list[str],
    izinli: list[str],
    istemci,
    asr: bool,
    whisper_model: str,
    deste: str,
    ydl_sinifi,
    boru,
    bekleme_sn: float,
    azami_mb: int,
    yerel_aga_izin: bool,
    yalniz_yerel_model: bool,
    simdi: datetime | None,
) -> DersNotu:
    if url_mi(kaynak_adresi):
        hedef, azami_bayt = calisma / "indirilen", int(azami_mb) * 1024 * 1024
        url = kaynak_adresi.strip()
        kaynak = ytdlp_ile_indir(url, hedef, diller, izinli, ydl_sinifi, bekleme_sn, azami_bayt, yerel_aga_izin)
    else:
        kaynak = yerel_kaynak(Path(kaynak_adresi), diller)

    uyarilar = list(kaynak.uyarilar)
    if kaynak.altyazi:
        if kaynak.altyazi.stat().st_size > AZAMI_ALTYAZI:
            raise KaynakHatasi("Altyazı dosyası 50 MB'den büyük; altyazı dosyası olduğu sanılmıyor.")
        metin, uyari = metni_coz(kaynak.altyazi.read_bytes())
        uyarilar += [uyari] if uyari else []
        parcalar = ayristir(metin, uyarilar)
    elif asr and kaynak.medya:
        wav = ses_cikar(kaynak.medya, calisma)
        parcalar = whisper_ile_yaz(wav, whisper_model, boru=boru, yalniz_yerel=yalniz_yerel_model)
    else:
        raise KaynakHatasi("Altyazı bulunamadı. Konuşmayı yazıya dökmek için --asr kullanın (transformers gerekir).")
    if not parcalar:
        raise KaynakHatasi("Altyazıda ya da kayıtta metin bulunamadı.")

    not_ = ders_notu_olustur(kaynak.baslik, parcalar, istemci)
    not_.uyarilar[:0] = uyarilar
    atomik_yaz(cikti / "transkript.md", transkript_md(parcalar, kaynak.baslik))
    atomik_yaz(cikti / "ders-notu.md", not_md(not_, kaynak.adres, simdi))
    anki_csv(not_, cikti / "anki-kartlari.csv", deste)
    return not_


def _pozitif(deger: str) -> int:
    sayi = int(deger)
    if sayi <= 0:
        raise argparse.ArgumentTypeError("pozitif bir tam sayı olmalı")
    return sayi


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ders_notu", description="Ders videosundan not, soru ve Anki kartı üretir.")
    p.add_argument("kaynak", help="yerel .vtt/.srt/video dosyası ya da izinli alan adındaki ders sayfası")
    p.add_argument("-o", "--cikti", type=Path, default=Path("cikti"))
    p.add_argument("--dil", action="append", default=None, help="altyazı dili (birden çok verilebilir; varsayılan tr)")
    p.add_argument("--izinli-alan", action="append", default=[], help="size ait/lisanslı alan adı, ör. kursum.com")
    p.add_argument("--yerel-aga-izin", action="store_true", help="127.0.0.1, 10.x gibi yerel ağ adreslerine izin ver")
    p.add_argument("--azami-boyut-mb", type=_pozitif, default=2048, help="indirilecek dosya için üst sınır (MB)")
    p.add_argument("--ara-dosyalari-sakla", action="store_true", help="indirilen dosyaları ve WAV'ı cikti/ara'da tut")
    p.add_argument("--ollama-url", help="yerel Ollama adresi; verilmezse çıkarımsal (LLM'siz) özet")
    p.add_argument("--model", default="qwen2.5:7b")
    p.add_argument("--bulut-modeline-izin", action="store_true", help="bulut modeline gönderime izin ver (KVKK md. 9)")
    p.add_argument("--uzak-ollama", action="store_true", help="yerel ağ dışındaki Ollama sunucusuna gönderime izin ver")
    p.add_argument("--asr", action="store_true", help="altyazı yoksa Whisper ile yazıya dök")
    p.add_argument("--whisper-model", default="openai/whisper-small", help="model adı ya da yerel model klasörü")
    p.add_argument("--yalniz-yerel-model", action="store_true", help="Whisper modelini indirme, yerelden yükle")
    p.add_argument("--deste", default="Ders notları", help="Anki deste adı")
    a = p.parse_args(argv)

    diller = a.dil or ["tr"]
    if gecersiz := [d for d in diller if not GUVENLI_DIL.fullmatch(d)]:
        print(f"Hata: geçersiz dil kodu: {', '.join(gecersiz)} (ör. tr, tr-TR)", file=sys.stderr)
        return 2
    secenek = dict(azami_mb=a.azami_boyut_mb, yerel_aga_izin=a.yerel_aga_izin)
    secenek.update(ara_dosyalari_sakla=a.ara_dosyalari_sakla, yalniz_yerel_model=a.yalniz_yerel_model)
    try:
        izin = dict(bulut_izni=a.bulut_modeline_izin, uzak_izni=a.uzak_ollama)
        istemci = OllamaIstemci(a.ollama_url, a.model, **izin) if a.ollama_url else None
        not_ = calistir(a.kaynak, a.cikti, diller, a.izinli_alan, istemci, a.asr, a.whisper_model, a.deste, **secenek)
    except (KaynakHatasi, LLMHatasi) as hata:
        print(f"Hata: {gizle(str(hata))}", file=sys.stderr)
        return 2
    except OSError as hata:
        print(f"Hata: dosya okunamadı ya da yazılamadı: {hata}", file=sys.stderr)
        return 2
    print(f"Yazıldı: {a.cikti / 'ders-notu.md'}, anki-kartlari.csv, transkript.md")
    print(f"{len(not_.kavramlar)} kavram, {len(not_.sorular)} soru ({not_.yontem}).")
    for uyari in not_.uyarilar:
        print(f"Uyarı: {uyari}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
