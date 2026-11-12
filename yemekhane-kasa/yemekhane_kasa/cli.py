"""Komut satırı.

python -m yemekhane_kasa calistir      [--ayarlar ayarlar.yaml]
python -m yemekhane_kasa kalibre       [--ayarlar ayarlar.yaml] [--sure 3]
python -m yemekhane_kasa dene FOTO     [--ayarlar ayarlar.yaml] [--bolge] [--gonder] [--json]
python -m yemekhane_kasa menu-dogrula  [MENU.yaml] [--ayarlar ayarlar.yaml]
python -m yemekhane_kasa pos-simulator [--host 127.0.0.1] [--port 8099]
python -m yemekhane_kasa demo          [--hizli] [--pos-adres URL]
"""

from __future__ import annotations

import argparse
import json
import logging
import signal
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image

from yemekhane_kasa.ayarlar import AyarHatasi, Ayarlar, ayarlari_yukle
from yemekhane_kasa.fiyat import fiyatlandir
from yemekhane_kasa.goruntu import bolge_ciz, bolge_kirp, fark_orani, imza_cikar
from yemekhane_kasa.kamera import KameraHatasi, Kare, kaynak_olustur
from yemekhane_kasa.menu import MenuHatasi, MenuIzleyici, menu_yukle, tl
from yemekhane_kasa.pos import HttpPos, fis_metni, mesaj_olustur, pos_olustur
from yemekhane_kasa.takip import BosTezgahDedektoru, Siparis
from yemekhane_kasa.tanima import TanimaHatasi, taniyici_olustur

log = logging.getLogger("yemekhane_kasa")


def _ayarlar(args: argparse.Namespace) -> Ayarlar:
    yol = Path(args.ayarlar)
    if not yol.exists():
        raise AyarHatasi(f"{yol} yok. Örnekten başlayın: cp ayarlar.ornek.yaml ayarlar.yaml")
    return ayarlari_yukle(yol)


def _calistir(args: argparse.Namespace) -> int:
    from yemekhane_kasa.servis import servis_olustur

    servis = servis_olustur(_ayarlar(args))
    durdur = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: durdur.set())
    try:
        servis.calistir(durdur)
    except KeyboardInterrupt:
        pass
    return 0


def _kalibre(args: argparse.Namespace) -> int:
    ayarlar = _ayarlar(args)
    bolge = ayarlar.kamera.bolge
    print(f"Tezgâhı boşaltın ve elinizi çekin; {args.sure:g} sn boyunca boş tezgâh görüntüsü alınacak...")
    kaynak = kaynak_olustur(ayarlar.kamera, ayarlar.temel)
    kaynak.ac()
    imzalar, son = [], None
    try:
        ilk_kare_siniri = time.monotonic() + 15
        bitis = None
        while bitis is None or time.monotonic() < bitis:
            kare = kaynak.son_kare()
            if kare is None:
                if time.monotonic() > ilk_kare_siniri:
                    raise KameraHatasi("kameradan görüntü alınamadı")
                time.sleep(0.1)
                continue
            if bitis is None:
                bitis = time.monotonic() + args.sure
            son = kare
            imzalar.append(imza_cikar(bolge_kirp(kare.goruntu, bolge)))
            time.sleep(ayarlar.kamera.yoklama_sn)
    finally:
        kaynak.kapat()
    assert son is not None
    arka_plan = np.mean(imzalar, axis=0)
    gurultu = max(fark_orani(i, arka_plan, ayarlar.esikler.hucre_esigi) for i in imzalar)
    dedektor = BosTezgahDedektoru(ayarlar.esikler)
    dedektor.ogren(arka_plan)
    klasor = ayarlar.yol(ayarlar.kalibrasyon)
    dedektor.kaydet(klasor / "arka_plan.json", bolge, gurultu)
    bolge_ciz(son.goruntu, bolge).save(klasor / "tam_kare.jpg", quality=90)
    bolge_kirp(son.goruntu, bolge).convert("RGB").save(klasor / "bolge.jpg", quality=90)
    print(f"Boş tezgâh kaydedildi: {klasor / 'arka_plan.json'} ({len(imzalar)} kare)")
    print(f"Gürültü: değişen alan en çok %{gurultu * 100:.1f} (boş sayma eşiği %{ayarlar.esikler.bos * 100:.0f})")
    if gurultu >= ayarlar.esikler.bos / 2:
        print("UYARI: görüntü kalibrasyon sırasında değişti (hareket, titreyen ışık). Tezgâh boşken yeniden deneyin.")
    print(f"Bölgeyi kontrol edin: {klasor / 'tam_kare.jpg'} — kırmızı çerçeve tam tepsi alanını çevrelemeli.")
    return 0


def _dene(args: argparse.Namespace) -> int:
    ayarlar = _ayarlar(args)
    menu = MenuIzleyici(ayarlar.menu, ayarlar.temel).guncel()
    with Image.open(args.foto) as acik:
        goruntu = acik.convert("RGB")
    if args.bolge:
        goruntu = bolge_kirp(goruntu, ayarlar.kamera.bolge)
    sonuc = taniyici_olustur(ayarlar.tanima).tani(Kare(goruntu, time.monotonic(), str(args.foto)), menu)
    kullanim = ", ".join(f"{ad}={sayi}" for ad, sayi in sonuc.kullanim.items())
    print(f"Model: {sonuc.model or '-'} | süre {sonuc.sure_sn:.1f} sn" + (f" | {kullanim}" if kullanim else ""))
    if sonuc.hata:
        print(f"Tanıma başarısız: {sonuc.hata}")
        return 1
    if not sonuc.tepsi_var:
        print("Tepside yemek görülmedi." + (f" Not: {sonuc.not_}" if sonuc.not_ else ""))
        return 0
    for kalem in sonuc.kalemler:
        print(f"  görülen: {kalem.menu_id} x{kalem.adet} ({kalem.porsiyon}) güven {kalem.guven:.2f}")
    adisyon = fiyatlandir(menu, sonuc.kalemler, ayarlar.tanima.en_dusuk_guven, sonuc.taninmayanlar)
    if sonuc.not_:
        adisyon.uyarilar.append(f"Not: {sonuc.not_}")
    simdi = datetime.now().astimezone()
    mesaj = mesaj_olustur(Siparis(f"DENE-{simdi:%Y%m%d-%H%M%S}", 1, "yeni", simdi, adisyon), ayarlar.pos.kasa_adi)
    print(fis_metni(mesaj))
    if args.json:
        print(json.dumps(mesaj, ensure_ascii=False, indent=2))
    if args.gonder:
        pos_sonucu = pos_olustur(ayarlar.pos, ayarlar.temel).gonder(mesaj)
        print(f"POS: {'gönderildi' if pos_sonucu.basarili else 'GÖNDERİLEMEDİ'} ({pos_sonucu.ayrinti})")
        return 0 if pos_sonucu.basarili else 1
    return 0


def _menu_dogrula(args: argparse.Namespace) -> int:
    if args.menu:
        yol = Path(args.menu)
        menu = menu_yukle(yol)
    else:
        ayarlar = _ayarlar(args)
        izleyici = MenuIzleyici(ayarlar.menu, ayarlar.temel)
        yol = izleyici.yol()
        menu = izleyici.guncel()
    print(f"{yol}: geçerli — {menu.ad}, {len(menu.yemekler)} yemek, varsayılan KDV %{menu.kdv}")
    for y in menu.yemekler:
        yarim = f"yarım {tl(y.yarim_fiyat_kurus)}" if y.yarim_fiyat_kurus is not None else ""
        ekler = [f"PLU {y.plu}" if y.plu else "", "foto" if y.gorsel else "", "" if y.tarif else "TARİF YOK"]
        print(
            f"  {y.id:<22} {y.ad[:24]:<24} {y.kategori:<10} {tl(y.fiyat_kurus):>12}  {yarim:<16} "
            f"KDV %{menu.kdv_orani(y):<3} {' '.join(e for e in ekler if e)}"
        )
    for fiks in menu.fiks_menuler:
        print(f"  fiks menü: {fiks.ad}: {' + '.join(fiks.kategoriler)} → {tl(fiks.fiyat_kurus)}")
    if any(not y.tarif for y in menu.yemekler):
        print("İpucu: 'tarif' alanı (renk, kap, süs) tanımanın en büyük yardımcısıdır.")
    return 0


def _pos_simulator(args: argparse.Namespace) -> int:
    from yemekhane_kasa import pos_simulator

    pos_simulator.calistir(args.host, args.port)
    return 0


def _demo(args: argparse.Namespace) -> int:
    from yemekhane_kasa.demo import demo_calistir

    pos = HttpPos(args.pos_adres) if args.pos_adres else None
    if args.hizli:
        saat = _SahteSaat()
        servis = demo_calistir(pos=pos, saat=saat, uyku=saat.uyu)
    else:
        print("Demo başlıyor (~15 sn): boş tezgâh → tepsi → aynı tepsi → tatlı eklendi → boş → ikinci müşteri → boş")
        servis = demo_calistir(pos=pos)
    print(f"\nDenetim kayıtları: {servis.kayitci.klasor}")
    return 0


class _SahteSaat:
    def __init__(self) -> None:
        self.an = 0.0

    def __call__(self) -> float:
        return self.an

    def uyu(self, sure: float) -> None:
        self.an += sure


def main(argv: list[str] | None = None) -> int:
    ana = argparse.ArgumentParser(
        prog="python -m yemekhane_kasa",
        description="Kasadaki tepsiyi kamerayla tanır, günün menüsüyle eşler, fiyatlandırır ve POS'a gönderir.",
    )
    ana.add_argument("-v", "--ayrintili", action="store_true", help="ayrıntılı günlük")
    alt = ana.add_subparsers(dest="komut", required=True, metavar="KOMUT")

    def ayar_secenegi(p: argparse.ArgumentParser) -> None:
        p.add_argument("--ayarlar", default="ayarlar.yaml", help="ayar dosyası (varsayılan: ayarlar.yaml)")

    p = alt.add_parser("calistir", help="kamerayı izle, tepsileri fiyatlandır, POS'a gönder")
    ayar_secenegi(p)
    p.set_defaults(islev=_calistir)

    p = alt.add_parser("kalibre", help="boş tezgâhı kaydet ve tepsi bölgesinin önizlemesini çıkar")
    ayar_secenegi(p)
    p.add_argument("--sure", type=float, default=3.0, help="kaç saniye görüntü alınsın (varsayılan 3)")
    p.set_defaults(islev=_kalibre)

    p = alt.add_parser("dene", help="tek bir fotoğrafı tanı ve fişi göster (kurulum denemesi)")
    ayar_secenegi(p)
    p.add_argument("foto", type=Path)
    p.add_argument("--bolge", action="store_true", help="ayarlardaki kamera bölgesini fotoğrafa da uygula")
    p.add_argument("--gonder", action="store_true", help="fişi POS'a da gönder")
    p.add_argument("--json", action="store_true", help="POS'a gidecek JSON'u da yaz")
    p.set_defaults(islev=_dene)

    p = alt.add_parser("menu-dogrula", help="menü dosyasını doğrula ve listele")
    ayar_secenegi(p)
    p.add_argument("menu", nargs="?", help="menü dosyası (verilmezse ayarlardaki bugünün menüsü)")
    p.set_defaults(islev=_menu_dogrula)

    p = alt.add_parser("pos-simulator", help="siparişleri alıp ekrana yazan deneme POS'u")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8099)
    p.set_defaults(islev=_pos_simulator)

    p = alt.add_parser("demo", help="kamerasız ve API anahtarsız uçtan uca gösterim")
    p.add_argument("--hizli", action="store_true", help="beklemeden çalıştır")
    p.add_argument("--pos-adres", help="fişleri bu HTTP adresine gönder (ör. pos-simulator)")
    p.set_defaults(islev=_demo)

    args = ana.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.ayrintili else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )
    if not args.ayrintili:
        for gurultulu in ("anthropic", "httpx", "httpx2", "httpcore"):
            logging.getLogger(gurultulu).setLevel(logging.WARNING)
    try:
        return args.islev(args)
    except (AyarHatasi, MenuHatasi, KameraHatasi, TanimaHatasi, OSError) as e:
        print(f"HATA: {e}", file=sys.stderr)
        return 2
