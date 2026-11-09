"""Komut satırı.

  kap-karar kur                       veri/*.json ve yatırım ajanı bilgi tabanını yükler, bağları kurar
  kap-karar analiz "<haber metni>"    metni sınıflandırır, ağaçta yürütür, benzer geçmiş olayları ve bağları gösterir
  kap-karar agac <tur>                bir ağacı çizer;  kap-karar agaclar  tüm türleri listeler
  kap-karar olaylar [--tur] [--hisse] [--baslangic] [--bitis] [--ara]
  kap-karar olay <kod|id>             olayın kararı ve bağları
  kap-karar zincir <kod|id>           olaydan ileriye doğru bağ zinciri
  kap-karar ekle --json dosya.json    yeni olaylar ekler (aynı biçim: {"olaylar": [...]})
  kap-karar ozet                      veritabanı özeti
  kap-karar disa-aktar [--md|--json]  tüm olayları karar ve bağlarıyla dışa aktarır
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from datetime import date
from pathlib import Path
from typing import Any

from . import depo, ice_aktar
from .agaclar import AGACLAR
from .motor import agac_metni, karar_metni, karar_ver, tum_agaclari_dogrula
from .sema import Olay
from .sinif import hisse_bul, siniflandir

VERI = Path(__file__).resolve().parent.parent / "veri"


def _param_coz(liste: list[str] | None) -> dict[str, Any]:
    p: dict[str, Any] = {}
    for s in liste or []:
        if "=" not in s:
            raise SystemExit(f"--param biçimi anahtar=deger olmalı: {s}")
        k, v = s.split("=", 1)
        v = v.strip()
        if v.lower() in ("true", "evet", "e"):
            p[k] = True
        elif v.lower() in ("false", "hayir", "hayır", "h"):
            p[k] = False
        else:
            try:
                p[k] = float(v.replace(",", "."))
            except ValueError:
                p[k] = v
    return p


def cmd_kur(a: argparse.Namespace) -> int:
    hatalar = tum_agaclari_dogrula()
    if hatalar:
        print("Ağaç hataları:", *hatalar, sep="\n  ")
        return 1
    db = depo.ac(a.db)
    toplam = 0
    hepsi: list[Olay] = []
    for dosya in sorted(VERI.glob("*.json")):
        eklenen = depo.json_yukle(db, dosya, bag_yaz=False)
        print(f"{dosya.name}: {len(eklenen)} olay")
        toplam += len(eklenen)
        hepsi += eklenen
    print(f"Elle bağ: {depo.elle_baglari_yaz(db, hepsi)}")
    if not a.ajansiz:
        ya = ice_aktar.yukle(Path(a.ajan_dizini) if a.ajan_dizini else None)
        for o in ya:
            depo.olay_ekle(db, o)
        print(f"yatirim-ajani/bilgi_kaynak: {len(ya)} olay")
        toplam += len(ya)
    n = depo.baglari_yeniden_kur(db)
    print(f"Toplam {toplam} olay işlendi; {n} otomatik bağ kuruldu.")
    _ozet_yaz(depo.ozet(db))
    return 0


def _ozet_yaz(s: dict[str, Any]) -> None:
    print(f"Olay: {s['olay']}  Karar: {s['karar']}  Bağ: {s['bag']}  Ağaç: {s['agac']}  Tarih: {s['tarih_araligi'][0]} → {s['tarih_araligi'][1]}")
    print("Kaynağa göre:", s["kaynaga_gore"])
    print("Eğilime göre:", s["egilime_gore"])
    print("Türe göre:", ", ".join(f"{k}={v}" for k, v in s["ture_gore"].items()))


def cmd_ozet(a: argparse.Namespace) -> int:
    _ozet_yaz(depo.ozet(depo.ac(a.db)))
    return 0


def cmd_agaclar(a: argparse.Namespace) -> int:
    for tur, ag in AGACLAR.items():
        yaprak = sum(1 for d in ag["dugumler"].values() if "sonuc" in d)
        print(f"{tur:32} {ag['kapsam']:12} {len(ag['dugumler']) - yaprak:2} soru / {yaprak:2} sonuç   {ag['ad']}")
    return 0


def cmd_agac(a: argparse.Namespace) -> int:
    print(agac_metni(a.tur))
    return 0


def _benzerler(db: Any, tur: str, hisse: str | None, sonuc_kodu: str, limit: int = 6) -> list[dict[str, Any]]:
    sql = """SELECT o.id, o.kod, o.tarih, o.baslik, o.hisse, k.egilim, k.sonuc_kodu FROM olaylar o JOIN kararlar k ON k.olay_id=o.id
             WHERE o.tur=? ORDER BY (k.sonuc_kodu=?) DESC, (o.hisse=?) DESC, o.tarih DESC LIMIT ?"""
    return [dict(r) for r in db.execute(sql, (tur, sonuc_kodu, hisse, limit))]


def cmd_analiz(a: argparse.Namespace) -> int:
    metin = a.metin if a.metin != "-" else sys.stdin.read()
    s = siniflandir(metin, a.tur)
    p = dict(s.parametreler)
    p.update(_param_coz(a.param))
    # temettü verimi: brüt tutar + fiyat verilmişse hesapla
    if s.tur == "temettu" and p.get("temettu_verimi") is None and p.get("brut_hisse_basina_tl") and p.get("fiyat_tl"):
        p["temettu_verimi"] = round(100 * float(p["brut_hisse_basina_tl"]) / float(p["fiyat_tl"]), 2)
    k = karar_ver(s.tur, p)
    hisse = a.hisse or hisse_bul(metin)
    print(f"Tür: {s.tur}  (puan {s.puan:.1f}; adaylar: {', '.join(f'{t}:{pu:.1f}' for t, pu in s.adaylar)})")
    if hisse:
        print(f"Hisse: {hisse}")
    print("Parametreler:", json.dumps(p, ensure_ascii=False))
    for ip in s.ipuclari:
        print("İpucu:", ip)
    print()
    print(karar_metni(k))
    if a.agac:
        print()
        print(agac_metni(s.tur, [ad.dugum for ad in k.yol] + [k.sonuc_kodu]))
    db = depo.ac(a.db)
    benzer = _benzerler(db, s.tur, hisse, k.sonuc_kodu)
    if benzer:
        print("\nVeritabanındaki benzer olaylar:")
        for b in benzer:
            ayni = "aynı sonuç" if b["sonuc_kodu"] == k.sonuc_kodu else b["sonuc_kodu"]
            print(f"  {b['tarih']}  {b['hisse'] or '-':6} [{(b['egilim'] or '-').upper():8}] {b['baslik'][:90]}  ({ayni})  #{b['id']}")
    # bu türün tipik bağları
    from .baglar import SEKTOR_KANALI, TUR_KURALLARI
    giden = [(h, i, g) for kk, h, g, i, _, _ in TUR_KURALLARI if kk == s.tur]
    gelen = [(kk, i, g) for kk, h, g, i, _, _ in TUR_KURALLARI if h == s.tur]
    if giden or gelen or s.tur in SEKTOR_KANALI:
        print("\nBu tür haber tipik olarak:")
        for h, i, g in giden:
            print(f"  → {h} ({i}, ≤{g} gün)")
        for kk, i, g in gelen:
            print(f"  ← {kk} ({i}, ≤{g} gün)")
        if s.tur in SEKTOR_KANALI:
            print("  sektör kanalı:", ", ".join(sorted(SEKTOR_KANALI[s.tur][0])))
    if a.kaydet:
        tarih = a.tarih or date.today().isoformat()
        kod = a.kod or f"{tarih}-{hisse or s.tur}-{abs(hash(metin)) % 10_000}"
        ag = AGACLAR[s.tur]
        o = Olay(kod=kod, tarih=tarih, kaynak="kap" if hisse else "gundem", kapsam=ag["kapsam"], tur=s.tur,  # type: ignore[arg-type]
                 baslik=metin.strip().split("\n")[0][:200], ozet=metin.strip()[:1500], hisse=hisse, parametreler=p, yon=k.egilim if k.egilim != "belirsiz" else "notr")
        oid = depo.olay_ekle(db, o)
        n = depo.baglari_yeniden_kur(db)
        print(f"\nKaydedildi: #{oid} {kod}; bağlar yeniden kuruldu ({n}).")
        for b in depo.baglar(db, oid)[:10]:
            ok = "→" if b["yon"] == "giden" else "←"
            print(f"  {ok} {b['tarih']} {b['iliski']:11} ({b['agirlik']:.2f}) {b['baslik'][:80]}")
    return 0


def _olay_satiri(o: Olay, k: dict[str, Any] | None) -> str:
    eg = (k["egilim"] if k else "-").upper()
    return f"#{o.id:<5} {o.tarih}  {o.tur:28} {o.hisse or '-':6} [{eg:8}] {o.baslik[:95]}"


def cmd_olaylar(a: argparse.Namespace) -> int:
    db = depo.ac(a.db)
    liste = depo.olaylar(db, tur=a.tur, hisse=a.hisse, baslangic=a.baslangic, bitis=a.bitis, kaynak=a.kaynak, arama=a.ara, limit=a.limit)
    for o in liste:
        print(_olay_satiri(o, depo.karar_getir(db, o.id)))  # type: ignore[arg-type]
    print(f"\n{len(liste)} olay")
    return 0


def cmd_olay(a: argparse.Namespace) -> int:
    db = depo.ac(a.db)
    o = depo.olay_getir(db, a.kod)
    if not o:
        print("Olay bulunamadı:", a.kod)
        return 1
    print(_olay_satiri(o, depo.karar_getir(db, o.id)))  # type: ignore[arg-type]
    print("Özet:", o.ozet)
    print("Parametreler:", json.dumps(o.parametreler, ensure_ascii=False))
    print("Etiketler:", ", ".join(o.etiketler), " Güven:", o.guven)
    for u in o.kaynaklar:
        print("Kaynak:", u)
    print()
    k = karar_ver(o.tur, o.parametreler, o.guven)
    print(karar_metni(k))
    if a.agac:
        print()
        print(agac_metni(o.tur, [ad.dugum for ad in k.yol] + [k.sonuc_kodu]))
    bag = depo.baglar(db, o.id, en_az_agirlik=a.esik)  # type: ignore[arg-type]
    if bag:
        print(f"\nBağlar (ağırlık ≥ {a.esik}):")
        for b in bag:
            ok = "→" if b["yon"] == "giden" else "←"
            kaynak = "elle" if not b["otomatik"] else "oto"
            print(f"  {ok} {b['tarih']} {b['iliski']:11} ({b['agirlik']:.2f},{kaynak}) #{b['id']:<5} {b['hisse'] or '-':6} {b['baslik'][:70]}  — {b['aciklama']}")
    return 0


def cmd_zincir(a: argparse.Namespace) -> int:
    db = depo.ac(a.db)
    o = depo.olay_getir(db, a.kod)
    if not o:
        print("Olay bulunamadı:", a.kod)
        return 1
    print(_olay_satiri(o, depo.karar_getir(db, o.id)))  # type: ignore[arg-type]
    for seviye, b in depo.zincir(db, o.id, a.derinlik, a.esik):  # type: ignore[arg-type]
        print(f"{'   ' * seviye}└─ {b['iliski']} ({b['agirlik']:.2f}) → #{b['id']} {b['tarih']} [{(b['egilim'] or '-').upper()}] {b['baslik'][:80]}")
    return 0


def cmd_ekle(a: argparse.Namespace) -> int:
    db = depo.ac(a.db)
    eklenen = depo.json_yukle(db, Path(a.json))
    n = depo.baglari_yeniden_kur(db)
    print(f"{len(eklenen)} olay eklendi/güncellendi; {n} otomatik bağ.")
    return 0


def cmd_disa_aktar(a: argparse.Namespace) -> int:
    db = depo.ac(a.db)
    liste = depo.olaylar(db, baslangic=a.baslangic, bitis=a.bitis)
    if a.json_cikti:
        cikti = []
        for o in liste:
            d = asdict(o)
            d["karar"] = depo.karar_getir(db, o.id)  # type: ignore[arg-type]
            d["baglar"] = depo.baglar(db, o.id, "giden")  # type: ignore[arg-type]
            cikti.append(d)
        print(json.dumps(cikti, ensure_ascii=False, indent=1))
        return 0
    print("# KAP Karar — olaylar, kararlar, bağlar\n")
    print("| Tarih | Tür | Hisse | Eğilim | Başlık | Sonuç | Bağlar |")
    print("|---|---|---|---|---|---|---|")
    for o in liste:
        k = depo.karar_getir(db, o.id)  # type: ignore[arg-type]
        bag = depo.baglar(db, o.id, "giden", 0.4)  # type: ignore[arg-type]
        bag_s = "; ".join(f"{b['iliski']}→{b['kod']}" for b in bag[:4])
        print(f"| {o.tarih} | {o.tur} | {o.hisse or ''} | {k['egilim'] if k else ''} | {o.baslik.replace('|', '/')} | {(k['sonuc'] if k else '').replace('|', '/')} | {bag_s} |")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="kap-karar", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", help="SQLite dosyası (varsayılan veri/kap_karar.sqlite)")
    sub = ap.add_subparsers(dest="komut", required=True)

    s = sub.add_parser("kur"); s.add_argument("--ajansiz", action="store_true", help="yatirim-ajani bilgi tabanını yükleme"); s.add_argument("--ajan-dizini"); s.set_defaults(f=cmd_kur)
    s = sub.add_parser("ozet"); s.set_defaults(f=cmd_ozet)
    s = sub.add_parser("agaclar"); s.set_defaults(f=cmd_agaclar)
    s = sub.add_parser("agac"); s.add_argument("tur"); s.set_defaults(f=cmd_agac)
    s = sub.add_parser("analiz"); s.add_argument("metin", help="haber metni ('-' ise stdin)"); s.add_argument("--tur"); s.add_argument("--hisse")
    s.add_argument("--param", action="append", help="anahtar=deger (tekrarlanabilir)"); s.add_argument("--agac", action="store_true", help="ağacı yolla birlikte çiz")
    s.add_argument("--kaydet", action="store_true", help="olayı veritabanına yaz ve bağla"); s.add_argument("--tarih"); s.add_argument("--kod"); s.set_defaults(f=cmd_analiz)
    s = sub.add_parser("olaylar"); s.add_argument("--tur"); s.add_argument("--hisse"); s.add_argument("--kaynak"); s.add_argument("--baslangic"); s.add_argument("--bitis")
    s.add_argument("--ara"); s.add_argument("--limit", type=int); s.set_defaults(f=cmd_olaylar)
    s = sub.add_parser("olay"); s.add_argument("kod"); s.add_argument("--agac", action="store_true"); s.add_argument("--esik", type=float, default=0.3); s.set_defaults(f=cmd_olay)
    s = sub.add_parser("zincir"); s.add_argument("kod"); s.add_argument("--derinlik", type=int, default=3); s.add_argument("--esik", type=float, default=0.4); s.set_defaults(f=cmd_zincir)
    s = sub.add_parser("ekle"); s.add_argument("--json", required=True); s.set_defaults(f=cmd_ekle)
    s = sub.add_parser("disa-aktar"); s.add_argument("--json", dest="json_cikti", action="store_true"); s.add_argument("--baslangic"); s.add_argument("--bitis"); s.set_defaults(f=cmd_disa_aktar)

    a = ap.parse_args(argv)
    return a.f(a)


if __name__ == "__main__":
    raise SystemExit(main())
