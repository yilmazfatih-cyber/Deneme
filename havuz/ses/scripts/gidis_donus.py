"""Gerçek modellerle gidiş-dönüş: metin → Piper sesi → Whisper yazısı → CER/WER/RTF (ağ ister).

Kullanım (temel klasöründen; modeller indirilmemişse indirir — SES_AG=1 gerekir):
    SES_AG=1 SES_MODEL_DIZINI=/tmp/modeller .venv/bin/python scripts/gidis_donus.py \
        --stt tiny --stt base --cikti /tmp/gidis-donus
Cümleler: veri/gidis_donus.jsonl (her satır kimlik, etiket, metin). Her cümle normalizasyonla
seslendirilir (ve `--ham` ile normalizasyonsuz da: espeak'in rakamları kendisinin okuduğu durum);
sonra her Whisper modeliyle `degerlendir` raporu üretilir. Sonuçlar: <cikti>/ozet.json ve her model
için rapor.md. Bulgular elle docs/GERCEK_MODEL_DENEMESI.md'ye yazılır.
Genişletme: başka bir ses → `--tts <ad>`; başka cümleler → `--cumleler <jsonl>`.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import time
from datetime import date
from pathlib import Path

KOK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(KOK))

from ses.ayar import ayarlari_oku  # noqa: E402
from ses.indir import indir  # noqa: E402
from ses.katalog import indirilmis_mi, katalogu_oku, model_klasoru  # noqa: E402
from ses.olcum.degerlendir import degerlendir, rapor_yaz  # noqa: E402
from ses.olcum.rtf import Kronometre, rtf  # noqa: E402
from ses.ses_isleme.wav import wav_yaz  # noqa: E402
from ses.stt.whisper import WhisperMotoru  # noqa: E402
from ses.tts.motor import SesAyari  # noqa: E402
from ses.tts.piper_motoru import PiperMotoru  # noqa: E402
from ses.tts.seslendirici import seslendir  # noqa: E402


def _hazirla(tur: str, ad: str, model_dizini: Path) -> Path:
    model = katalogu_oku().bul(ad, tur)  # type: ignore[arg-type]
    if not indirilmis_mi(model_dizini, model):
        if os.environ.get("SES_AG") != "1":
            raise SystemExit(f"{ad} indirilmemiş. İndirmek için SES_AG=1 verin (ağ ister).")
        print(f"İndiriliyor: {ad} ({model.boyut_mb:.0f} MB)…", flush=True)
        indir(model, model_dizini)
    return model_klasoru(model_dizini, model)


def _seslendir_hepsi(motor: PiperMotoru, cumleler: list[dict[str, str]], klasor: Path, ham: bool) -> dict[str, float]:
    klasor.mkdir(parents=True, exist_ok=True)
    satirlar, toplam_ses, toplam_islem = [], 0.0, 0.0
    for cumle in cumleler:
        with Kronometre() as k:
            ses = seslendir(motor, cumle["metin"], SesAyari(normallestir=not ham))
        wav_yaz(klasor / f"{cumle['kimlik']}.wav", ses)
        toplam_ses += ses.sure
        toplam_islem += k.sure
        satirlar.append({**cumle, "ses": f"{cumle['kimlik']}.wav"})
    (klasor / "liste.jsonl").write_text(
        "\n".join(json.dumps(s, ensure_ascii=False) for s in satirlar) + "\n", encoding="utf-8"
    )
    return {"ses_sn": round(toplam_ses, 2), "islem_sn": round(toplam_islem, 2), "rtf": round(rtf(toplam_islem, toplam_ses), 4)}


def main() -> int:
    ayristirici = argparse.ArgumentParser(description="Gerçek modellerle gidiş-dönüş ölçümü.")
    ayristirici.add_argument("--stt", action="append", default=[], help="Whisper boyutu (tekrarlanabilir)")
    ayristirici.add_argument("--tts", default="tr_TR-dfki-medium")
    ayristirici.add_argument("--cumleler", type=Path, default=KOK / "veri" / "gidis_donus.jsonl")
    ayristirici.add_argument("--cikti", type=Path, required=True)
    ayristirici.add_argument("--ham", action="store_true", help="normalizasyonsuz seslendirmeyi de ölç")
    ayristirici.add_argument("--is-parcacigi", type=int, default=2)
    secenek = ayristirici.parse_args()
    ayarlar = ayarlari_oku()
    cumleler = [json.loads(s) for s in secenek.cumleler.read_text(encoding="utf-8").splitlines() if s.strip()]
    tts_klasoru = _hazirla("tts", secenek.tts, ayarlar.model_dizini)
    piper = PiperMotoru(tts_klasoru / f"{secenek.tts}.onnx", is_parcacigi=secenek.is_parcacigi)
    ozet: dict[str, object] = {
        "tarih": date.today().isoformat(), "tts": secenek.tts, "cumle_sayisi": len(cumleler),
        "is_parcacigi": secenek.is_parcacigi, "islemci": platform.processor() or platform.machine(),
        "cekirdek": os.cpu_count(), "tts_olcum": {}, "stt": {},
    }  # fmt: skip
    kipler = ["normal", "ham"] if secenek.ham else ["normal"]
    for kip in kipler:
        with Kronometre() as k:
            olcum = _seslendir_hepsi(piper, cumleler, secenek.cikti / kip, ham=kip == "ham")
        print(f"Seslendirme ({kip}): {olcum} — toplam {k.sure:.1f} sn", flush=True)
        ozet["tts_olcum"][kip] = olcum  # type: ignore[index]
    for boyut in secenek.stt:
        klasor = _hazirla("stt", boyut, ayarlar.model_dizini)
        motor = WhisperMotoru(klasor, ad=boyut, is_parcacigi=secenek.is_parcacigi)
        with Kronometre() as yukleme:
            motor._yukle()  # yükleme süresi RTF'ye karışmasın
        for kip in kipler:
            bas = time.perf_counter()
            rapor = degerlendir(secenek.cikti / kip / "liste.jsonl", motor, tarih=date.today().isoformat())
            rapor_yaz(rapor, secenek.cikti / kip / f"rapor-{boyut}")
            sonuc = {
                "yukleme_sn": round(yukleme.sure, 2), "toplam_sn": round(time.perf_counter() - bas, 2),
                "rtf": round(rapor.rtf, 4),
                **{ad: round(rapor.toplam(ad).oran, 4) for ad in ("wer", "cer", "wer_sayili", "cer_sayili")},
                "ornekler": [{"kimlik": o.kimlik, "etiket": o.etiket, "dogru": o.dogru, "tahmin": o.tahmin,
                              "cer_sayili": round(o.cer_sayili.oran, 3), "wer_sayili": round(o.wer_sayili.oran, 3)}
                             for o in rapor.ornekler],
            }  # fmt: skip
            ozet["stt"][f"{boyut}/{kip}"] = sonuc  # type: ignore[index]
            print(f"{boyut}/{kip}: WER {sonuc['wer']} CER {sonuc['cer']} · sayılar yazıyla WER "
                  f"{sonuc['wer_sayili']} CER {sonuc['cer_sayili']} · RTF {sonuc['rtf']}", flush=True)  # fmt: skip
    (secenek.cikti / "ozet.json").write_text(json.dumps(ozet, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Yazıldı: {secenek.cikti / 'ozet.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
