"""Gerçek küçük modelle deneme betiği (bir kez çalıştırılıp sonucu docs/GERCEK_MODEL_DENEMESI.md'ye yazılır).

Ölçülenler:
    1. Yapılı çıkarım: (A) yalnız "istem" katmanı + onarım döngüsü — ham çıktı `json.loads` ile
       geçerli mi, sağlam ayrıştırıcı + şema düzeltmeyle geçerli mi, kaç onarım turu gerekti;
       (B) bütün katmanlar (sema → arac → istem → alan) — hangi katman başardı.
    2. RAG: belgede olan, olmayan ve sayı içeren sorular — atıf, "belgede yok", dayanaksız ifade.
Ham model çıktıları `--fixture` verilirse tests/veri/gercek_ciktilar.jsonl'a yazılır (JSON onarıcı
için kayıtlı gerçek çıktılar; tests/test_gercek_ciktilar.py).
Kullanım: önce araclar/hf_sunucu.py'yi başlatın, sonra:
    .venv/bin/python araclar/gercek_deneme.py --url http://127.0.0.1:8422/v1 --model qwen25-05b
Genişletme: yeni deneme → `_deneme_xxx` işlevi + `main` içinde çağrı.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from yz.rag.dizin import RagDizini
from yz.rag.yanit import RagHatti
from yz.rag.yukleyici import klasor_yukle
from yz.saglayici.openai_uyumlu import OpenAIUyumlu
from yz.yapili.cikar import Cikarici
from yz.yapili.json_onar import json_ayikla
from yz.yapili.semalar import Fatura, Iletisim

KOK = Path(__file__).resolve().parent.parent
ILETISIM_METINLERI = [
    "Merhaba, ben Elif Demir. Bana 0532 444 55 66 numarasından ya da elif.demir@ornek.com adresinden "
    "ulaşabilirsiniz. Ankara'da yaşıyorum.",
    "İletişim: Murat Kaya — tel: +90 216 555 12 34 — İstanbul",
]
RAG_SORULARI = [
    "Ürünü kaç gün içinde iade edebilirim?",
    "Kargo ücreti ne kadar?",
    "Şirketin genel müdürü kimdir?",
]


def _strict(metin: str) -> bool:
    try:
        return isinstance(json.loads(metin), dict)
    except ValueError:
        return False


def _deneme_cikarim(
    saglayici: OpenAIUyumlu, ornekler: list[tuple[str, str, type[BaseModel]]], tum_katmanlar: bool
) -> list[dict[str, Any]]:
    kayitlar = []
    for kimlik, metin, sema in ornekler:
        baslangic = time.perf_counter()
        a = Cikarici(
            saglayici, sema, katmanlar=["istem"], azami_onarim=2, azami_belirtec=200
        ).cikar(metin)
        sure_a = time.perf_counter() - baslangic
        baslangic = time.perf_counter()
        b = (
            Cikarici(saglayici, sema, azami_onarim=1, azami_belirtec=200).cikar(metin)
            if tum_katmanlar
            else a
        )
        sure_b = time.perf_counter() - baslangic
        ilk = a.denemeler[0].ham if a.denemeler else ""
        kayitlar.append({
            "kimlik": kimlik, "sema": sema.__name__,
            "a_ham_json_gecerli": _strict(ilk),
            "a_ilk_deneme_gecti": bool(a.denemeler and a.denemeler[0].basarili),
            "a_basarili": a.basarili, "a_onarim_turu": a.onarim_turu, "a_notlar": a.notlar,
            "a_denemeler": [{"tur": d.tur, "basarili": d.basarili, "hata": d.hata, "ham": d.ham} for d in a.denemeler],
            "b_basarili": b.basarili, "b_katman": b.katman, "b_onarim_turu": b.onarim_turu,
            "b_deger": b.deger.model_dump(mode="json") if b.deger else None,
            "b_rapor": b.rapor(), "sure_a_sn": round(sure_a, 1), "sure_b_sn": round(sure_b, 1),
        })  # fmt: skip
        print(f"[cikarim] {kimlik}: A={a.basarili}/{a.onarim_turu} B={b.basarili}:{b.katman} "
              f"({sure_a:.0f}+{sure_b:.0f} sn)", flush=True)  # fmt: skip
    return kayitlar


def _deneme_rag(saglayici: OpenAIUyumlu) -> list[dict[str, Any]]:
    dizin = RagDizini()
    dizin.ekle(klasor_yukle(KOK / "gorevler" / "getirme" / "belgeler"))
    hat = RagHatti(dizin, saglayici)
    kayitlar = []
    for soru in RAG_SORULARI:
        baslangic = time.perf_counter()
        sonuc = hat.sor(soru)
        kayitlar.append({"soru": soru, "yanit": sonuc.yanit, "atiflar": sonuc.atiflar,
                         "belgede_yok": sonuc.belgede_yok, "dayanaksiz": sonuc.dayanaksiz,
                         "uyarilar": sonuc.uyarilar, "model_cagrildi": sonuc.model_cagrildi,
                         "kaynaklar": sonuc.kaynakca(), "sure_sn": round(time.perf_counter() - baslangic, 1)})  # fmt: skip
        print(f"[rag] {soru} → {sonuc.yanit[:100]!r}", flush=True)
    return kayitlar


def main() -> None:
    ayristirici = argparse.ArgumentParser(
        description="Gerçek küçük modelle yapılı çıkarım ve RAG denemesi."
    )
    ayristirici.add_argument("--url", default="http://127.0.0.1:8422/v1")
    ayristirici.add_argument("--model", default="qwen25-05b")
    ayristirici.add_argument("--sinir", type=int, default=4, help="kaç fatura örneği")
    ayristirici.add_argument(
        "--asama",
        choices=["cikarim", "katmanlar", "rag"],
        required=True,
        help="cikarim: yalnız istem+onarım; katmanlar: bütün katmanlar; rag: belgeye soru",
    )
    ayristirici.add_argument("--cikti", default=str(KOK / ".yz" / "gercek_deneme.json"))
    ayristirici.add_argument(
        "--fixture", action="store_true", help="ham çıktıları tests/veri'ye yaz"
    )
    args = ayristirici.parse_args()
    saglayici = OpenAIUyumlu(args.url, args.model, zaman_asimi_sn=600, azami_belirtec=400)
    faturalar = [
        json.loads(s)
        for s in (KOK / "gorevler" / "json_cikarim.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    ornekler: list[tuple[str, str, type[BaseModel]]] = [
        (f["kimlik"], f["girdi"], Fatura) for f in faturalar[: args.sinir]
    ]
    ornekler += [(f"i{i + 1:02d}", m, Iletisim) for i, m in enumerate(ILETISIM_METINLERI)]
    cikti = Path(args.cikti)
    sonuc: dict[str, Any] = json.loads(cikti.read_text(encoding="utf-8")) if cikti.is_file() else {}
    sonuc.update(model=args.model, zaman=time.strftime("%Y-%m-%d %H:%M"))
    if args.asama == "rag":
        sonuc["rag"] = _deneme_rag(saglayici)
    else:
        sonuc[args.asama] = _deneme_cikarim(
            saglayici, ornekler, tum_katmanlar=args.asama == "katmanlar"
        )
    sonuc[f"kullanim_{args.asama}"] = saglayici.sayac.ozet()
    cikti.parent.mkdir(parents=True, exist_ok=True)
    cikti.write_text(json.dumps(sonuc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Yazıldı: {cikti}")
    if args.fixture and args.asama == "cikarim":
        satirlar = []
        for kayit in sonuc[args.asama]:
            for d in kayit["a_denemeler"]:
                ayiklama = json_ayikla(d["ham"])
                satirlar.append(json.dumps({"kaynak": args.model, "kimlik": f"{kayit['kimlik']}-{d['tur']}",
                                            "cikti": d["ham"], "deger": ayiklama.deger, "notlar": ayiklama.notlar},
                                           ensure_ascii=False))  # fmt: skip
        hedef = KOK / "tests" / "veri" / "gercek_ciktilar.jsonl"
        hedef.parent.mkdir(parents=True, exist_ok=True)
        hedef.write_text("\n".join(satirlar) + "\n", encoding="utf-8")
        print(f"Kayıtlı çıktılar: {hedef}")


if __name__ == "__main__":
    main()
