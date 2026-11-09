"""Komut satırı: python -m ithalat_ajani <komut> --help"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

from .aday import AdayHatasi, aday_oku
from .ayarlar import Ayarlar, ayarlari_yukle
from .degerlendir import DURUMLAR, degerlendir_aday, toplu_degerlendir
from .depo import baglan, gecmis, kategori_son_tarama, onceki_olcum, tarama_kaydet
from .kur import Kur, KurHatasi, elle_kur, kur_getir
from .bicim import sayi, tl, tr_saati, usd, yuzde
from .rapor import RaporGirdisi, ozet_metni, rapor_yaz
from .tarife import Tarife, TarifeHatasi, tarife_oku, varsayilan_tarife

KIS_AYLARI = (11, 12, 1, 2)
YAZ_AYLARI = (6, 7, 8)


def _tarife(ayarlar: Ayarlar) -> Tarife:
    return tarife_oku(ayarlar.tarife) if ayarlar.tarife else varsayilan_tarife()


def _kur(ayarlar: Ayarlar, elle: float | None, yenile: bool = False) -> Kur:
    if elle is not None:
        return elle_kur(elle)
    return kur_getir(ayarlar.kur.onbellek, ayarlar.kur.yedek_usd_tl, yenile=yenile)


def _an(metin: str | None) -> datetime:
    return tr_saati(datetime.fromisoformat(metin) if metin else None)


def komut_kur(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    kur = _kur(ayarlar, None, yenile=a.yenile)
    eur = f" · 1 EUR = {sayi(kur.eur_tl, 4)} TL" if kur.eur_tl else ""
    print(f"1 USD = {sayi(kur.usd_tl, 4)} TL{eur} ({kur.aciklama()})")
    return 0 if kur.kaynak != "yedek" else 1


def siradaki_kategoriler(tarife: Tarife, ayarlar: Ayarlar, son: dict[str, str], adet: int, ay: int) -> list[str]:
    """En uzun süredir taranmamış kategoriler; mevsim dışı olanlar sona."""
    havuz = [k for k in (ayarlar.tarama.odak or list(tarife.kategoriler)) if k in tarife.kategoriler]

    def mevsim_disi(anahtar: str) -> bool:
        mevsim = tarife.kategoriler[anahtar].mevsim
        return (mevsim == "yaz" and ay in KIS_AYLARI) or (mevsim == "kis" and ay in YAZ_AYLARI)

    sirali = sorted(havuz, key=lambda k: (mevsim_disi(k), son.get(k, ""), havuz.index(k)))
    return sirali[:adet]


def komut_kategoriler(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    tarife = _tarife(ayarlar)
    if a.siradaki:
        son = kategori_son_tarama(baglan(ayarlar.veritabani)) if Path(ayarlar.veritabani).exists() else {}
        ay = a.ay or date.today().month
        for k in siradaki_kategoriler(tarife, ayarlar, son, a.siradaki, ay):
            print(k)
        return 0
    print(f"Vergi tablosu sürümü {tarife.surum} (Çin menşeli, ticari ithalat)\n")
    print(f"{'anahtar':<22} {'GV':>5} {'İGV':>5} {'KDV':>5} {'kg':>6}  {'güven':<9} ad")
    for k in tarife.kategoriler.values():
        print(
            f"{k.anahtar:<22} {yuzde(k.gv):>5} {yuzde(k.igv):>5} {yuzde(k.kdv):>5} {sayi(k.ornek_agirlik_kg, 2):>6}"
            f"  {k.guven:<9} {k.ad}"
        )
    return 0


def komut_hesapla(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    tarife = _tarife(ayarlar)
    ali: dict = {"url": "http://elle-girildi", "fiyat_usd": a.fiyat_usd, "moq": a.moq}
    if a.agirlik_kg is not None:
        ali.update(birim_agirlik_kg=a.agirlik_kg, agirlik_kaynagi="ilan")
    if a.olcu:
        ali["olcu_cm"] = [float(x) for x in a.olcu.lower().split("x")]
    if a.indirimsiz_usd:
        ali["indirim"] = {"liste_fiyat_usd": a.indirimsiz_usd}
    ham = {
        "urun": a.urun or "Elle hesap",
        "kategori": a.kategori,
        "alibaba": ali,
        "turkiye": {"fiyatlar": [{"fiyat_tl": f, "kaynak": "elle"} for f in a.tr_fiyat]},
    }
    try:
        aday = aday_oku(ham, tarife)
        kur = _kur(ayarlar, a.kur)
    except (AdayHatasi, KurHatasi, ValueError) as hata:
        print(f"Hata: {hata}", file=sys.stderr)
        return 2
    s = degerlendir_aday(aday, tarife, kur.usd_tl, ayarlar)
    d, sat = s.dokum, s.satis
    print(f"{s.kategori.ad} · 1 USD = {sayi(kur.usd_tl, 2)} TL ({kur.aciklama()})")
    print(f"  Mal            {usd(d.mal_usd):>12} {tl(d.mal_tl):>14}")
    print(f"  Ödeme payı     {usd(d.odeme_usd):>12} {tl(d.odeme_tl):>14}")
    print(f"  Kargo          {usd(d.kargo_usd):>12} {tl(d.kargo_tl):>14}   ({sayi(d.ucretli_kg, 3)} kg)")
    print(f"  Sigorta        {usd(d.sigorta_usd):>12} {tl(d.sigorta_tl):>14}")
    print(f"  GV  {yuzde(s.kategori.gv):>5}                  {tl(d.gv_tl):>14}")
    print(f"  İGV {yuzde(s.kategori.igv):>5}                  {tl(d.igv_tl):>14}" + (" (tahmini)" if s.kategori.tahmini else ""))
    if d.emy_tl:
        print(f"  EMY                          {tl(d.emy_tl):>14}")
    print(f"  Sabit pay                    {tl(d.sabit_pay_tl):>14}")
    print(f"  Birim maliyet (KDV hariç)    {tl(d.birim_maliyet_tl):>14}")
    print(f"  İthalat KDV'si (indirilir)   {tl(d.ithalat_kdv_tl):>14}")
    print(f"Türkiye medyan {tl(s.tr.medyan)} → KDV hariç {tl(sat.satis_net_tl)} → kat {sayi(s.kat, 2)} → {s.durum}")
    print(f"Pazaryerinde tahmini kâr {tl(sat.birim_kar_tl)}/adet (marj {yuzde(sat.kar_marji)})")
    for baslik, liste in (("Avantaj", s.avantajlar), ("Doğrula", s.dogrula), ("Not", s.notlar)):
        for x in liste:
            print(f"  {baslik}: {x}")
    return 0


def _rapor_yolu(klasor: Path, an: datetime) -> Path:
    klasor.mkdir(parents=True, exist_ok=True)
    yol = klasor / f"tarama-{an:%Y%m%d-%H%M}.md"
    sayac = 2
    while yol.exists():
        yol = klasor / f"tarama-{an:%Y%m%d-%H%M}-{sayac}.md"
        sayac += 1
    return yol


def komut_degerlendir(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    try:
        veri = json.loads(Path(a.dosya).read_text(encoding="utf-8"))
    except (OSError, ValueError) as hata:
        print(f"Dosya okunamadı: {hata}", file=sys.stderr)
        return 2
    if isinstance(veri, list):
        veri = {"adaylar": veri}
    adaylar = veri.get("adaylar") if isinstance(veri, dict) else None
    if not isinstance(adaylar, list):
        print("JSON'da 'adaylar' listesi yok", file=sys.stderr)
        return 2
    meta = veri.get("tarama") or {}
    tarife = _tarife(ayarlar)
    try:
        elle = a.kur if a.kur is not None else meta.get("kur_usd")
        kur = _kur(ayarlar, float(elle) if elle is not None else None)
        an = _an(meta.get("an"))
    except (KurHatasi, TypeError, ValueError) as hata:
        print(f"Kur ya da tarih okunamadı: {hata}", file=sys.stderr)
        return 2

    sonuclar, okunamayan = toplu_degerlendir(adaylar, tarife, kur.usd_tl, ayarlar)
    kategoriler = list(meta.get("kategoriler") or sorted({s.aday.kategori for s in sonuclar}))
    db = None if a.kaydetme else baglan(ayarlar.veritabani)
    onceki = {s.aday.url: onceki_olcum(db, s.aday.url, an.isoformat()) for s in sonuclar} if db else {}
    girdi = RaporGirdisi(
        an=an, kur=kur, sonuclar=sonuclar, okunamayan=okunamayan, kategoriler=kategoriler,
        notu=str(meta.get("not", "")), onceki=onceki,
    )  # fmt: skip
    metin = rapor_yaz(girdi, ayarlar, tarife)
    yol = _rapor_yolu(Path(a.rapor_klasoru or ayarlar.rapor_klasoru), an)
    yol.write_text(metin, encoding="utf-8")
    if db is not None:
        tarama_kaydet(db, an.isoformat(), kur.usd_tl, kur.aciklama(), kategoriler, girdi.notu, sonuclar, str(yol))
    ozet = ozet_metni(girdi, ayarlar)
    if a.ozet_dosyasi:
        Path(a.ozet_dosyasi).write_text(ozet + "\n", encoding="utf-8")
    print(ozet)
    print(f"\nRapor: {yol}" + ("" if db is not None else " (veritabanına yazılmadı)"))
    for o in okunamayan:
        print(f"Okunamadı #{o.sira} {o.urun}: {o.neden}", file=sys.stderr)
    return 0


def komut_gecmis(a: argparse.Namespace, ayarlar: Ayarlar) -> int:
    if not Path(ayarlar.veritabani).exists():
        print("Henüz tarama yok.")
        return 0
    satirlar = gecmis(baglan(ayarlar.veritabani), gun=a.gun, durumlar=a.durum, min_kat=a.min_kat)
    if a.json:
        print(json.dumps([dict(s) for s in satirlar], ensure_ascii=False, indent=1))
        return 0
    for s in satirlar:
        print(
            f"{s['an'][:10]}  {s['durum']:<13} kat {sayi(s['kat'], 2):>5}  {s['kategori']:<20}"
            f"  {usd(s['fiyat_usd']):>9} → {tl(s['tr_medyan_tl']):>9}  {s['urun']}  {s['url']}"
        )
    return 0


def ayristirici() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="ithalat_ajani", description="Alibaba adaylarını Türkiye fiyatıyla tüm masraflarıyla karşılaştırır"
    )
    p.add_argument("--ayarlar", help="ayarlar.toml yolu (varsayılan: çalışma klasöründeki ayarlar.toml)")
    alt = p.add_subparsers(dest="komut", required=True)

    sp = alt.add_parser("kur", help="TCMB döviz satış kurunu getir (önbellekli)")
    sp.add_argument("--yenile", action="store_true", help="önbelleği yok say")
    sp.set_defaults(fonk=komut_kur)

    sp = alt.add_parser("kategoriler", help="Vergi tablosu; --siradaki N ile taranacak kategoriler")
    sp.add_argument("--siradaki", type=int, default=0, help="sıradaki N kategoriyi yaz (rotasyon + mevsim)")
    sp.add_argument("--ay", type=int, choices=range(1, 13), help="mevsim hesabı için ay (varsayılan: bu ay)")
    sp.set_defaults(fonk=komut_kategoriler)

    sp = alt.add_parser("hesapla", help="Tek ürün için hızlı hesap")
    sp.add_argument("--kategori", required=True)
    sp.add_argument("--fiyat-usd", type=float, required=True, help="birim fiyat ($)")
    sp.add_argument("--tr-fiyat", type=float, action="append", required=True, help="Türkiye fiyatı TL (tekrarlanabilir)")
    sp.add_argument("--agirlik-kg", type=float, help="birim ağırlık; yoksa kategori ortalaması")
    sp.add_argument("--olcu", help="ambalajlı ölçü cm, ör. 30x20x5")
    sp.add_argument("--moq", type=int, default=1)
    sp.add_argument("--indirimsiz-usd", type=float, help="Alibaba indirimdeyse indirimsiz birim fiyat ($)")
    sp.add_argument("--urun", help="ürün adı")
    sp.add_argument("--kur", type=float, help="USD/TL elle")
    sp.set_defaults(fonk=komut_hesapla)

    sp = alt.add_parser("degerlendir", help="Aday JSON dosyasını değerlendir, rapor yaz, geçmişe kaydet")
    sp.add_argument("dosya")
    sp.add_argument("--kur", type=float, help="USD/TL elle (yoksa dosyadaki kur_usd, o da yoksa TCMB)")
    sp.add_argument("--rapor-klasoru")
    sp.add_argument("--ozet-dosyasi", help="kısa özeti bu dosyaya da yaz (Issue/bildirim için)")
    sp.add_argument("--kaydetme", action="store_true", help="veritabanına yazma (deneme)")
    sp.set_defaults(fonk=komut_degerlendir)

    sp = alt.add_parser("gecmis", help="Daha önce değerlendirilen ilanlar (son ölçüm)")
    sp.add_argument("--gun", type=int, help="son N gün")
    sp.add_argument("--durum", nargs="+", choices=DURUMLAR)
    sp.add_argument("--min-kat", type=float, help="yalnız katı en az bu olanlar (takip listesi için ör. 2)")
    sp.add_argument("--json", action="store_true")
    sp.set_defaults(fonk=komut_gecmis)
    return p


def main(argv: list[str] | None = None) -> int:
    a = ayristirici().parse_args(argv)
    try:
        ayarlar = ayarlari_yukle(a.ayarlar)
    except (OSError, ValueError) as hata:
        print(f"Ayarlar okunamadı: {hata}", file=sys.stderr)
        return 2
    try:
        return a.fonk(a, ayarlar)
    except TarifeHatasi as hata:
        print(f"Vergi tablosu: {hata}", file=sys.stderr)
        return 2
