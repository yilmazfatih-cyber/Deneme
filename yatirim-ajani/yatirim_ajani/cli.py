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
    n = tahminleri_coz(db, veri, lambda p, h: PIYASALAR[p].sembol(h), a.aralik)
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


def komut_tez_yukle(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    """Claude Code ekip oturumunun ürettiği tez JSON'unu veritabanına ve tahmin günlüğüne yazar.

    Dosya biçimi: {"an": "2026-11-10T08:30+03:00", "haftalik_not": "...", "tezler": [TezCiktisi, ...]}
    Giriş fiyatı, çekilmiş saatlik veriden (veri_klasoru) karar anına göre bulunur; JSON'da
    "giris_fiyati" verilmişse o kullanılır.
    """
    import json

    from .arastirma.ajan import ArastirmaSonucu
    from .arastirma.sema import TezCiktisi
    from pydantic import ValidationError

    piyasa = PIYASALAR[a.piyasa]
    ham = json.loads(Path(a.dosya).read_text(encoding="utf-8"))
    an_ts = pd.Timestamp(ham.get("an") or datetime.now().astimezone())
    if an_ts.tzinfo is None:
        an_ts = an_ts.tz_localize(piyasa.saat_dilimi)
    an = an_ts.to_pydatetime()
    db = baglan(ayarlar.veritabani)
    vs = SaatlikVeriSeti(ayarlar.veri_klasoru, piyasa.saat_dilimi)
    veri = ZamanKilitliVeri(kaynak_olustur("csv", ayarlar.veri_klasoru), an, canli=False)
    satirlar = [f"# Haftalık ekip oturumu — {piyasa.kod.upper()} — {an_ts:%Y-%m-%d %H:%M}", ""]
    if ham.get("haftalik_not"):
        satirlar += [ham["haftalik_not"], ""]
    satirlar += ["| Hisse | Karar | Olasılık | Ufuk | Eşik | Giriş | Adil değer | Özet |", "|---|---|---|---|---|---|---|---|"]
    kimlikler = []
    for t_ham in ham.get("tezler", []):
        try:
            t = TezCiktisi.model_validate(t_ham)
        except ValidationError as h:
            print(f"Geçersiz tez atlandı: {h}")
            continue
        fiyat = t_ham.get("giris_fiyati")
        if fiyat is None:
            df = vs.saatlik(piyasa.sembol(t.hisse))
            df = df[df.index <= an_ts]
            fiyat = float(df["kapanis"].iloc[-1]) if not df.empty else None
        kimlik = tez_kaydet(db, piyasa, ArastirmaSonucu(tez=t, giris_fiyati=fiyat, tur_sayisi=0), veri, a.model)
        kimlikler.append(kimlik)
        adil = (
            f"{t.adil_deger_alt:,.0f}–{t.adil_deger_ust:,.0f}"
            if t.adil_deger_alt is not None and t.adil_deger_ust is not None
            else "-"
        )
        satirlar.append(
            f"| {t.hisse} | {t.karar} | {t.olasilik:.0%} | {t.ufuk_gun}g | {t.esik_getiri:+.0%} | "
            f"{fiyat if fiyat is None else f'{fiyat:,.2f}'} | {adil} | {t.ozet} |"
        )
    satirlar += ["", "Bu bir yatırım tavsiyesi değildir; sanal portföy ve tahmin karnesi içindir."]
    yol = Path(ayarlar.rapor_klasoru) / f"ekip-{piyasa.kod}-{an_ts:%Y%m%d}.md"
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text("\n".join(satirlar) + "\n", encoding="utf-8")
    print(f"{len(kimlikler)} tez kaydedildi (giriş fiyatı olmayanlar tahmin günlüğüne girmez). Rapor: {yol}")
    return 0 if kimlikler else 1


def komut_bilgi_olaylar(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    """Veriden sayısal olayları çıkarır, bilgi veritabanına yazar, anlamlandırma için JSON döker."""
    import json

    from .bilgi import ekle, tum_olaylar

    piyasa = PIYASALAR[a.piyasa]
    vs = SaatlikVeriSeti(ayarlar.veri_klasoru, piyasa.saat_dilimi)
    db = baglan(ayarlar.veritabani)
    olaylar = tum_olaylar(vs, piyasa, _hisseler(a.hisseler, ayarlar, a.piyasa))
    for o in olaylar:
        ekle(db, o)
    sayim = {}
    for o in olaylar:
        sayim[(o.kapsam, o.tur)] = sayim.get((o.kapsam, o.tur), 0) + 1
    print(f"{len(olaylar)} sayısal olay kaydedildi:")
    for (k, t), n in sorted(sayim.items()):
        print(f"  {k:<12} {t:<9} {n}")
    if a.json_cikti:
        Path(a.json_cikti).parent.mkdir(parents=True, exist_ok=True)
        Path(a.json_cikti).write_text(
            json.dumps([o.model_dump(exclude_none=True) for o in olaylar], ensure_ascii=False, indent=1), encoding="utf-8"
        )
        print(f"JSON: {a.json_cikti}")
    return 0


def komut_bilgi_yukle(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    """Dil modelinin ya da kullanıcının yazdığı anlamlı olayları (JSON) bilgi veritabanına ekler.

    Biçim: {"olaylar": [Olay, ...]} ya da düz liste. Aynı anahtarlı sayısal kayıt varsa metni güncellenir.
    """
    import json

    from pydantic import ValidationError

    from .bilgi import Olay, OlayPaketi, ekle

    ham = json.loads(Path(a.dosya).read_text(encoding="utf-8"))
    liste = ham if isinstance(ham, list) else ham.get("olaylar", [])
    ESANLAM = {"piyasa": "yerel_makro", "makro": "yerel_makro", "global": "kuresel", "sirket": "sirket", "şirket": "sirket", "sektör": "sektor"}
    for o in liste:
        if isinstance(o, dict):
            o["kapsam"] = ESANLAM.get(str(o.get("kapsam", "")).lower(), o.get("kapsam"))
            if o.get("hisse") in ("", "null"):
                o["hisse"] = None
            if o.get("guven") is not None:
                o["guven"] = min(max(float(o["guven"]), 0.0), 1.0)
            if o.get("yon") not in ("olumlu", "olumsuz", "notr"):
                # Yön verilmediyse NÖTR kalır. Gerçekleşen getiriden türetmek geleceği bilmek olur.
                o["yon"] = "notr"
    try:
        paket = OlayPaketi.model_validate({"olaylar": liste})
    except ValidationError as h:
        print(f"Geçersiz dosya: {h}")
        return 1
    db = baglan(ayarlar.veritabani)
    n = 0
    for o in paket.olaylar:
        if o.hisse and o.hisse.upper().startswith("TERA"):
            continue
        if o.kaynak_tipi == "metin" and any(getattr(o, k) is not None for k in ("getiri", "endekse_gore")):
            o.kaynak_tipi = "birlesik"
        ekle(db, Olay.model_validate(o.model_dump()))
        n += 1
    print(f"{n} olay yüklendi.")
    return 0


def komut_bilgi_sorgu(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    from .bilgi import ozet_metni, sorgula

    db = baglan(ayarlar.veritabani)
    baslangic = None
    if a.son:
        baslangic = (datetime.now() - pd.Timedelta(days=a.son)).date().isoformat()
    df = sorgula(db, hisse=a.hisse, sektor=a.sektor, kapsam=a.kapsam, baslangic=baslangic, metin=a.metin, limit=a.limit)
    print(ozet_metni(df, uzun=not a.kisa))
    return 0


def komut_bilgi_benzer(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    """Bugünkü sayısal duruma (son 20 gün) en çok benzeyen geçmiş olaylar ve o zaman ne olduğu."""
    from .bilgi import benzer, bugunku_durum, ozet_metni

    piyasa = PIYASALAR[a.piyasa]
    vs = SaatlikVeriSeti(ayarlar.veri_klasoru, piyasa.saat_dilimi)
    db = baglan(ayarlar.veritabani)
    hisseler = [a.hisse.upper()] if a.hisse else _hisseler(None, ayarlar, a.piyasa)
    for h in hisseler:
        durum = bugunku_durum(vs, piyasa, h)
        if not durum:
            continue
        df = benzer(db, durum, hisse=None if a.tum_hisseler else h, k=a.k)
        if df.empty:
            continue
        ozet = ", ".join(f"{k} {v:+.2f}" for k, v in durum.items() if v is not None)
        print(f"\n== {h}  bugün: {ozet}")
        print(ozet_metni(df, uzun=not a.kisa))
    return 0


def komut_simule(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    """Strateji ailesini 1M TL ile simüle eder; üç ölçüm; model eşiği yalnız ilk yılda seçilir."""
    from .ogrenme.simulasyon import (
        STRATEJILER, ModelKapili, gunluk_ozellikler, hedef_ertesi_gun, kesme_indeksi, model_egit_ve_tahmin,
        panel_kur, simule, uc_olcum, uzun_tablo,
    )  # fmt: skip

    piyasa = PIYASALAR[a.piyasa]
    vs = SaatlikVeriSeti(ayarlar.veri_klasoru, piyasa.saat_dilimi)
    bolme = Bolme(Path(ayarlar.veri_klasoru) / "etiketler.csv", ayarlar.test_orani, ayarlar.tohum)
    panel = panel_kur(vs, piyasa, _hisseler(a.hisseler, ayarlar, a.piyasa))
    if len(panel.gunler) < 60:
        print("Simülasyon için en az 60 gün gerekir; önce veri-cek.")
        return 1
    kes = kesme_indeksi(panel, a.secim_ay)
    nakit = a.nakit or ayarlar.baslangic_nakit[a.piyasa]
    c = (piyasa.spread_bps + piyasa.kayma_bps) / 10_000 + piyasa.komisyon_orani
    satirlar = [
        f"# Strateji simülasyonu — {piyasa.kod.upper()} — {panel.gunler[0].date()} → {panel.gunler[-1].date()}",
        "",
        f"Başlangıç {nakit:,.0f} {piyasa.para_birimi}; {len(panel.hisseler)} hisse; tek yön maliyet {c:.2%}.",
        f"Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk {a.secim_ay} ay (→ {panel.gunler[kes].date()}); "
        "ileriye yürüyen ölçüm sonrası.",
        "",
        "| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |",
        "|---|---|---|---|---|---|",
    ]
    sonuclar = {}
    for ad, st in STRATEJILER.items():
        r = uc_olcum(panel, st, ad, nakit, c, bolme, kes)
        sonuclar[ad] = r
        satirlar.append(
            f"| {ad} | {r['tum_donem'].bitis:,.0f} ({r['tum_donem'].getiri:+.1%}) | {r['test_gunleri'].bitis:,.0f} ({r['test_gunleri'].getiri:+.1%}) "
            f"| **{r['ileriye_yuruyen'].bitis:,.0f} ({r['ileriye_yuruyen'].getiri:+.1%})** | {r['ileriye_yuruyen'].max_dusus:.1%} | {r['ileriye_yuruyen'].islem_maliyeti:,.0f} |"
        )
    # Model kapılı: eşik ve model türü yalnız seçim penceresindeki ödüle göre
    g = vs.saatlik(piyasa.gosterge)
    gosterge = None
    if not g.empty:
        gun = pd.Series(pd.to_datetime(g.index.date), index=g.index)
        gosterge = g["kapanis"].groupby(gun).last()
    tablo = uzun_tablo(gunluk_ozellikler(panel, gosterge), hedef_ertesi_gun(panel), panel.gunler)
    tr = bolme.maske(pd.DatetimeIndex(tablo["gun"]), "train")
    bitis = panel.gunler[kes]
    en_iyi = None
    for tur in ("ridge", "mlp"):
        tah, bilgi = model_egit_ve_tahmin(tablo, bitis, tr, tur)
        for esik in (0.0, 0.0025, 0.005, 0.0075, 0.01):
            st = ModelKapili(tah, esik, 2 * c)
            secim = simule(panel, st, f"{tur}@{esik:.2%}", nakit, c, bit=kes)  # yalnız seçim penceresi (örnek içi)
            ileri = simule(panel, st, f"{tur}@{esik:.2%}", nakit, c, bas=kes)
            tum = simule(panel, st, f"{tur}@{esik:.2%}", nakit, c)
            test = simule(panel, st, f"{tur}@{esik:.2%}", nakit, c, gun_maskesi=bolme.maske(panel.gunler, "test"))
            satirlar.append(
                f"| model {tur} eşik {esik:.2%} | {tum.bitis:,.0f} ({tum.getiri:+.1%}) | {test.bitis:,.0f} ({test.getiri:+.1%}) "
                f"| **{ileri.bitis:,.0f} ({ileri.getiri:+.1%})** | {ileri.max_dusus:.1%} | {ileri.islem_maliyeti:,.0f} |"
            )
            if en_iyi is None or secim.odul > en_iyi[0]:
                en_iyi = (secim.odul, tur, esik, ileri, bilgi)
    assert en_iyi is not None
    _, tur, esik, ileri, bilgi = en_iyi
    satirlar += [
        "",
        f"Seçim penceresi ödülüne göre seçilen model: **{tur}, eşik {esik:.2%}** → ileriye yürüyen sonuç "
        f"**{ileri.bitis:,.0f} ({ileri.getiri:+.1%})**, maks düşüş {ileri.max_dusus:.1%}, maliyet {ileri.islem_maliyeti:,.0f}. "
        f"Dışarı korelasyon {bilgi.get('disari_korelasyon', float('nan')):.3f}.",
        "",
        "Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu "
        "bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve "
        "maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.",
        "",
        "Yatırım tavsiyesi değildir.",
    ]
    metin = "\n".join(satirlar)
    print(metin)
    yol = Path(ayarlar.rapor_klasoru) / f"simulasyon-{piyasa.kod}-{panel.gunler[-1]:%Y%m%d}.md"
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(metin + "\n", encoding="utf-8")
    print(f"\nRapor: {yol}")
    return 0


def komut_saglamlik(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    """Ezber testleri: etiket karıştırma, rejim kırılımı, maliyet stresi, deneme günlüğü + Deflated
    Sharpe, parametre bütçesi (1/100), kıyas modelleri (al-tut, momentum, haber kuralı)."""
    import json

    import numpy as np

    from .bilgi import sorgula
    from .ogrenme.saglamlik import (
        deflated_sharpe, deneme_kaydet, deneme_sayisi, gunluk_getiriler, gunluk_sharpe, haber_kurali,
        kural_parametreleri, mlp_parametreleri, rejim_kirilimi, rejimler, ridge_parametreleri,
    )  # fmt: skip
    from .ogrenme.simulasyon import (
        GUNLUK_OZELLIKLER, STRATEJILER, ModelKapili, gunluk_ozellikler, hedef_ertesi_gun, kesme_indeksi,
        model_egit_ve_tahmin, panel_kur, simule, uzun_tablo,
    )  # fmt: skip

    piyasa = PIYASALAR[a.piyasa]
    vs = SaatlikVeriSeti(ayarlar.veri_klasoru, piyasa.saat_dilimi)
    bolme = Bolme(Path(ayarlar.veri_klasoru) / "etiketler.csv", ayarlar.test_orani, ayarlar.tohum)
    db = baglan(ayarlar.veritabani)
    panel = panel_kur(vs, piyasa, _hisseler(a.hisseler, ayarlar, a.piyasa))
    kes = kesme_indeksi(panel, a.secim_ay)
    nakit = a.nakit or ayarlar.baslangic_nakit[a.piyasa]
    c = (piyasa.spread_bps + piyasa.kayma_bps) / 10_000 + piyasa.komisyon_orani
    g = vs.saatlik(piyasa.gosterge)
    gun = pd.Series(pd.to_datetime(g.index.date), index=g.index)
    gosterge = g["kapanis"].groupby(gun).last()
    rejim = rejimler(gosterge, panel.gunler)
    pencere = f"ileri:{panel.gunler[kes].date()}→{panel.gunler[-1].date()}"
    R: list[str] = [f"# Sağlamlık testleri — {piyasa.kod.upper()} — {datetime.now():%Y-%m-%d %H:%M}", "",
                    f"Ölçüm penceresi (ileriye yürüyen): {pencere}; seçim penceresi ilk {a.secim_ay} ay. Nakit {nakit:,.0f}, tek yön maliyet {c:.2%}.", ""]  # fmt: skip
    karar_sayisi_gunluk = int(panel.kapanis.iloc[kes:].notna().sum().sum())
    R.append(f"Karar anı (ileri pencerede, hisse×gün): {karar_sayisi_gunluk:,} → parametre bütçesi {karar_sayisi_gunluk // 100}.")
    R.append("")

    # --- Kıyas modelleri ---
    R += ["## 1. Kıyas modelleri (maliyet sonrası, ileriye yürüyen)", "", "| Model | Bitiş | Getiri | Sharpe | Maks düşüş | Maliyet 2× bitiş | Boğa | Ayı | Yatay |", "|---|---|---|---|---|---|---|---|---|"]
    def satir(ad, st, parametreler, aile):
        n = simule(panel, st, ad, nakit, c, bas=kes)
        x2 = simule(panel, st, ad, nakit, 2 * c, bas=kes)
        rk = rejim_kirilimi(n.egri, rejim).set_index("rejim")["toplam"] if len(n.egri) > 2 else pd.Series(dtype=float)
        deneme_kaydet(db, aile, n, parametreler, pencere)
        sr = gunluk_sharpe(n.egri)
        R.append(f"| {ad} | {n.bitis:,.0f} | {n.getiri:+.1%} | {('-' if sr is None else f'{sr:.2f}')} | {n.max_dusus:.1%} | {x2.bitis:,.0f} ({x2.getiri:+.1%}) "
                 f"| {rk.get('boga', float('nan')):+.1%} | {rk.get('ayi', float('nan')):+.1%} | {rk.get('yatay', float('nan')):+.1%} |")  # fmt: skip
        return n
    kiyas = {}
    kiyas["al_tut"] = satir("al-tut", STRATEJILER["al_tut"], {}, "kiyas")
    kiyas["momentum"] = satir("haftalık momentum (20g, ilk 10)", STRATEJILER["haftalik_momentum"], {"pencere": 20, "n": 10}, "kiyas")
    kiyas["trend"] = satir("trend 50g", STRATEJILER["trend_50"], {"pencere": 50}, "kiyas")
    olaylar = sorgula(db, limit=100000)
    n_olumlu = int(((olaylar.get("yon", pd.Series(dtype=str)) == "olumlu") & (olaylar["kaynak_tipi"] == "metin")).sum()) if not olaylar.empty else 0
    if n_olumlu >= 5:
        kiyas["haber"] = satir(f"haber olumluysa al ({n_olumlu} metin olay, 20g tut; yön LLM'ce sonradan etiketli)", haber_kurali(olaylar), {"tutma_gun": 20}, "kiyas")
    else:
        R.append(f"| haber olumluysa al | — | — | — | — | — | — | — | — | (bilgi veritabanında yönü 'olumlu' olan tarihli haber olayı: {n_olumlu}; en az 5 gerekir) |")
    R.append("")
    R.append(f"Rejim günleri (ileri pencere): {rejim.iloc[kes:].value_counts().to_dict()}")
    R.append("")

    # --- Modeller, deneme günlüğü, DSR ---
    tablo = uzun_tablo(gunluk_ozellikler(panel, gosterge), hedef_ertesi_gun(panel), panel.gunler)
    tr = bolme.maske(pd.DatetimeIndex(tablo["gun"]), "train")
    bitis = panel.gunler[kes]
    R += ["## 2. Modeller: deneme günlüğü ve Deflated Sharpe", ""]
    esikler = (0.0, 0.0025, 0.005, 0.0075, 0.01)
    denemeler = []
    param_raporlari = []
    for tur in ("ridge", "mlp"):
        tah, bilgi, model = model_egit_ve_tahmin(tablo, bitis, tr, tur, model_dondur=True)
        if tur == "ridge":
            param_raporlari.append(ridge_parametreleri(model, GUNLUK_OZELLIKLER, karar_sayisi_gunluk))
        else:
            param_raporlari.append(mlp_parametreleri(model, GUNLUK_OZELLIKLER, karar_sayisi_gunluk))
        for esik in esikler:
            st = ModelKapili(tah, esik, 2 * c)
            secim = simule(panel, st, f"{tur}@{esik:.2%}", nakit, c, bit=kes)
            ileri = simule(panel, st, f"{tur}@{esik:.2%}", nakit, c, bas=kes)
            x2 = simule(panel, st, f"{tur}@{esik:.2%}", nakit, 2 * c, bas=kes)
            deneme_kaydet(db, f"model_{tur}", ileri, {"esik": esik, **{k: v for k, v in bilgi.items() if isinstance(v, (int, float))}}, pencere)
            denemeler.append({"tur": tur, "esik": esik, "secim_odul": secim.odul, "ileri": ileri, "x2": x2,
                              "sharpe": gunluk_sharpe(ileri.egri), "rejim": rejim_kirilimi(ileri.egri, rejim) if len(ileri.egri) > 2 else None})  # fmt: skip
    N = deneme_sayisi(db, pencere)
    secilen = max(denemeler, key=lambda d: d["secim_odul"])
    sr_list = [d["sharpe"] for d in denemeler if d["sharpe"] is not None]
    R.append("| Model | Eşik | Seçim ödülü (ilk yıl) | İleri bitiş | Sharpe | Maks düşüş | Maliyet 2× | Boğa | Ayı | Yatay |")
    R.append("|---|---|---|---|---|---|---|---|---|---|")
    for d in denemeler:
        rk = d["rejim"].set_index("rejim")["toplam"] if d["rejim"] is not None else pd.Series(dtype=float)
        isaret = " **(seçilen)**" if d is secilen else ""
        R.append(f"| {d['tur']}{isaret} | {d['esik']:.2%} | {d['secim_odul']:+.3f} | {d['ileri'].bitis:,.0f} ({d['ileri'].getiri:+.1%}) | "
                 f"{('-' if d['sharpe'] is None else f'{d["sharpe"]:.2f}')} | {d['ileri'].max_dusus:.1%} | {d['x2'].bitis:,.0f} "
                 f"| {rk.get('boga', float('nan')):+.1%} | {rk.get('ayi', float('nan')):+.1%} | {rk.get('yatay', float('nan')):+.1%} |")  # fmt: skip
    R.append("")
    if secilen["sharpe"] is not None and len(secilen["ileri"].egri) > 10:
        d = deflated_sharpe(secilen["sharpe"], sr_list, gunluk_getiriler(secilen["ileri"].egri))
        R.append(f"Deneme günlüğünde bu pencere için toplam **{N} deneme** (bu koşu dahil). Seçilen modelin Sharpe'ı {secilen['sharpe']:.2f}; "
                 f"{d['deneme']} denemeden beklenen en büyük şans Sharpe'ı {d['beklenen_max_sharpe']:.2f}; **Deflated Sharpe olasılığı {d['dsr']:.2f}** "
                 f"(0,95 üstü anlamlı; 0,5 civarı şans).")  # fmt: skip
    else:
        R.append(f"Deneme günlüğünde bu pencere için toplam {N} deneme. Seçilen model işlem yapmadı; Sharpe tanımsız.")
    R.append("")

    # --- Etiket karıştırma ---
    R += ["## 3. Etiket karıştırma (sızıntı testi)", ""]
    rng = np.random.default_rng(ayarlar.tohum)
    karisik_sonuclar = []
    for i in range(a.karistirma):
        t2 = tablo.copy()
        idx = np.flatnonzero(tr & (t2["gun"] < bitis).to_numpy())
        t2.loc[t2.index[idx], "hedef"] = rng.permutation(t2["hedef"].to_numpy()[idx])
        tah2, bilgi2 = model_egit_ve_tahmin(t2, bitis, tr, secilen["tur"])
        ileri2 = simule(panel, ModelKapili(tah2, secilen["esik"], 2 * c), f"karisik{i}", nakit, c, bas=kes)
        karisik_sonuclar.append((bilgi2.get("disari_korelasyon", float("nan")), ileri2.getiri))
    gercek_kor = next((dn for dn in [None]), None)
    R.append(f"Seçilen model ({secilen['tur']}, eşik {secilen['esik']:.2%}) gerçek etiketle ileri getiri {secilen['ileri'].getiri:+.1%}.")
    R.append("Eğitim hedefleri karıştırılıp yeniden eğitildiğinde ({} tekrar):".format(a.karistirma))
    for kor, get in karisik_sonuclar:
        R.append(f"- dışarı korelasyon {kor:+.3f}, ileri getiri {get:+.1%}")
    ort_karisik = float(np.nanmean([g for _, g in karisik_sonuclar])) if karisik_sonuclar else float("nan")
    R.append(f"Karışık ortalama {ort_karisik:+.1%}. Gerçek sonuç karışık dağılımın içindeyse model sinyal değil gürültü/sızıntı taşıyor; "
             "karışık sonuçlar da pozitifse kazanç modelden değil piyasa sürüklenmesinden geliyor.")  # fmt: skip
    R.append("")

    # --- Parametre bütçesi ---
    R += ["## 4. Parametre bütçesi (her 100 karar anına 1 parametre)", ""]
    param_raporlari.append(kural_parametreleri("trend_50", {"pencere": 50}, karar_sayisi_gunluk))
    param_raporlari.append(kural_parametreleri("haftalik_momentum", {"pencere": 20, "n": 10}, karar_sayisi_gunluk))
    for pr in param_raporlari:
        R += ["```", pr.metin(), "```", ""]
    uygun = [pr.ad for pr in param_raporlari if pr.butce_icinde]
    R.append(f"Bütçeye uyan modeller: {', '.join(uygun) or 'yok'}. Bütçeyi aşanlar son testte kullanılmaz.")
    R.append("")
    R += ["## 5. Karar", "",
          "LLM ajanı ve sayısal model, kıyasları (al-tut, momentum, haber kuralı) maliyet sonrası ve rejimler arasında TUTARLI biçimde "
          "geçmiyorsa işe yaramıyor sayılır. Bu rapordaki sayılarla:", ""]  # fmt: skip
    en_iyi_kiyas = max(kiyas.items(), key=lambda kv: kv[1].bitis)
    R.append(f"- En iyi kıyas: {en_iyi_kiyas[0]} → {en_iyi_kiyas[1].bitis:,.0f}. Seçilen model → {secilen['ileri'].bitis:,.0f}. "
             + ("Model kıyası geçiyor." if secilen["ileri"].bitis > en_iyi_kiyas[1].bitis else "**Model kıyası geçemiyor.**"))  # fmt: skip
    R.append("- Parametre dökümü yukarıda; son test (veri unutturulup yalnız parametrelerle) için `veri/saatlik/model_*.json` dosyaları ve bu rapor yeter.")
    R.append("")
    R.append("Yatırım tavsiyesi değildir.")
    metin = "\n".join(R)
    print(metin)
    yol = Path(ayarlar.rapor_klasoru) / f"saglamlik-{piyasa.kod}-{panel.gunler[-1]:%Y%m%d}.md"
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(metin + "\n", encoding="utf-8")
    print(f"\nRapor: {yol}")
    return 0


def _agac_kurucu(a: argparse.Namespace, ayarlar: Ayarlar):
    from .bilgi import SEKTORLER, sorgula
    from .ogrenme.agac import AgacKurucu, ozellik_havuzu
    from .ogrenme.simulasyon import kesme_indeksi, panel_kur
    from .veri.saatlik import SaatlikVeriSeti as _VS

    piyasa = PIYASALAR[a.piyasa]
    vs = _VS(ayarlar.veri_klasoru, piyasa.saat_dilimi)
    db = baglan(ayarlar.veritabani)
    hisseler = _hisseler(a.hisseler, ayarlar, a.piyasa)
    panel = panel_kur(vs, piyasa, hisseler)
    g = vs.saatlik(piyasa.gosterge)
    gun = pd.Series(pd.to_datetime(g.index.date), index=g.index)
    gosterge = g["kapanis"].groupby(gun).last()
    hacim = {}
    for h in panel.hisseler:
        df = vs.saatlik(piyasa.sembol(h))
        hacim[h] = df["hacim"].groupby(pd.Series(pd.to_datetime(df.index.date), index=df.index)).sum()
    hacim = pd.DataFrame(hacim)
    olaylar = sorgula(db, limit=100000)
    oz, turler = ozellik_havuzu(panel, gosterge, hacim, olaylar, SEKTORLER)
    kes = kesme_indeksi(panel, a.secim_ay)
    c = (piyasa.spread_bps + piyasa.kayma_bps) / 10_000 + piyasa.komisyon_orani
    nakit = a.nakit or ayarlar.baslangic_nakit[a.piyasa]
    return AgacKurucu(panel, oz, turler, kes, c, nakit, a.esik, db=db), piyasa


def komut_agac(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    """Açgözlü parametre ağacı: tek başına en iyi parametreden başla, en çok iyileştireni ekle."""
    kurucu, piyasa = _agac_kurucu(a, ayarlar)
    agac = kurucu.kur(derinlik=a.derinlik, isin=a.isin)
    yol = Path(ayarlar.rapor_klasoru) / f"agac-{piyasa.kod}-{kurucu.panel.gunler[-1]:%Y%m%d}.json"
    agac.kaydet(yol)
    d = agac.dugumler
    en_iyi = max((x for x in d.values() if x.id >= 0), key=lambda x: x.dogrulama_odul)
    print(f"{len(d) - 1} düğüm, {len(kurucu.onbellek)} ayrı parametre kümesi denendi; ağaç: {yol}")
    print(f"Eşik {agac.esik:.2%}; seçim {agac.secim_penceresi}; ileri {agac.ileri_penceresi}")
    print("\nKök adayları (tek parametre, doğrulama ödülü):")
    for cid in d[-1].cocuklar:
        x = d[cid]
        print(f"  {x.eklenen:<18} [{x.tur}] ödül {x.dogrulama_odul:+.3f} kor {x.dogrulama_korelasyon:+.3f} işlem {x.dogrulama_islem} | ileri {x.ileri_getiri:+.1%} (bilgi)")
    print(f"\nDoğrulamada en iyi düğüm (#{en_iyi.id}, {len(en_iyi.parametreler)} parametre): {en_iyi.parametreler}")
    print(f"  doğrulama ödülü {en_iyi.dogrulama_odul:+.3f}, kor {en_iyi.dogrulama_korelasyon:+.3f} | ileri {en_iyi.ileri_getiri:+.1%} → {en_iyi.ileri_bitis:,.0f} (bilgi, seçimde kullanılmadı)")
    return 0


def komut_agac_degerlendir(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    """Budanmış parametre listesini (JSON: ["g1","mom20",...] ya da {"parametreler":[...]}) son teste sokar."""
    import json

    from .ogrenme.agac import agac_degerlendir

    ham = json.loads(Path(a.dosya).read_text(encoding="utf-8"))
    params = ham["parametreler"] if isinstance(ham, dict) else ham
    kurucu, piyasa = _agac_kurucu(a, ayarlar)
    bilinmeyen = [p for p in params if p not in kurucu.oz]
    if bilinmeyen:
        print(f"Bilinmeyen parametre: {bilinmeyen}")
        return 1
    r = agac_degerlendir(kurucu, params)
    print(f"Parametreler ({r['parametre_sayisi']}): {params}")
    print(f"Doğrulama ödülü {r['dogrulama_odul']:+.3f}, korelasyon {r['dogrulama_korelasyon']:+.3f}, işlem {r['dogrulama_islem']}")
    print(f"İleriye yürüyen: getiri {r['ileri_getiri']:+.1%} → {r['ileri_bitis']:,.0f}, işlem {r['ileri_islem']}")
    return 0


def komut_evrim(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    """Hücre bahçesi: su (sermaye) gerçekleşen getiriye göre dağılır; kuruyan silinir, kazanan dallanır."""
    from .bilgi import SEKTORLER, sorgula
    from .ogrenme.agac import ozellik_havuzu
    from .ogrenme.evrim import Bahce
    from .ogrenme.simulasyon import panel_kur

    piyasa = PIYASALAR[a.piyasa]
    vs = SaatlikVeriSeti(ayarlar.veri_klasoru, piyasa.saat_dilimi)
    db = baglan(ayarlar.veritabani)
    panel = panel_kur(vs, piyasa, _hisseler(a.hisseler, ayarlar, a.piyasa))
    g = vs.saatlik(piyasa.gosterge)
    gosterge = g["kapanis"].groupby(pd.Series(pd.to_datetime(g.index.date), index=g.index)).last()
    hacim = pd.DataFrame({h: (lambda df: df["hacim"].groupby(pd.Series(pd.to_datetime(df.index.date), index=df.index)).sum())(vs.saatlik(piyasa.sembol(h))) for h in panel.hisseler})
    oz, turler = ozellik_havuzu(panel, gosterge, hacim, sorgula(db, limit=100000), SEKTORLER)
    havuz = [p for p in oz if p not in ("ay_sonu",)]
    c = ((piyasa.spread_bps + piyasa.kayma_bps) / 10_000 + piyasa.komisyon_orani) * a.maliyet_carpani
    nakit = a.nakit or ayarlar.baslangic_nakit[a.piyasa]
    bahce = Bahce(panel, oz, c, nakit, havuz, tohum=a.tohum if a.tohum is not None else ayarlar.tohum, eta=a.eta, dongu=a.dongu, max_hucre=a.max_hucre, isinma=a.isinma)
    s = bahce.calistir()
    yol = Path(ayarlar.rapor_klasoru) / f"evrim-{piyasa.kod}-{panel.gunler[-1]:%Y%m%d}.json"
    s.kaydet(yol)
    canli = [h for h in s.hucreler.values() if h.olum is None]
    kuruyan = [h for h in s.hucreler.values() if h.olum is not None]
    print(f"Bahçe {s.gunler[0]} → {s.gunler[-1]}: bitiş {s.egri.iloc[-1]:,.0f} ({s.egri.iloc[-1] / nakit - 1:+.1%}) | al-tut {s.al_tut_egri.iloc[-1]:,.0f} ({s.al_tut_egri.iloc[-1] / nakit - 1:+.1%}) | maliyet {s.maliyet_toplam:,.0f}")
    dd = float((s.egri / s.egri.cummax() - 1).min())
    print(f"Maks düşüş {dd:.1%}; toplam hücre {len(s.hucreler)}, canlı {len(canli)}, kurumuş {len(kuruyan)}; dallanma {sum(1 for o in s.olaylar if o['tur'] == 'dallandi')}")
    print("\nCanlı hücreler (su payı, kümülatif getiri):")
    for h in sorted(canli, key=lambda x: -(x.pay_gecmisi[-1] if x.pay_gecmisi else 0.0))[:10]:
        su = h.pay_gecmisi[-1] if h.pay_gecmisi else 0.0
        print(f"  #{h.id:<3} su {su:5.1%}  kümülatif {h.kumulatif:+7.1%}  {h.tur:<6} {h.parametreler} eşik {h.esik:.2%}")
    print(f"\nKayıt: {yol}")
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
    sp.add_argument("--aralik", default="1d", help="Vade fiyatı için çubuk aralığı (CSV kaynağında 1h)")
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
    sp.add_argument("--baslangic", default="2024-11-01", help="Yahoo 1 saatlik veriyi son ~730 gün verir; daha eskisi otomatik sınıra çekilir")
    sp.add_argument("--bes-dakika-yok", action="store_true", help="Kaymalı saat için 5 dk veriyi çekme")
    sp.set_defaults(islev=komut_veri_cek)

    sp = alt.add_parser("egit", help="Saatlik bandit modelini train günlerinde eğit, test günlerinde ölç")
    ortak(sp)
    sp.add_argument("--kayma", type=int, default=0, help="Saat kayması dk (0, 15, 30, 45)")
    sp.add_argument("--kayma-kiyasla", action="store_true", help="Kaymaları train verisinde kıyasla")
    sp.set_defaults(islev=komut_egit)

    sp = alt.add_parser("tez-yukle", help="Claude Code ekip oturumunun tez JSON'unu kaydet, rapor yaz")
    sp.add_argument("dosya")
    sp.add_argument("--piyasa", choices=list(PIYASALAR), required=True)
    sp.add_argument("--model", default="claude-code-ekip", help="Tezlerin kaynağı olarak kaydedilen etiket")
    sp.set_defaults(islev=komut_tez_yukle)

    sp = alt.add_parser("ekip", help="Haftalık ekip oturumu: Fable baş, Opus analist, Sonnet mühendis, Haiku stajyer")
    ortak(sp)
    sp.add_argument("--an", help="Geçmiş karar anı (zaman kilitli)")
    sp.add_argument("--zorla", action="store_true", help="Haftalık aralığı bekleme")
    sp.set_defaults(islev=komut_ekip)

    sp = alt.add_parser("simule", help="Strateji ailesi: al-tut, gece, gündüz, momentum, trend, model kapılı; 3 ölçüm")
    ortak(sp)
    sp.add_argument("--nakit", type=float)
    sp.add_argument("--secim-ay", type=int, default=12, help="İlk N ay seçim/eğitim, kalanı ileriye yürüyen ölçüm")
    sp.set_defaults(islev=komut_simule)

    sp = alt.add_parser("saglamlik", help="Ezber testleri: etiket karıştırma, rejim, maliyet 2×, deneme günlüğü + Deflated Sharpe, parametre bütçesi")
    ortak(sp)
    sp.add_argument("--nakit", type=float)
    sp.add_argument("--secim-ay", type=int, default=12)
    sp.add_argument("--karistirma", type=int, default=5, help="Etiket karıştırma tekrar sayısı")
    sp.set_defaults(islev=komut_saglamlik)

    sp = alt.add_parser("agac", help="Açgözlü parametre ağacı (sayısal + LLM sinyalleri); budama için JSON")
    ortak(sp)
    sp.add_argument("--nakit", type=float)
    sp.add_argument("--secim-ay", type=int, default=12)
    sp.add_argument("--esik", type=float, default=0.005)
    sp.add_argument("--derinlik", type=int, default=6)
    sp.add_argument("--isin", type=int, default=2, help="Her düğümde tutulan alternatif dal sayısı")
    sp.set_defaults(islev=komut_agac)

    sp = alt.add_parser("agac-degerlendir", help="Budanmış parametre listesini ileriye yürüyen testte değerlendir")
    sp.add_argument("dosya")
    ortak(sp)
    sp.add_argument("--nakit", type=float)
    sp.add_argument("--secim-ay", type=int, default=12)
    sp.add_argument("--esik", type=float, default=0.005)
    sp.set_defaults(islev=komut_agac_degerlendir)

    sp = alt.add_parser("evrim", help="Hücre bahçesi: su gerçekleşen getiriye göre dağılır, kuruyan silinir, kazanan dallanır")
    ortak(sp)
    sp.add_argument("--nakit", type=float)
    sp.add_argument("--eta", type=float, default=8.0, help="Su güncelleme hızı (çarpımsal ağırlık)")
    sp.add_argument("--dongu", type=int, default=21, help="Evrim döngüsü (işlem günü)")
    sp.add_argument("--max-hucre", type=int, default=14)
    sp.add_argument("--isinma", type=int, default=120, help="İlk eğitim için beklenen gün")
    sp.add_argument("--tohum", type=int, help="Mutasyon rastgeleliği (varsayılan ayarlardaki tohum)")
    sp.add_argument("--maliyet-carpani", type=float, default=1.0, help="Stres testi için 2.0")
    sp.set_defaults(islev=komut_evrim)

    sp = alt.add_parser("bilgi-olaylar", help="Veriden sayısal olayları çıkar (yükseliş/düşüş/şok/hacim), bilgi veritabanına yaz")
    ortak(sp)
    sp.add_argument("--json-cikti", help="Anlamlandırma için olay listesini bu JSON'a yaz")
    sp.set_defaults(islev=komut_bilgi_olaylar)

    sp = alt.add_parser("bilgi-yukle", help="Anlamlı olayları (JSON) bilgi veritabanına ekle")
    sp.add_argument("dosya")
    sp.set_defaults(islev=komut_bilgi_yukle)

    sp = alt.add_parser("bilgi-sorgu", help="Bilgi veritabanını sorgula (hisse/sektör/kapsam/metin/son N gün)")
    sp.add_argument("--piyasa", choices=list(PIYASALAR), default="bist")
    sp.add_argument("--hisse")
    sp.add_argument("--sektor")
    sp.add_argument("--kapsam", choices=["sirket", "sektor", "yerel_makro", "kuresel"])
    sp.add_argument("--metin", help="anlam/başlık/etiket içinde ara")
    sp.add_argument("--son", type=int, help="Son N gün")
    sp.add_argument("--limit", type=int, default=50)
    sp.add_argument("--kisa", action="store_true")
    sp.set_defaults(islev=komut_bilgi_sorgu)

    sp = alt.add_parser("bilgi-benzer", help="Bugünkü duruma sayısal olarak en çok benzeyen geçmiş olaylar")
    sp.add_argument("--piyasa", choices=list(PIYASALAR), default="bist")
    sp.add_argument("--hisse")
    sp.add_argument("--k", type=int, default=3)
    sp.add_argument("--tum-hisseler", action="store_true", help="Benzerliği yalnız aynı hissede değil tüm olaylarda ara")
    sp.add_argument("--kisa", action="store_true")
    sp.set_defaults(islev=komut_bilgi_benzer)

    sp = alt.add_parser("yeniden-baslat", help="Düşüş sınırıyla durmuş sanal hesabı yeniden aç")
    sp.add_argument("--piyasa", choices=list(PIYASALAR), required=True)
    sp.set_defaults(islev=komut_yeniden_baslat)
    return p


def main(argv: list[str] | None = None) -> int:
    a = ayristirici().parse_args(argv)
    return int(a.islev(a, ayarlari_yukle(a.ayarlar)))
