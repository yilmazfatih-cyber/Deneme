"""Komut satırı: python -m yatirim_ajani <komut> --help"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime

import pandas as pd

from pathlib import Path

from .arastirma.ajan import AjanHatasi, ArastirmaAjani, tez_kaydet
from .arastirma.ekip import Ekip, gorevleri_json, teslimi_kaydet
from .ogrenme.egitim import egit_ve_olc, kayma_karsilastir, model_yukle
from .ogrenme.kapi import saatlik_kapi
from .veri.bolme import Bolme
from .veri.saatlik import SaatlikVeriSeti
from .ayarlar import PIYASALAR, Ayarlar, ayarlari_yukle
from .depo import baglan
from .geriye_test import geriye_test
from .motor import tara
from .risk.bekci import piyasa_acik_mi
from .strateji.kurallar import StratejiAyarlari
from .tahmin.gunluk import karne, tahminleri_coz
from .veri.kaynak import kaynak_olustur
from .veri.zaman_kilidi import ZamanKilitliVeri
from .yurutme.oneri import onerileri_kaydet
from .yurutme.sanal_araci import SanalAraci


def _an(metin: str | None, saat_dilimi: str) -> tuple[datetime, bool]:
    """(karar anı, canlı mı). --an verilmezse şimdiki zaman ve canlı mod."""
    if not metin:
        return datetime.now().astimezone(), True
    ts = pd.Timestamp(metin)
    if ts.tzinfo is None:
        ts = ts.tz_localize(saat_dilimi)
    return ts.to_pydatetime(), False


def _hisseler(arg: str | None, ayarlar: Ayarlar, piyasa: str) -> list[str]:
    return [h.strip().upper() for h in arg.split(",")] if arg else list(ayarlar.evren[piyasa])


def komut_arastir(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    piyasa = PIYASALAR[a.piyasa]
    an, canli = _an(a.an, piyasa.saat_dilimi)
    db = baglan(ayarlar.veritabani)
    veri = ZamanKilitliVeri(kaynak_olustur(a.veri, a.csv_klasoru), an, canli=canli)
    ajan = ArastirmaAjani(ayarlar.ajan, piyasa, veri, db)
    hata_sayisi = 0
    for h in _hisseler(a.hisseler, ayarlar, a.piyasa):
        print(f"\n=== {h} araştırılıyor ({'canlı' if canli else 'zaman kilitli: ' + an.isoformat()}) ===")
        try:
            sonuc = ajan.arastir(h)
        except AjanHatasi as hata:
            print(f"  Atlandı: {hata}")
            hata_sayisi += 1
            continue
        t = sonuc.tez
        tez_id = tez_kaydet(db, piyasa, sonuc, veri, ayarlar.ajan.model)
        aralik = (
            f"{t.adil_deger_alt:,.2f} – {t.adil_deger_ust:,.2f}"
            if t.adil_deger_alt is not None and t.adil_deger_ust is not None
            else "belirsiz"
        )
        print(f"  Karar: {t.karar}   P(≥{t.esik_getiri:+.0%} / {t.ufuk_gun} gün) = {t.olasilik:.0%}")
        print(f"  Fiyat: {sonuc.giris_fiyati}   Adil değer aralığı: {aralik} {piyasa.para_birimi}")
        print(f"  Özet: {t.ozet}")
        print(f"  Riskler: {'; '.join(t.riskler[:3])}")
        print(f"  (tez #{tez_id}, {sonuc.tur_sayisi} tur, {sonuc.girdi_token}+{sonuc.cikti_token} token)")
    return 1 if hata_sayisi else 0


def _tara_bir_kez(a: argparse.Namespace, ayarlar: Ayarlar, db, kaynak) -> None:
    piyasa = PIYASALAR[a.piyasa]
    an = datetime.now().astimezone()
    veri = ZamanKilitliVeri(kaynak, an, canli=True)
    araci = SanalAraci(db, piyasa)
    araci.hesap_ac(ayarlar.baslangic_nakit[a.piyasa])
    strateji = StratejiAyarlari(kisa_pencere=a.kisa, uzun_pencere=a.uzun)
    kapi = None
    if a.aralik == "1h":
        model = model_yukle(ayarlar, piyasa, 0)
        if model is None:
            print("Uyarı: eğitilmiş saatlik model yok (`egit` çalıştırın); yalnız kural katmanıyla taranıyor.")
        else:
            kapi = saatlik_kapi(model, ayarlar.risk.min_net_getiri, piyasa)
    sonuclar = tara(
        db, piyasa, ayarlar.risk, veri, _hisseler(a.hisseler, ayarlar, a.piyasa), a.aralik, strateji,
        saat_denetimi=not a.saat_denetimi_kapali, giris_filtresi=kapi,
    )  # fmt: skip
    yol = onerileri_kaydet(db, piyasa, sonuclar, an, ayarlar.rapor_klasoru)
    zaman = f"{pd.Timestamp(an).tz_convert(piyasa.saat_dilimi):%H:%M}"
    if not sonuclar:
        print(f"[{zaman}] Sinyal yok.")
        if not db.execute("SELECT 1 FROM tezler WHERE piyasa = ? AND karar = 'AL' LIMIT 1", (piyasa.kod,)).fetchone():
            print("  Not: geçerli AL tezi yok. Önce 'arastir' komutuyla hisseleri araştırın.")
    for s in sonuclar:
        durum = "ONAY" if s.karar.emir is not None else "RED "
        print(f"[{zaman}] {durum} {s.emir.hisse} {s.emir.yon} {s.emir.adet:g} — {s.karar.gerekce}")
    if yol:
        print(f"Öneri dosyası: {yol}")


def komut_tara(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    db = baglan(ayarlar.veritabani)
    _tara_bir_kez(a, ayarlar, db, kaynak_olustur(a.veri, a.csv_klasoru))
    return 0


def komut_canli(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    piyasa = PIYASALAR[a.piyasa]
    db = baglan(ayarlar.veritabani)
    kaynak = kaynak_olustur(a.veri, a.csv_klasoru)
    print(f"Canlı sanal işlem başladı: {piyasa.kod.upper()}, {a.aralik} çubuk, her {a.dakika} dakikada bir. Ctrl+C ile durur.")
    son_cozum_gunu = None
    try:
        while True:
            an = datetime.now().astimezone()
            gun = pd.Timestamp(an).tz_convert(piyasa.saat_dilimi).date()
            if son_cozum_gunu != gun:
                n = tahminleri_coz(db, ZamanKilitliVeri(kaynak, an, canli=True), lambda p, h: PIYASALAR[p].sembol(h))
                if n:
                    print(f"{n} tahmin çözüldü.")
                son_cozum_gunu = gun
            if piyasa_acik_mi(an, piyasa) or a.saat_denetimi_kapali:
                try:
                    _tara_bir_kez(a, ayarlar, db, kaynak)
                except Exception as hata:  # ağ kesintisi vb. döngüyü durdurmasın
                    print(f"Tarama hatası: {hata}", file=sys.stderr)
            time.sleep(max(5.0, a.dakika * 60 - time.time() % 60))
    except KeyboardInterrupt:
        print("\nDurduruldu.")
    return 0


def komut_coz(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    db = baglan(ayarlar.veritabani)
    veri = ZamanKilitliVeri(kaynak_olustur(a.veri, a.csv_klasoru), datetime.now().astimezone(), canli=True)
    n = tahminleri_coz(db, veri, lambda p, h: PIYASALAR[p].sembol(h))
    print(f"{n} tahmin çözüldü.\n")
    print(karne(db).metin())
    return 0


def komut_rapor(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    db = baglan(ayarlar.veritabani)
    piyasalar = [a.piyasa] if a.piyasa else list(PIYASALAR)
    for kod in piyasalar:
        piyasa = PIYASALAR[kod]
        try:
            d = SanalAraci(db, piyasa).durum()
        except RuntimeError:
            continue
        print(f"\n== {kod.upper()} sanal portföy ({piyasa.para_birimi}) ==")
        print(f"Nakit: {d.nakit:,.2f}   Başlangıç: {ayarlar.baslangic_nakit[kod]:,.2f}")
        for h, (adet, maliyet) in d.pozisyonlar.items():
            print(f"  {h:<8} {adet:>10g} @ {maliyet:,.2f}")
        if d.durduruldu:
            print(f"  DURDURULDU: {d.durdurma_nedeni}  (yeniden-baslat komutuyla açılır)")
        tezler = db.execute(
            "SELECT hisse, an, karar, olasilik, ufuk_gun, ozet FROM tezler WHERE piyasa = ? ORDER BY an DESC LIMIT 10",
            (kod,),
        ).fetchall()
        if tezler:
            print("Son tezler:")
            for t in tezler:
                print(f"  {t['an'][:16]} {t['hisse']:<7} {t['karar']:<4} p={t['olasilik']:.0%} {t['ufuk_gun']}g — {t['ozet']}")
    print("\n== Tahmin karnesi ==")
    print(karne(db, piyasa=a.piyasa).metin())
    return 0


def komut_geriye_test(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    piyasa = PIYASALAR[a.piyasa]
    strateji = StratejiAyarlari(kisa_pencere=a.kisa, uzun_pencere=a.uzun, tezsiz_olasilik=a.tezsiz_olasilik)
    sonuc = geriye_test(
        kaynak_olustur(a.veri, a.csv_klasoru),
        piyasa,
        _hisseler(a.hisseler, ayarlar, a.piyasa),
        pd.Timestamp(a.baslangic).to_pydatetime(),
        pd.Timestamp(a.bitis).to_pydatetime(),
        a.nakit or ayarlar.baslangic_nakit[a.piyasa],
        ayarlar.risk,
        strateji,
        a.aralik,
        a.risksiz_oran,
    )
    print(sonuc.metin(piyasa.para_birimi))
    if a.veri == "sentetik":
        print("\n(Sentetik veri: yalnızca sistemin çalıştığını gösterir, piyasa hakkında bilgi vermez.)")
    return 0


def komut_veri_cek(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    piyasa = PIYASALAR[a.piyasa]
    vs = SaatlikVeriSeti(ayarlar.veri_klasoru, piyasa.saat_dilimi)
    semboller = [piyasa.sembol(h) for h in _hisseler(a.hisseler, ayarlar, a.piyasa)] + [piyasa.gosterge]
    bas = pd.Timestamp(a.baslangic).tz_localize(piyasa.saat_dilimi).to_pydatetime()
    rapor = vs.cek(kaynak_olustur(a.veri, a.csv_klasoru), semboller, bas, bes_dakika=not a.bes_dakika_yok)
    bolme = Bolme(Path(ayarlar.veri_klasoru) / "etiketler.csv", ayarlar.test_orani, ayarlar.tohum)
    for s, r in rapor.items():
        df = vs.yukle(s, "1h")
        if not df.empty:
            bolme.guncelle(list({z.date() for z in df.index}))
        print(f"{s:<10} 1h {r.get('satir_1h', 0):>6} satır  5m {r.get('satir_5m', 0):>6}  "
              f"çift {r['cift_zaman']} geçersiz {r['gecersiz_fiyat']} sıfır-hacim {r['sifir_hacim']} sıçrama {r['buyuk_sicrama']}")
    print(f"Gün etiketleri: {bolme.ozet()}  (dosya: {bolme.yol})")
    if a.veri == "yahoo":
        print("Not: Yahoo 1 saatlik veriyi yalnız son ~730 gün, 5 dakikalığı son ~60 gün verir.")
    return 0


def komut_egit(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    piyasa = PIYASALAR[a.piyasa]
    db = baglan(ayarlar.veritabani)
    hisseler = _hisseler(a.hisseler, ayarlar, a.piyasa)
    if a.kayma_kiyasla:
        print("Kayma kıyası (sıralama yalnız train korelasyonuna göre; test sütunu seçimde kullanılmaz):")
        print(kayma_karsilastir(ayarlar, piyasa, hisseler).to_string(index=False))
        print()
    try:
        s = egit_ve_olc(ayarlar, piyasa, hisseler, a.kayma, db)
    except ValueError as h:
        print(h)
        return 1
    print(s.metin(ayarlar.risk.min_net_getiri))
    return 0


def komut_ekip(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    piyasa = PIYASALAR[a.piyasa]
    an, canli = _an(a.an, piyasa.saat_dilimi)
    db = baglan(ayarlar.veritabani)
    son = db.execute("SELECT MAX(an) FROM tezler WHERE piyasa = ? AND model = 'ekip'", (piyasa.kod,)).fetchone()[0]
    if son and not a.zorla and canli:
        gecen = (pd.Timestamp(an) - pd.Timestamp(son)).days
        if gecen < ayarlar.ajan.arastirma_gun_araligi:
            print(f"Son ekip oturumu {gecen} gün önce; bütçe için {ayarlar.ajan.arastirma_gun_araligi} günde bir. --zorla ile geçilir.")
            return 0
    veri = ZamanKilitliVeri(kaynak_olustur(a.veri, a.csv_klasoru), an, canli=canli)
    egitim_ozeti = None
    satir = db.execute(
        "SELECT etiket, eylem, COUNT(*), AVG(odul), AVG(gerceklesen) FROM odul_gunlugu WHERE piyasa = ? GROUP BY 1, 2",
        (piyasa.kod,),
    ).fetchall()
    if satir:
        egitim_ozeti = "\n".join(f"{r[0]} {r[1]}: {r[2]} karar, ort. ödül {r[3]:+.4%}, ort. ham getiri {r[4]:+.4%}" for r in satir)
    try:
        ekip = Ekip(ayarlar.ajan, piyasa, veri, db, egitim_ozeti=egitim_ozeti,
                    tez_notu=ayarlar.tez_notu, cekirdek=ayarlar.saglam_cekirdek)  # fmt: skip
        sonuc = ekip.oturum(_hisseler(a.hisseler, ayarlar, a.piyasa))
    except TypeError as h:
        if "authentication" in str(h):
            print("Anthropic API anahtarı yok. `export ANTHROPIC_API_KEY=...` ile tanımlayın.")
            return 1
        raise
    except AjanHatasi as h:
        print(f"Oturum başarısız: {h}")
        return 1
    kimlikler = teslimi_kaydet(db, piyasa, veri, sonuc, "ekip")
    print(f"Haftalık not: {sonuc.teslim.haftalik_not}")
    if sonuc.teslim.model_notu:
        print(f"Model notu: {sonuc.teslim.model_notu}")
    for t in sonuc.teslim.tezler:
        print(f"  {t.hisse:<7} {t.karar:<4} p={t.olasilik:.0%} {t.ufuk_gun}g — {t.ozet}")
    print(f"{len(kimlikler)} tez kaydedildi; {len(sonuc.gorevler)} alt görev; {sonuc.girdi_token}+{sonuc.cikti_token} token")
    yol = Path(ayarlar.rapor_klasoru) / f"ekip-{piyasa.kod}-{pd.Timestamp(an):%Y%m%d}.json"
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(gorevleri_json(sonuc), encoding="utf-8")
    print(f"Görev kayıtları: {yol}")
    return 0


def komut_yeniden_baslat(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    SanalAraci(baglan(ayarlar.veritabani), PIYASALAR[a.piyasa]).yeniden_baslat()
    print(f"{a.piyasa.upper()} hesabı yeniden açıldı.")
    return 0


def ayristirici() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="yatirim_ajani", description="Araştıran, öneren, sanal işlem yapan yatırım ajanı")
    p.add_argument("--ayarlar", help="ayarlar.toml yolu")
    alt = p.add_subparsers(dest="komut", required=True)

    def ortak(sp: argparse.ArgumentParser, hisseler: bool = True) -> None:
        sp.add_argument("--piyasa", choices=list(PIYASALAR), required=True)
        sp.add_argument("--veri", choices=["yahoo", "csv", "sentetik"], default="yahoo")
        sp.add_argument("--csv-klasoru")
        if hisseler:
            sp.add_argument("--hisseler", help="Virgülle ayrılmış; verilmezse ayarlardaki evren")

    def strateji(sp: argparse.ArgumentParser, aralik: str) -> None:
        sp.add_argument("--aralik", default=aralik, help="1m, 5m, 15m, 1h, 1d")
        sp.add_argument("--kisa", type=int, default=20, help="Kısa ortalama (çubuk)")
        sp.add_argument("--uzun", type=int, default=50, help="Uzun ortalama (çubuk)")

    sp = alt.add_parser("arastir", help="Claude ile hisseleri araştır, tez ve tahmin kaydet")
    ortak(sp)
    sp.add_argument("--an", help="Geçmiş bir karar anı (zaman kilitli mod), ör. 2025-06-30T18:00")
    sp.set_defaults(islev=komut_arastir)

    sp = alt.add_parser("tara", help="Bir kez tara: sinyal → risk → sanal işlem + Midas önerisi")
    ortak(sp)
    strateji(sp, "5m")
    sp.add_argument("--saat-denetimi-kapali", action="store_true", help="Piyasa kapalıyken de dene (test için)")
    sp.set_defaults(islev=komut_tara)

    sp = alt.add_parser("canli", help="Seans boyunca her N dakikada bir tara")
    ortak(sp)
    strateji(sp, "1m")
    sp.add_argument("--dakika", type=int, default=1)
    sp.add_argument("--saat-denetimi-kapali", action="store_true")
    sp.set_defaults(islev=komut_canli)

    sp = alt.add_parser("coz", help="Vadesi gelen tahminleri çöz ve karneyi göster")
    sp.add_argument("--veri", choices=["yahoo", "csv", "sentetik"], default="yahoo")
    sp.add_argument("--csv-klasoru")
    sp.set_defaults(islev=komut_coz)

    sp = alt.add_parser("rapor", help="Sanal portföy, son tezler ve tahmin karnesi")
    sp.add_argument("--piyasa", choices=list(PIYASALAR))
    sp.set_defaults(islev=komut_rapor)

    sp = alt.add_parser("geriye-test", help="Kurallı katmanı geçmişte test et, al-tut ile kıyasla")
    ortak(sp)
    strateji(sp, "1d")
    sp.add_argument("--baslangic", required=True)
    sp.add_argument("--bitis", required=True)
    sp.add_argument("--nakit", type=float)
    sp.add_argument("--tezsiz-olasilik", type=float, default=0.7, help="Tez yerine varsayılan olasılık")
    sp.add_argument("--risksiz-oran", type=float, default=0.0, help="Yıllık; BIST için mevduat/politika faizi girin")
    sp.set_defaults(islev=komut_geriye_test)

    sp = alt.add_parser("veri-cek", help="Saatlik (ve 5 dk) çubukları çek, temizle, gün etiketle")
    ortak(sp)
    sp.add_argument("--baslangic", default="2024-01-01")
    sp.add_argument("--bes-dakika-yok", action="store_true", help="Kaymalı saat için 5 dk veriyi çekme")
    sp.set_defaults(islev=komut_veri_cek)

    sp = alt.add_parser("egit", help="Saatlik bandit modelini train günlerinde eğit, test günlerinde ölç")
    ortak(sp)
    sp.add_argument("--kayma", type=int, default=0, help="Saat kayması dk (0, 15, 30, 45)")
    sp.add_argument("--kayma-kiyasla", action="store_true", help="Kaymaları train verisinde kıyasla")
    sp.set_defaults(islev=komut_egit)

    sp = alt.add_parser("ekip", help="Haftalık ekip oturumu: Fable baş, Opus analist, Sonnet mühendis, Haiku stajyer")
    ortak(sp)
    sp.add_argument("--an", help="Geçmiş karar anı (zaman kilitli)")
    sp.add_argument("--zorla", action="store_true", help="Haftalık aralığı bekleme")
    sp.set_defaults(islev=komut_ekip)

    sp = alt.add_parser("yeniden-baslat", help="Düşüş sınırıyla durmuş sanal hesabı yeniden aç")
    sp.add_argument("--piyasa", choices=list(PIYASALAR), required=True)
    sp.set_defaults(islev=komut_yeniden_baslat)
    return p


def main(argv: list[str] | None = None) -> int:
    a = ayristirici().parse_args(argv)
    return int(a.islev(a, ayarlari_yukle(a.ayarlar)))
