"""`osm` komut satırı: sentez · bolut · egit · tahmin · etiketle · disa · bilgi."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
VERI = KOK / "veri"


def _sentez(a):
    from .sentez import veri_seti_uret

    m = veri_seti_uret(Path(a.cikti), a.adet, satir_orani=a.satir_orani, tohum=a.tohum, sadece_tur=a.tur, guc=a.guc, kelime_dosyalari=[Path(p) for p in a.kelime] or None)
    print(f"{a.adet} örnek → {m}")


def _bolut(a):
    from .bolut import kuyruga_ekle, pagexml_ice_aktar, sayfayi_isle

    kok = Path(a.cikti)
    kuyruk = Path(a.kuyruk)
    toplam = 0
    sayfalar = []
    for p in a.sayfa:
        p = Path(p)
        sayfalar += sorted(x for x in p.iterdir() if x.suffix.lower() in {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"}) if p.is_dir() else [p]
    for p in sayfalar:
        if a.pagexml:
            xml = Path(a.pagexml) / (p.stem + ".xml") if Path(a.pagexml).is_dir() else Path(a.pagexml)
            kayit = pagexml_ice_aktar(xml, p, kok)
        else:
            kayit = sayfayi_isle(p, kok, kelime=True)
        n = kuyruga_ekle(kayit, kuyruk, kok, duzey=a.duzey)
        toplam += n
        print(f"{p.name}: {len(kayit['satirlar'])} satır, {sum(len(s['kelimeler']) for s in kayit['satirlar'])} kaba kelime, eğim {kayit['aci']:.1f}°, kuyruğa {n} öğe")
    print(f"toplam {toplam} öğe → {kuyruk}")


def _egit(a):
    from .egit import egit

    egit(
        [Path(m) for m in a.manifest],
        Path(a.cikti),
        baslangic=Path(a.baslangic) if a.baslangic else None,
        donem=a.donem,
        parti=a.parti,
        ogrenme_orani=a.ogrenme_orani,
        kanal=a.kanal,
        gizli=a.gizli,
        katman=a.katman,
        tohum=a.tohum,
        isci=a.isci,
        gercek_agirlik=a.gercek_agirlik,
        sentez_ust_sinir=a.sentez_ust_sinir,
    )


def _tahmin(a):
    from PIL import Image

    from .tahmin import Tahminci, kelime_kutulari

    t = Tahminci(Path(a.model))
    for p in a.goruntu:
        img = Image.open(p)
        logp = t.logp(img)
        from .kodcoz import secenekler

        sec = secenekler(logp, t.alfabe, adet=a.secenek)
        cikti = {"dosya": str(p), "secenekler": [{"metin": m, "guven": round(g, 3)} for m, g in sec]}
        if a.kelimeler:
            cikti["kelimeler"] = [{"x0": x0, "x1": x1, "metin": m} for x0, x1, m in kelime_kutulari(logp, t.alfabe, img.width)]
        if a.json:
            print(json.dumps(cikti, ensure_ascii=False))
        else:
            print(f"{p}:")
            for h, (m, g) in zip("ABC", sec):
                print(f"  {h}) {m}   (%{g * 100:.0f})")
            if a.kelimeler:
                print("  kelimeler:", " | ".join(f"{m}[{x0}-{x1}]" for x0, x1, m in cikti["kelimeler"]))


def _etiketle(a):
    from .etiketle import Durum, sunucu_baslat

    kok = Path(a.veri)
    durum = Durum(kok, Path(a.model) if a.model else None, Path(a.kuyruk), kok / "etiketler.jsonl", kok / "etiket_manifest.jsonl", a.duzey, a.secenek)
    sunucu_baslat(durum, port=a.port, ac=not a.acma)


def _disa(a):
    import torch

    from .model import model_yukle

    model, alfabe, meta = model_yukle(Path(a.model))
    ornek = torch.zeros(1, 1, model.yukseklik, 256)
    cikti = Path(a.cikti)
    torch.onnx.export(model, ornek, str(cikti), input_names=["goruntu"], output_names=["logp"], dynamic_axes={"goruntu": {0: "parti", 3: "genislik"}, "logp": {0: "zaman", 1: "parti"}}, opset_version=17, dynamo=False)
    (cikti.with_suffix(".alfabe.json")).write_text(json.dumps(alfabe.to_json(), ensure_ascii=False), encoding="utf-8")
    print(f"ONNX → {cikti} ({cikti.stat().st_size / 1e6:.1f} MB); alfabe → {cikti.with_suffix('.alfabe.json')}")
    if a.int8:
        try:
            from onnxruntime.quantization import QuantType, quantize_dynamic

            q = cikti.with_name(cikti.stem + ".int8.onnx")
            quantize_dynamic(str(cikti), str(q), weight_type=QuantType.QInt8)
            print(f"int8 → {q} ({q.stat().st_size / 1e6:.1f} MB)")
        except Exception as e:  # noqa: BLE001
            print(f"int8 nicemleme yapılamadı: {e}")


def _bilgi(a):
    from .model import model_yukle

    model, alfabe, meta = model_yukle(Path(a.model))
    print(f"parametre: {model.parametre_sayisi():,}  sınıf: {len(alfabe)}  yükseklik: {model.yukseklik}")
    print(f"meta: {json.dumps(meta, ensure_ascii=False)}")
    print("alfabe:", "".join(alfabe.to_json()))


def main(argv=None):
    p = argparse.ArgumentParser(prog="osm", description="Osmanlıca rik'a satır/kelime tanıma: veri, eğitim, etiketleme.")
    sp = p.add_subparsers(dest="komut", required=True)

    s = sp.add_parser("sentez", help="Yazı tiplerinden sentetik kelime/satır görüntüleri üret")
    s.add_argument("--cikti", default=str(VERI / "sentez_v0"))
    s.add_argument("--adet", type=int, default=20000)
    s.add_argument("--satir-orani", type=float, default=0.3)
    s.add_argument("--tohum", type=int, default=0)
    s.add_argument("--tur", choices=["rika", "nesih", "talik"], default=None, help="Yalnızca bu yazı türü")
    s.add_argument("--guc", type=float, default=1.0, help="Bozulma şiddeti (0–1.5)")
    s.add_argument("--kelime", action="append", default=[], help="Ek kelime listesi (.txt); birden çok verilebilir")
    s.set_defaults(f=_sentez)

    s = sp.add_parser("bolut", help="Sayfa görüntülerini satır ve kaba kelimelere böl, etiket kuyruğuna ekle")
    s.add_argument("sayfa", nargs="+", help="Sayfa dosyası ya da klasörü")
    s.add_argument("--cikti", default=str(VERI / "kirpim"))
    s.add_argument("--kuyruk", default=str(VERI / "kuyruk.jsonl"))
    s.add_argument("--duzey", choices=["satir", "kelime"], default="satir", help="Etiketleme birimi (rik'a için satır önerilir)")
    s.add_argument("--pagexml", default=None, help="eScriptorium/Transkribus PAGE-XML dosyası ya da klasörü (satırlar oradan alınır)")
    s.set_defaults(f=_bolut)

    s = sp.add_parser("egit", help="CRNN+CTC modelini eğit / ince ayarla")
    s.add_argument("--manifest", action="append", required=True, help="JSONL manifest (birden çok verilebilir)")
    s.add_argument("--cikti", default=str(KOK / "cikti" / "model"))
    s.add_argument("--baslangic", default=None, help="İnce ayar için başlangıç modeli (.pt)")
    s.add_argument("--donem", type=int, default=20)
    s.add_argument("--parti", type=int, default=32)
    s.add_argument("--ogrenme-orani", type=float, default=1e-3)
    s.add_argument("--kanal", type=int, default=32)
    s.add_argument("--gizli", type=int, default=128)
    s.add_argument("--katman", type=int, default=2)
    s.add_argument("--tohum", type=int, default=0)
    s.add_argument("--isci", type=int, default=2)
    s.add_argument("--gercek-agirlik", type=int, default=4, help="Gerçek (etiket) örneklerin tekrar katsayısı")
    s.add_argument("--sentez-ust-sinir", type=int, default=None, help="Kullanılacak en fazla sentetik örnek")
    s.set_defaults(f=_egit)

    s = sp.add_parser("tahmin", help="Görüntü(ler) için A/B/C önerisi üret")
    s.add_argument("goruntu", nargs="+")
    s.add_argument("--model", required=True)
    s.add_argument("--secenek", type=int, default=3)
    s.add_argument("--kelimeler", action="store_true", help="CTC hizalamasından kelime kutularını da ver")
    s.add_argument("--json", action="store_true")
    s.set_defaults(f=_tahmin)

    s = sp.add_parser("etiketle", help="Tarayıcıda A/B/C/D etiketleme arayüzünü başlat")
    s.add_argument("--veri", default=str(VERI))
    s.add_argument("--kuyruk", default=str(VERI / "kuyruk.jsonl"))
    s.add_argument("--model", default=None, help="Öneri üretecek model (.pt); yoksa yalnızca D ile yazılır")
    s.add_argument("--duzey", choices=["satir", "kelime", "hepsi"], default="hepsi")
    s.add_argument("--secenek", type=int, default=3)
    s.add_argument("--port", type=int, default=8765)
    s.add_argument("--acma", action="store_true", help="Tarayıcıyı otomatik açma")
    s.set_defaults(f=_etiketle)

    s = sp.add_parser("disa", help="Modeli ONNX'e (isteğe bağlı int8) aktar")
    s.add_argument("--model", required=True)
    s.add_argument("--cikti", default=str(KOK / "cikti" / "model.onnx"))
    s.add_argument("--int8", action="store_true")
    s.set_defaults(f=_disa)

    s = sp.add_parser("bilgi", help="Model dosyası hakkında bilgi")
    s.add_argument("--model", required=True)
    s.set_defaults(f=_bilgi)

    a = p.parse_args(argv)
    a.f(a)


if __name__ == "__main__":
    main()
