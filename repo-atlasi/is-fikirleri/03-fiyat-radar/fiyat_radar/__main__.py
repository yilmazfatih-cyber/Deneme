"""Komut satırı.

python3 -m fiyat_radar calistir --ayar ornek/ayar.json --db radar.sqlite --cikti rapor [--telegram]
python3 -m fiyat_radar sunucu   --ayar ornek/ayar.json --db radar.sqlite --cikti rapor --port 8765
python3 -m fiyat_radar n8n      --radar-url http://127.0.0.1:8765/calistir --chat-id -1001234567890
"""

import argparse
import json
import os
import sys
from pathlib import Path

from .bildir import TELEGRAM_API, BildirimHatasi, telegram_gonder
from .depo import Depo
from .n8n import is_akisi
from .radar import AyarHatasi, Calisma, ayar_oku, calistir, getirici_kur
from .rapor import bildirim_gerekli, html_eposta, markdown, n8n_yaniti, telegram_metni
from .sunucu import sunucu_kur


def tur(ayar_yolu: Path, db_yolu: Path, cikti: Path, getirici=None) -> Calisma:
    """Bir tarama turu ve rapor dosyaları. Ayar her turda yeniden okunur (sunucuyu yeniden başlatmak gerekmez)."""
    ayar = ayar_oku(ayar_yolu)
    depo = Depo(str(db_yolu))
    try:
        calisma = calistir(ayar, depo, getirici or getirici_kur(ayar))
    finally:
        depo.kapat()
    cikti.mkdir(parents=True, exist_ok=True)
    (cikti / "rapor.md").write_text(markdown(calisma), encoding="utf-8")
    (cikti / "rapor.html").write_text(html_eposta(calisma), encoding="utf-8")
    (cikti / "telegram.txt").write_text(telegram_metni(calisma), encoding="utf-8")
    return calisma


def _telegrama_gonder(ayar_yolu: Path, calisma: Calisma) -> int:
    """n8n'siz kurulum: değişiklik ya da hata varsa özeti doğrudan gönderir. Belirteç yalnızca ortamdan okunur."""
    if not bildirim_gerekli(calisma):
        return 0
    tg = ayar_oku(ayar_yolu).get("telegram") or {}
    try:
        belirtec = os.environ.get(tg.get("belirtec_ortam", "TELEGRAM_BOT_TOKEN"), "")
        telegram_gonder(telegram_metni(calisma), tg.get("sohbet_kimligi"), belirtec, tg.get("api_url", TELEGRAM_API))
    except BildirimHatasi as hata:
        print(f"Telegram: {hata}", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="fiyat_radar", description="Rakip fiyat ve kampanya radarı")
    alt = p.add_subparsers(dest="komut", required=True)
    for ad in ("calistir", "sunucu"):
        k = alt.add_parser(ad)
        k.add_argument("--ayar", type=Path, required=True)
        k.add_argument("--db", type=Path, default=Path("radar.sqlite"))
        k.add_argument("--cikti", type=Path, default=Path("rapor"))
        if ad == "calistir":
            k.add_argument("--telegram", action="store_true", help="değişiklik ya da hata varsa özeti Telegram'a gönder")
        else:
            k.add_argument("--adres", default="127.0.0.1")
            k.add_argument("--port", type=int, default=8765)
    k = alt.add_parser("n8n")
    k.add_argument("--radar-url", default="http://127.0.0.1:8765/calistir")
    k.add_argument("--chat-id", default="TELEGRAM_SOHBET_KIMLIGI")
    k.add_argument("--saat", type=int, default=8, choices=range(24), metavar="0-23")
    k.add_argument("--saat-dilimi", default="Europe/Istanbul")
    a = p.parse_args(argv)

    if a.komut == "n8n":
        print(json.dumps(is_akisi(a.radar_url, a.chat_id, a.saat, a.saat_dilimi), ensure_ascii=False, indent=2))
        return 0
    try:
        if a.komut == "calistir":
            calisma = tur(a.ayar, a.db, a.cikti)
            print(telegram_metni(calisma))
            return _telegrama_gonder(a.ayar, calisma) if a.telegram else 0
        ayar_oku(a.ayar)  # sunucu açılmadan önce ayar hatası yakalansın
        sunucu = sunucu_kur(a.adres, a.port, os.environ.get("RADAR_ANAHTARI", ""), lambda: n8n_yaniti(tur(a.ayar, a.db, a.cikti)))
    except AyarHatasi as hata:
        print(f"Ayar hatası: {hata}", file=sys.stderr)
        return 2
    except ValueError as hata:
        print(hata, file=sys.stderr)
        return 2
    print(f"Radar sunucusu: http://{a.adres}:{a.port}/calistir (durdurmak için Ctrl+C)")
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        sunucu.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
