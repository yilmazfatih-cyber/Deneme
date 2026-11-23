"""Komut satırı: `python -m ses <komut>` — yardım ve hata iletileri Türkçedir.

Komutlar: yaziya, altyazi, seslendir, normallestir, degerlendir, modeller, indir, sun, bilgi, hazirla.
Hatalar: paketin kendi hataları (SesHatasi) kısa Türkçe iletiyle ve 2 çıkış koduyla biter; beklenmeyen
hatalarda tam iz gösterilir (bir modele yapıştırılabilsin diye). Kaynak: havuz/yz/yz/cli.py (Türkçe
ayrıştırıcı kopyalandı). Kim kullanır: `python -m ses`, `ses` betiği (pyproject [project.scripts]).
Genişletme: yeni komut → komutlar.py'de `komut_xxx`, aşağıda `ekle(...)`, tests/test_cli.py'de test.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any, NoReturn

from ses import komutlar
from ses.hatalar import SesHatasi


class _TurkceBicim(argparse.RawDescriptionHelpFormatter):
    def add_usage(self, usage: str | None, actions: Any, groups: Any, prefix: str | None = None) -> None:
        super().add_usage(usage, actions, groups, "Kullanım: " if prefix is None else prefix)


_CEVIRI = (
    ("the following arguments are required", "şu argümanlar gerekli"),
    ("unrecognized arguments", "tanınmayan argümanlar"),
    ("invalid choice", "geçersiz seçim"),
    ("choose from", "seçenekler"),
    ("expected one argument", "bir değer bekleniyor"),
    ("invalid float value", "geçersiz sayı"),
    ("invalid int value", "geçersiz tam sayı"),
    ("not allowed with argument", "şu argümanla birlikte kullanılamaz:"),
    ("argument", "argüman"),
)


class _TurkceAyristirici(argparse.ArgumentParser):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("formatter_class", _TurkceBicim)
        kwargs["add_help"] = False
        super().__init__(*args, **kwargs)
        self._optionals.title = "seçenekler"
        self._positionals.title = "argümanlar"
        self.add_argument("-h", "--yardim", action="help", help="bu yardımı göster ve çık")

    def error(self, message: str) -> NoReturn:
        for ingilizce, turkce in _CEVIRI:
            message = message.replace(ingilizce, turkce)
        self.print_usage(sys.stderr)
        self.exit(2, f"{self.prog}: hata: {message}\n(yardım için: {self.prog} --yardim)\n")


def _stt_secenekleri(p: argparse.ArgumentParser) -> None:
    p.add_argument("dosya", help="ses dosyası (wav; ffmpeg varsa mp3, ogg, m4a, flac, webm)")
    p.add_argument("--model", help="tiny, base (varsayılan), small, medium — önce indirin")
    p.add_argument("--dil", default="tr", help="konuşma dili (varsayılan: tr)")
    p.add_argument("--ipucu", help="modele bağlam/yazım ipucu (ör. özel adlar)")
    p.add_argument("--cikti", type=Path, help="dosyaya yaz (verilmezse ekrana)")
    p.add_argument("--sahte", metavar="METİN", help="modelsiz deneme: bu metni döndüren sahte motor")


def ayristirici_kur() -> argparse.ArgumentParser:
    ana = _TurkceAyristirici(
        prog="python -m ses",
        description="Türkçe ses temeli: konuşmayı yazıya çevirir, metni seslendirir, ölçer, sunar.",
        epilog='Örnek: python -m ses normallestir "23.11.2026\'da saat 14:30\'da ₺1.234,50"',
    )
    ana._positionals.title = "komutlar"
    alt = ana.add_subparsers(dest="komut", metavar="<komut>", parser_class=_TurkceAyristirici)

    def ekle(ad: str, yardim: str) -> argparse.ArgumentParser:
        p: argparse.ArgumentParser = alt.add_parser(ad, help=yardim, description=yardim)
        p.add_argument("--model-dizini", type=Path, help="indirilen modellerin klasörü (SES_MODEL_DIZINI)")
        return p

    p = ekle("yaziya", "konuşmayı yazıya çevirir (metin, json, srt, vtt)")
    _stt_secenekleri(p)
    p.add_argument("--bicim", choices=["metin", "json", "srt", "vtt"], default="metin", help="çıktı biçimi")

    p = ekle("altyazi", "ses/video için SRT ya da WebVTT altyazı üretir")
    _stt_secenekleri(p)
    p.add_argument("--bicim", choices=["srt", "vtt"], default="srt", help="altyazı biçimi (varsayılan srt)")
    p.add_argument("--azami-karakter", type=int, default=42, help="satır başına en çok karakter (42)")
    p.add_argument("--azami-satir", type=int, default=2, help="ipucu başına en çok satır (2)")
    p.add_argument("--azami-sure", type=float, default=7.0, help="ipucu başına en çok saniye (7)")

    p = ekle("seslendir", "metni sese çevirir (Piper; varsayılan Türkçe ses)")
    p.add_argument("metin", nargs="?", help="seslendirilecek metin")
    p.add_argument("--dosya", help="metni UTF-8 dosyadan oku")
    p.add_argument("--cikti", type=Path, default=Path("cikti.wav"), help="çıktı dosyası (cikti.wav)")
    p.add_argument("--bicim", choices=["wav", "pcm", "ogg", "opus", "mp3", "flac"], help="verilmezse uzantıdan")
    p.add_argument("--ses", help="katalogdaki ses adı (python -m ses modeller)")
    p.add_argument("--hiz", type=float, default=1.0, help="konuşma hızı 0,5–2 (1)")
    p.add_argument("--perde", type=float, default=0.0, help="perde, yarım ton −6…+6 (0)")
    p.add_argument("--cumle-arasi", type=int, default=300, help="cümleler arası sessizlik, ms (300)")
    p.add_argument("--lufs", type=float, default=-16.0, help="ses yüksekliği hedefi, LUFS (−16)")
    p.add_argument("--lufs-yok", action="store_true", help="ses yüksekliğine dokunma")
    p.add_argument("--ornekleme", type=int, help="çıktı örnekleme hızı (ör. 16000, 24000, 48000)")
    p.add_argument("--normallestirme-yok", action="store_true", help="sayı/tarih/kısaltma okunuşa çevrilmesin")
    p.add_argument("--sahte", action="store_true", help="modelsiz deneme: bip sesleri üretir")

    p = ekle("normallestir", "metnin seslendirmede nasıl okunacağını gösterir")
    p.add_argument("metin", nargs="?", help="metin")
    p.add_argument("--dosya", help="metni UTF-8 dosyadan oku")
    p.add_argument("--ayrinti", action="store_true", help="hangi kuralın neyi değiştirdiğini göster")

    p = ekle("degerlendir", "ses + doğru metin listesiyle (JSONL) WER/CER/RTF ölçer")
    p.add_argument("liste", help='JSONL: her satır {"ses": "a.wav", "metin": "…", "etiket": "…"}')
    p.add_argument("--model", help="tiny, base, small, medium")
    p.add_argument("--cikti", type=Path, help="rapor.json ve rapor.md'nin yazılacağı klasör")
    p.add_argument("--sahte", metavar="METİN", help="modelsiz deneme")

    p = ekle("modeller", "katalogdaki modelleri, lisanslarını ve indirilip indirilmediğini listeler")
    p.add_argument("--json", action="store_true", help="JSON çıktı")

    p = ekle("indir", "modeli/sesi Hugging Face'ten indirir ve sha256 doğrular (ağ ister)")
    p.add_argument("--stt", action="append", default=[], help="Whisper boyutu (tekrarlanabilir): base")
    p.add_argument("--tts", action="append", default=[], help="Piper sesi: tr_TR-dfki-medium")
    p.add_argument("--denetle", action="store_true", help="indirme; diskteki dosyaların sha256'sını denetle")

    p = ekle("sun", "OpenAI uyumlu ses sunucusunu başlatır (varsayılan 127.0.0.1:8460)")
    p.add_argument("--adres", help="dinlenecek adres (başka adres için SES_SUNUCU_ANAHTARI zorunlu)")
    p.add_argument("--kapi", type=int, help="kapı (varsayılan 8460)")
    p.add_argument("--sahte", action="store_true", help="modelsiz deneme (sahte motorlar)")

    p = ekle("bilgi", "ses dosyasının süresini, düzeyini (tepe, RMS, LUFS) ve konuşma süresini gösterir")
    p.add_argument("dosya", help="ses dosyası")

    p = ekle("hazirla", "kaydı hazırlar: tek kanal, sessizlik kırpma, LUFS, örnekleme hızı → WAV")
    p.add_argument("girdi", help="ses dosyası")
    p.add_argument("cikti", type=Path, help="çıktı WAV")
    p.add_argument("--lufs", type=float, default=-16.0, help="hedef ses yüksekliği (−16)")
    p.add_argument("--ornekleme", type=int, help="çıktı örnekleme hızı (ör. 22050)")
    p.add_argument("--kirpma-yok", action="store_true", help="baş/son sessizliği kırpma")
    return ana


_KOMUTLAR = {
    "yaziya": komutlar.komut_yaziya,
    "altyazi": komutlar.komut_altyazi,
    "seslendir": komutlar.komut_seslendir,
    "normallestir": komutlar.komut_normallestir,
    "degerlendir": komutlar.komut_degerlendir,
    "modeller": komutlar.komut_modeller,
    "indir": komutlar.komut_indir,
    "sun": komutlar.komut_sun,
    "bilgi": komutlar.komut_bilgi,
    "hazirla": komutlar.komut_hazirla,
    # YENİ KOMUT BURAYA
}


def main(argv: Sequence[str] | None = None) -> int:
    ayristirici = ayristirici_kur()
    secenek = ayristirici.parse_args(argv)
    if not secenek.komut:
        ayristirici.print_help()
        return 0
    try:
        return _KOMUTLAR[secenek.komut](secenek)
    except SesHatasi as hata:
        print(f"Hata: {hata}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Durduruldu.", file=sys.stderr)
        return 130
