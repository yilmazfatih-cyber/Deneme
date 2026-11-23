"""Komut gövdeleri: her `komut_<ad>(secenek)` bir alt komuttur; ayrıştırıcı cli.py'dedir.

Çıktı stdout'a (metin, JSON, altyazı), ilerleme ve uyarılar stderr'e yazılır (borulanabilsin).
Kim kullanır: cli.py. Genişletme: yeni komut → burada `komut_xxx(secenek) -> int` yazın, cli.py'de
alt ayrıştırıcısını ekleyin, tests/test_cli.py'ye bir çağrı testi koyun.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from ses.ayar import Ayarlar, ayarlari_oku
from ses.hatalar import SesHatasi
from ses.katalog import indirilmis_mi, katalogu_oku, model_klasoru
from ses.ses_isleme.duzey import lufs, lufs_normallestir, rms_dbfs, tepe_dbfs
from ses.ses_isleme.ses import Ses
from ses.ses_isleme.sessizlik import sessizligi_kirp
from ses.ses_isleme.vad import konusma_bolgeleri
from ses.ses_isleme.wav import wav_yaz
from ses.ses_isleme.yeniden_ornekle import yeniden_ornekle
from ses.ses_isleme.yukle import ses_yukle, tek_kanal_hazirla
from ses.stt.altyazi import ipuclarina_bol, srt_uret, vtt_uret
from ses.stt.motor import SahteStt, SttMotoru
from ses.stt.uzun import uzun_yaziya
from ses.tts.cikti import ses_bayt
from ses.tts.motor import SahteTts, SesAyari, TtsMotoru
from ses.tts.normallestir.normallestirici import normallestir_ayrintili
from ses.tts.seslendirici import seslendir


def _hata(ileti: str) -> None:
    print(ileti, file=sys.stderr, flush=True)


def _ayarlar(secenek: argparse.Namespace) -> Ayarlar:
    return ayarlari_oku(model_dizini=getattr(secenek, "model_dizini", None))


def stt_motoru_kur(ad: str | None, ayarlar: Ayarlar, sahte: str | None = None) -> SttMotoru:
    """Sahte metin verilirse modelsiz motor; yoksa katalogdaki Whisper modeli."""
    if sahte is not None:
        return SahteStt(sahte)
    from ses.stt.whisper import WhisperMotoru

    model = katalogu_oku().bul(ad or ayarlar.stt_modeli, "stt")
    return WhisperMotoru(model_klasoru(ayarlar.model_dizini, model), ad=model.ad, is_parcacigi=ayarlar.is_parcacigi)


def tts_motoru_kur(ad: str | None, ayarlar: Ayarlar, sahte: bool = False) -> TtsMotoru:
    if sahte:
        return SahteTts()
    from ses.tts.piper_motoru import PiperMotoru

    model = katalogu_oku().bul(ad or ayarlar.tts_sesi, "tts")
    if model.ticari != "evet":
        _hata(f"Not: '{model.ad}' sesinin lisansı {model.lisans}; ticari kullanım: {model.ticari}. "
              "Ayrıntı: docs/LISANSLAR.md")  # fmt: skip
    klasor = model_klasoru(ayarlar.model_dizini, model)
    return PiperMotoru(klasor / f"{model.ad}.onnx", ad=model.ad, is_parcacigi=ayarlar.is_parcacigi)


def _ilerleme(bitti: int, toplam: int) -> None:
    _hata(f"  parça {bitti}/{toplam}")


def _yaz_ya_da_bas(metin: str, cikti: Path | None) -> None:
    if cikti is None:
        sys.stdout.write(metin if metin.endswith("\n") else metin + "\n")
    else:
        cikti.write_text(metin, encoding="utf-8")
        _hata(f"Yazıldı: {cikti}")


def _yaziya_cevir(secenek: argparse.Namespace, sozcuklu: bool) -> tuple[Ayarlar, object]:
    ayarlar = _ayarlar(secenek)
    ornekler = tek_kanal_hazirla(ses_yukle(Path(secenek.dosya), azami_sure=ayarlar.azami_sure_sn))
    motor = stt_motoru_kur(secenek.model, ayarlar, secenek.sahte)
    _hata(f"Yazıya çevriliyor ({motor.ad}, {len(ornekler) / 16000:.1f} sn ses)…")
    sonuc = uzun_yaziya(motor, ornekler, dil=secenek.dil, kelime_zamanlari=sozcuklu,
                        ipucu=secenek.ipucu, ilerleme=_ilerleme)  # fmt: skip
    for uyari in sonuc.uyarilar:
        _hata(f"Uyarı: {uyari}")
    return ayarlar, sonuc


def komut_yaziya(secenek: argparse.Namespace) -> int:
    from ses.stt.tipler import Transkript

    _, sonuc = _yaziya_cevir(secenek, sozcuklu=secenek.bicim in ("json", "srt", "vtt"))
    assert isinstance(sonuc, Transkript)
    if secenek.bicim == "json":
        metin = sonuc.model_dump_json(indent=2)
    elif secenek.bicim in ("srt", "vtt"):
        ipuclari = ipuclarina_bol(sonuc.bolutler)
        metin = srt_uret(ipuclari) if secenek.bicim == "srt" else vtt_uret(ipuclari)
    else:
        metin = sonuc.metin
    _yaz_ya_da_bas(metin, secenek.cikti)
    return 0


def komut_altyazi(secenek: argparse.Namespace) -> int:
    from ses.stt.tipler import Transkript

    _, sonuc = _yaziya_cevir(secenek, sozcuklu=True)
    assert isinstance(sonuc, Transkript)
    ipuclari = ipuclarina_bol(sonuc.bolutler, azami_karakter=secenek.azami_karakter,
                              azami_satir=secenek.azami_satir, azami_sure=secenek.azami_sure)  # fmt: skip
    metin = srt_uret(ipuclari) if secenek.bicim == "srt" else vtt_uret(ipuclari)
    cikti = secenek.cikti or Path(secenek.dosya).with_suffix(f".{secenek.bicim}")
    _yaz_ya_da_bas(metin, cikti)
    return 0


def komut_seslendir(secenek: argparse.Namespace) -> int:
    ayarlar = _ayarlar(secenek)
    metin = Path(secenek.dosya).read_text(encoding="utf-8") if secenek.dosya else secenek.metin
    if not metin:
        raise SesHatasi("Metin verin: python -m ses seslendir \"Merhaba\" ya da --dosya metin.txt")
    motor = tts_motoru_kur(secenek.ses, ayarlar, secenek.sahte)
    ayar = SesAyari(hiz=secenek.hiz, perde=secenek.perde, cumle_arasi_ms=secenek.cumle_arasi,
                    hedef_lufs=None if secenek.lufs_yok else secenek.lufs, ornekleme=secenek.ornekleme,
                    normallestir=not secenek.normallestirme_yok)  # fmt: skip
    ses = seslendir(motor, metin, ayar)
    bicim = secenek.bicim or (secenek.cikti.suffix.lstrip(".") if secenek.cikti.suffix else "wav")
    bayt, _ = ses_bayt(ses, bicim)
    secenek.cikti.write_bytes(bayt)
    _hata(f"Yazıldı: {secenek.cikti} ({ses.sure:.1f} sn, {ses.ornekleme} Hz, {bicim})")
    return 0


def komut_normallestir(secenek: argparse.Namespace) -> int:
    metin = Path(secenek.dosya).read_text(encoding="utf-8") if secenek.dosya else secenek.metin
    sonuc, degisiklikler = normallestir_ayrintili(metin or "")
    print(sonuc)
    if secenek.ayrinti:
        for d in degisiklikler:
            print(f"  [{d.kural}] {d.once!r} → {d.sonra!r}")
    return 0


def komut_degerlendir(secenek: argparse.Namespace) -> int:
    from ses.olcum.degerlendir import degerlendir, markdown_rapor, rapor_yaz

    ayarlar = _ayarlar(secenek)
    motor = stt_motoru_kur(secenek.model, ayarlar, secenek.sahte)
    rapor = degerlendir(Path(secenek.liste), motor, tarih=date.today().isoformat(), ilerleme=_ilerleme)
    if secenek.cikti:
        json_yolu, md_yolu = rapor_yaz(rapor, secenek.cikti)
        _hata(f"Yazıldı: {json_yolu}, {md_yolu}")
    print(markdown_rapor(rapor))
    return 0


def komut_modeller(secenek: argparse.Namespace) -> int:
    ayarlar = _ayarlar(secenek)
    katalog = katalogu_oku()
    satirlar = [{"ad": m.ad, "tur": m.tur, "boyut_mb": round(m.boyut_mb), "lisans": m.lisans, "ticari": m.ticari,
                 "indirildi": indirilmis_mi(ayarlar.model_dizini, m), "aciklama": m.aciklama}
                for m in katalog.modeller]  # fmt: skip
    if secenek.json:
        print(json.dumps({"model_dizini": str(ayarlar.model_dizini), "modeller": satirlar}, ensure_ascii=False, indent=2))
        return 0
    print(f"Model dizini: {ayarlar.model_dizini}   (katalog doğrulama: {katalog.dogrulama_tarihi})\n")
    print(f"{'AD':<20} {'TÜR':<4} {'MB':>6}  {'LİSANS':<16} {'TİCARİ':<9} İNDİRİLDİ")
    goster = {"evet": "evet", "hayir": "hayır", "belirsiz": "belirsiz"}
    for s in satirlar:
        print(f"{s['ad']:<20} {s['tur']:<4} {s['boyut_mb']:>6}  {s['lisans']:<16} {goster[str(s['ticari'])]:<9} "
              f"{'evet' if s['indirildi'] else 'hayır'}")  # fmt: skip
    for g in katalog.geri_cekilenler:
        print(f"\nKULLANMAYIN: {g.ad} — {g.neden}")
    print("\nİndirmek için: python -m ses indir --stt base --tts tr_TR-dfki-medium")
    return 0


def komut_indir(secenek: argparse.Namespace) -> int:
    from ses.indir import denetle, indir

    ayarlar = _ayarlar(secenek)
    katalog = katalogu_oku()
    secilen = [katalog.bul(ad, "stt") for ad in secenek.stt] + [katalog.bul(ad, "tts") for ad in secenek.tts]
    if not secilen:
        raise SesHatasi("Ne indirileceğini söyleyin: --stt base ve/veya --tts tr_TR-dfki-medium")
    sorun = 0
    for model in secilen:
        if secenek.denetle:
            sorunlar = denetle(model, ayarlar.model_dizini)
            print(f"{model.ad}: {'sağlam' if not sorunlar else '; '.join(sorunlar)}")
            sorun += len(sorunlar)
            continue
        _hata(f"{model.ad} ({model.boyut_mb:.0f} MB, lisans {model.lisans}, ticari: {model.ticari}) indiriliyor…")
        son_yuzde: dict[str, int] = {}

        def ilerleme(ad: str, inen: int, toplam: int) -> None:
            yuzde = inen * 100 // toplam
            if yuzde // 10 != son_yuzde.get(ad, -1) // 10:
                son_yuzde[ad] = yuzde
                _hata(f"  {ad}: %{yuzde}")

        klasor = indir(model, ayarlar.model_dizini, ilerleme=ilerleme)
        print(f"{model.ad}: hazır → {klasor}")
    return 1 if sorun else 0


def komut_bilgi(secenek: argparse.Namespace) -> int:
    ses = ses_yukle(Path(secenek.dosya))
    mono = ses.mono()
    bolgeler = konusma_bolgeleri(mono, ses.ornekleme)
    bilgi = {"sure_sn": round(ses.sure, 3), "ornekleme": ses.ornekleme, "kanal": ses.kanal,
             "tepe_dbfs": round(tepe_dbfs(mono), 2), "rms_dbfs": round(rms_dbfs(mono), 2),
             "lufs": round(lufs(mono, ses.ornekleme), 2), "konusma_bolgesi": len(bolgeler),
             "konusma_sn": round(sum(b.sure for b in bolgeler), 2)}  # fmt: skip
    print(json.dumps(bilgi, ensure_ascii=False, indent=2))
    return 0


def komut_hazirla(secenek: argparse.Namespace) -> int:
    """Bir kaydı uygulamaya hazırlar: tek kanal, baş/son sessizlik kırpma, LUFS, örnekleme hızı."""
    ses = ses_yukle(Path(secenek.girdi))
    dizi, hiz = ses.mono(), ses.ornekleme
    if not secenek.kirpma_yok:
        dizi = sessizligi_kirp(dizi, hiz, pay_ms=80)
    if len(dizi) == 0:
        raise SesHatasi("Kayıtta ses bulunamadı (tamamen sessiz).")
    if secenek.ornekleme and secenek.ornekleme != hiz:
        dizi, hiz = yeniden_ornekle(dizi, hiz, secenek.ornekleme), secenek.ornekleme
    dizi, bilgi = lufs_normallestir(dizi, hiz, hedef_lufs=secenek.lufs)
    wav_yaz(secenek.cikti, Ses.tek_kanaldan(dizi, hiz))
    durum = "hedefe ulaşıldı" if bilgi.hedefe_ulasildi else "tepe sınırı yüzünden hedefin altında kaldı"
    _hata(f"Yazıldı: {secenek.cikti} ({len(dizi) / hiz:.2f} sn, {hiz} Hz; {bilgi.olculen:.1f} → "
          f"{bilgi.olculen + bilgi.kazanc_db:.1f} LUFS, {durum})")  # fmt: skip
    return 0


def komut_sun(secenek: argparse.Namespace) -> int:
    try:
        import uvicorn

        from ses.sunucu.uygulama import uygulama_kur
    except ImportError as hata:
        from ses.hatalar import eksik_paket

        raise eksik_paket("fastapi/uvicorn", "sunucu") from hata
    ayarlar = ayarlari_oku(adres=secenek.adres, kapi=secenek.kapi, model_dizini=secenek.model_dizini)
    if ayarlar.adres not in ("127.0.0.1", "localhost", "::1") and not ayarlar.api_anahtari:
        raise SesHatasi(
            f"{ayarlar.adres} adresinde dinlemek için API anahtarı gerekir: SES_SUNUCU_ANAHTARI=<uzun-rastgele> verin."
        )
    fabrikalar = {}
    if secenek.sahte:
        fabrikalar = {"stt_fabrikasi": lambda ad: SahteStt("sahte yazıya çevirme"),
                      "tts_fabrikasi": lambda ad: SahteTts()}  # fmt: skip
    uygulama = uygulama_kur(ayarlar, **fabrikalar)  # type: ignore[arg-type]
    _hata(f"Ses sunucusu: http://{ayarlar.adres}:{ayarlar.kapi}  (tarayıcı sayfası: /tarayici; durdurmak: Ctrl+C)")
    uvicorn.run(uygulama, host=ayarlar.adres, port=ayarlar.kapi, log_level="warning")
    return 0
