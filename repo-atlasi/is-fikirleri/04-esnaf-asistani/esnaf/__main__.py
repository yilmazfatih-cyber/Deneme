"""Yönetim komut satırı: python3 -m esnaf <komut>.

Gizli bilgiler (bot belirteci, webhook anahtarı) yalnız ortam değişkeninden okunur;
komut satırı argümanı kabuk geçmişine düştüğü için kullanılmaz.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sqlite3
import sys
import threading
from collections.abc import Callable
from datetime import date, datetime
from pathlib import Path

from . import slotlar
from .beceri import beceri_uret
from .depo import Depo
from .metin import tarih_metni
from .yapilandirma import Isletme, yukle
from .yonlendirici import Yonlendirici
from .zaman import yerel_saat

log = logging.getLogger("esnaf")


def _gun(metin: str) -> date:
    """argparse türü: YYYY-AA-GG ya da GG.AA.YYYY."""
    for bicim in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(metin.strip(), bicim).date()
        except ValueError:
            pass
    raise argparse.ArgumentTypeError(f"tarih YYYY-AA-GG ya da GG.AA.YYYY olmalı: {metin!r}")


def _yonlendirici(isletme: Isletme, depo: Depo, model: str | None, saat: Callable[[], datetime]) -> Yonlendirici:
    ajan = None
    if model:
        from .ollama import OllamaAjani, ollama_adresi

        ajan = OllamaAjani(isletme, depo, model=model, taban_url=ollama_adresi(os.environ.get("OLLAMA_HOST")), saat=saat)
        ajan.denetle()  # yanlış adres, bulut modeli ya da araç desteği olmayan model açılışta anlaşılsın
    return Yonlendirici(isletme, depo, saat=saat, ajan=ajan)


def _sohbet(yonlendirici: Yonlendirici, bellekte: bool) -> None:
    if bellekte:
        print("Deneme modu: kayıtlar bellekte tutulur, çıkınca silinir (gerçek veritabanı için --vt verin).")
    print("Müşteri gibi yazın (çıkmak için Ctrl+D).")
    for satir in sys.stdin:
        for giden in yonlendirici.isle(1, satir, "Deneme"):
            hedef = "" if giden.sohbet_id == 1 else f"[sahip {giden.sohbet_id}] "
            print(f"{hedef}{giden.metin}")
            if giden.secenekler:
                print("  [" + " | ".join(giden.secenekler) + "]")


def _temizlik_dongusu(depo: Depo, isletme: Isletme, saat: Callable[[], datetime], dur: threading.Event,
                      aralik_sn: float = 24 * 3600) -> None:
    """Saklama süresi dolan kayıtları açılışta ve sonra günde bir siler (cron gerekmez)."""
    while True:
        try:
            log.info("Temizlik: %s", depo.temizle(isletme.saklama_gun, saat(), isletme.devir_saklama_gun))
        except sqlite3.Error as hata:
            log.warning("Temizlik yapılamadı: %s", type(hata).__name__)
        if dur.wait(aralik_sn):
            return


def _telegram(args: argparse.Namespace, isletme: Isletme, depo: Depo, yonlendirici: Yonlendirici,
              saat: Callable[[], datetime]) -> int:
    from .telegram import TelegramHatasi, TelegramIstemcisi, uzun_yoklama, webhook_sunucusu

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        print("TELEGRAM_BOT_TOKEN ortam değişkeni tanımlı değil.", file=sys.stderr)
        return 2
    if isletme.sahip_sohbet_id is None:
        log.warning("sahip_sohbet_id tanımlı değil: randevu ve devir bildirimleri işletmeye gitmez "
                    "(kendi hesabınızdan bota /kimlik yazıp çıkan numarayı isletme.json'a ekleyin)")
    istemci = TelegramIstemcisi(token)
    dur = threading.Event()
    threading.Thread(target=_temizlik_dongusu, args=(depo, isletme, saat, dur), daemon=True).start()
    try:
        if args.komut == "yoklama":
            istemci.cagir("deleteWebhook", {})  # webhook açıksa getUpdates çalışmaz
            uzun_yoklama(istemci, yonlendirici)
            return 0
        gizli = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")
        sunucu = webhook_sunucusu(istemci, yonlendirici, gizli, (args.host, args.port), args.yol)
        try:
            istemci.webhook_ayarla(args.url, gizli)
            print(f"Webhook dinleniyor: {args.host}:{args.port}{args.yol}")
            sunucu.serve_forever()
        finally:
            sunucu.server_close()
        return 0
    except ValueError as hata:  # ör. kısa ya da geçersiz karakterli webhook anahtarı
        print(str(hata), file=sys.stderr)
        return 2
    except TelegramHatasi as hata:
        print(f"Telegram'a ulaşılamadı: {hata}", file=sys.stderr)
        return 1
    finally:
        dur.set()


def ana(argv: list[str] | None = None, saat: Callable[[], datetime] | None = None) -> int:
    """Komut satırı girişi. saat: testlerde sabit yerel "şimdi" vermek için."""
    p = argparse.ArgumentParser(prog="python3 -m esnaf", description="Esnaf mesaj ve randevu asistanı")
    p.add_argument("--yapilandirma", default="isletme.json", help="işletme JSON dosyası")
    p.add_argument("--vt", help="sqlite veritabanı dosyası (varsayılan esnaf.db; sohbet komutunda bellek)")
    alt = p.add_subparsers(dest="komut", required=True)
    for ad, yardim in (("sohbet", "terminalden müşteri gibi konuş"), ("yoklama", "Telegram uzun yoklama"),
                       ("webhook", "Telegram webhook sunucusu")):
        k = alt.add_parser(ad, help=yardim)
        k.add_argument("--ollama-model", help="anlaşılmayan mesajlar için yerel model, ör. qwen2.5:7b")
        if ad == "webhook":
            k.add_argument("--url", required=True, help="Telegram'ın çağıracağı genel HTTPS adres")
            k.add_argument("--host", default="127.0.0.1")
            k.add_argument("--port", type=int, default=8080)
            k.add_argument("--yol", default="/telegram")
    alt.add_parser("randevular", help="bir günün randevuları").add_argument("--gun", type=_gun)
    m = alt.add_parser("musaitlik", help="boş saatler (salt okunur; beceri bunu çağırır)")
    m.add_argument("--hizmet", required=True)
    m.add_argument("--gun", type=_gun)
    m.add_argument("--json", action="store_true")
    alt.add_parser("iptal", help="randevuyu iptal et").add_argument("id", type=int)
    alt.add_parser("devirler", help="açık insan devri talepleri")
    alt.add_parser("devir-kapat", help="devir talebini kapat (mesajı silinir)").add_argument("id", type=int)
    alt.add_parser("veri-sil", help="bir kişinin tüm kayıtlarını sil").add_argument("sohbet_id", type=int)
    alt.add_parser("temizle", help="saklama süresi dolan kayıtları sil").add_argument("--gun", type=int)
    alt.add_parser("beceri-uret", help="OpenClaw/Hermes becerisi üret").add_argument("hedef")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    try:
        isletme = yukle(args.yapilandirma)
    except (OSError, ValueError, KeyError) as hata:
        print(f"Yapılandırma okunamadı ({args.yapilandirma}): {hata}", file=sys.stderr)
        return 2
    saat = saat or yerel_saat(isletme.saat_dilimi)
    if args.komut == "beceri-uret":
        for yol in beceri_uret(isletme, args.hedef):
            print(yol)
        return 0
    vt = args.vt or (":memory:" if args.komut == "sohbet" else "esnaf.db")
    if args.komut == "musaitlik":  # becerinin çağırdığı komut: veritabanına asla yazmaz
        if not os.path.isfile(vt):  # yanlış yolda boş takvimi "her saat boş" diye bildirmeyelim
            print(f"Veritabanı bulunamadı: {vt} (botun kullandığı --vt yolunu verin)", file=sys.stderr)
            return 3
        depo = Depo(vt, salt_okunur=True)
    else:
        depo = Depo(vt)
    try:
        return _komut(args, isletme, depo, saat, vt)
    except sqlite3.Error as hata:
        print(f"Veritabanı hatası ({vt}): {hata}", file=sys.stderr)
        return 3
    finally:
        depo.kapat()


def _komut(args: argparse.Namespace, isletme: Isletme, depo: Depo, saat: Callable[[], datetime], vt: str) -> int:
    if args.komut in ("sohbet", "yoklama", "webhook"):
        from .ollama import ModelHatasi

        try:
            yonlendirici = _yonlendirici(isletme, depo, args.ollama_model, saat)
        except (ValueError, ModelHatasi) as hata:
            print(f"Dil modeli kullanılamıyor: {hata}", file=sys.stderr)
            return 2
        if args.komut == "sohbet":
            _sohbet(yonlendirici, vt == ":memory:")
            return 0
        return _telegram(args, isletme, depo, yonlendirici, saat)
    simdi = saat()
    if args.komut == "musaitlik":
        hizmet = isletme.hizmet(args.hizmet)
        if hizmet is None:
            print(f"Bilinmeyen hizmet kodu: {args.hizmet}", file=sys.stderr)
            return 2
        bos = slotlar.bos_slotlar(isletme, hizmet, depo.dolu_araliklar(), simdi, args.gun, adet=50,
                                  tek_gun=bool(args.gun))
        if args.json:
            print(json.dumps({"hizmet": hizmet.kod, "vt": str(Path(vt).resolve()),
                              "bos": [a.isoformat(timespec="minutes") for a, _ in bos]}, ensure_ascii=False))
        else:
            for an, kaynak in bos:
                print(f"{tarih_metni(an.date())} {an:%H:%M}  {kaynak}")
        return 0
    if args.komut == "randevular":
        for r in depo.gunun_randevulari((args.gun or simdi.date()).isoformat()):
            saat_araligi = f"{r['baslangic'][11:]}-{r['bitis'][11:]}"
            print(f"#{r['id']}  {saat_araligi}  {r['kaynak']}  {r['hizmet']}  {r['ad'] or '-'}")
        return 0
    if args.komut == "iptal":
        r = depo.randevu_iptal(args.id)
        if r is None:
            print("Aktif randevu bulunamadı.")
        else:
            print(f"İptal edildi. Müşteriye haber verilmedi (sohbet {r['sohbet_id']}); Telegram'dan "
                  f"/iptal {args.id} yazarsanız bot müşteriye haber verir.")
    elif args.komut == "devirler":
        for d in depo.acik_devirler():
            mesaj = d["mesaj"] or "(mesaj saklanmadı)"
            print(f"#{d['id']}  {d['olusturma']}  sohbet {d['sohbet_id']} ({d['ad'] or '-'}): {mesaj}")
    elif args.komut == "devir-kapat":
        print("Kapatıldı; mesaj silindi." if depo.devir_kapat(args.id) else "Açık talep bulunamadı.")
    elif args.komut == "veri-sil":
        print(json.dumps(depo.kisi_verilerini_sil(args.sohbet_id), ensure_ascii=False))
    elif args.komut == "temizle":
        gun = args.gun if args.gun is not None else isletme.saklama_gun
        print(json.dumps(depo.temizle(gun, simdi, isletme.devir_saklama_gun), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(ana())
