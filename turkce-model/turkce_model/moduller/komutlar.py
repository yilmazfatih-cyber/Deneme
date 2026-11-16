"""Modül komutları: ``modul-liste``, ``modul-dene``, ``ocr``, ``modul-kiyas`` ve ``meb-pdf`` / ``sor`` bağlantıları."""

from __future__ import annotations

import re
import textwrap
import time
from collections.abc import Callable
from pathlib import Path

from ..ayarlar import AyarHatasi
from ..meb import HARFLER, Soru, soru_oku
from .istemci import ModulHatasi, YerelSunucu
from .katalog import BUYUK_MODELLER, KATALOG, ROLLER, modul_bul

_ACMA_ADIMLARI = (
    "yerel bir model sunucusu kur (ör. Ollama), modeli indir (`ollama pull {ornek}`) ve "
    "ayarlar.toml'da [moduller.{rol}] model = \"{ornek}\" yaz"
)
_ACMA_IPUCU = "Açmak için: " + _ACMA_ADIMLARI + ". Ayrıntı: README, 'DeepSeek modülleri'."


def _sunucu(ayarlar) -> YerelSunucu:
    m = ayarlar.moduller
    return YerelSunucu(m.adres, m.zaman_asimi, m.uzak_sunucu)


def _metin_ayari(ayarlar):
    if not ayarlar.moduller.metin.model:
        raise ModulHatasi("Kıyas (metin) modülü kapalı. " + _ACMA_IPUCU.format(ornek="deepseek-r1:1.5b", rol="metin"))
    return ayarlar.moduller.metin


# ---- modul-liste --------------------------------------------------------------------------------


def komut_modul_liste(arg, ayarlar) -> None:
    print("DeepSeek'in yayımladığı küçük açık modeller (Hugging Face: deepseek-ai)")
    print("[modül]: bu projede bir role bağlanabilir · [katalog]: yalnız bilgi, nedeni açıklamada\n")
    for rol, baslik in ROLLER.items():
        modeller = [m for m in KATALOG if m.rol == rol]
        if not modeller:
            continue
        print(f"{rol} — {baslik}")
        for m in modeller:
            isaret = "[modül]  " if m.durum == "modul" else "[katalog]"
            ek = f" · ollama: {m.ollama}" if m.ollama else ""
            print(f"  {isaret} {m.ad}  ({m.parametre:g} milyar parametre · {m.boyut_gb:g} GB · {m.lisans} · {m.yayin}{ek})")
            print(textwrap.fill(m.aciklama, width=108, initial_indent="            ", subsequent_indent="            "))
        print()
    print(textwrap.fill(BUYUK_MODELLER, width=110))
    mod = ayarlar.moduller
    print(f"\nAyarlar ([moduller]): adres {mod.adres}")
    for rol, bolum in (("ocr", mod.ocr), ("metin", mod.metin)):
        bilgi = modul_bul(bolum.model) if bolum.model else None
        tanim = f" (katalogda: {bilgi.ad})" if bilgi else (" (katalogda yok: başka bir model)" if bolum.model else "")
        print(f"  {rol}: {bolum.model + tanim if bolum.model else 'kapalı'}")
    try:
        modeller = _sunucu(ayarlar).modeller()
    except ModulHatasi as e:
        print(f"Sunucu: {e}")
        return
    print(f"Sunucu: çalışıyor, {len(modeller)} model: {', '.join(modeller) or '(yok)'}")
    for rol, bolum in (("ocr", mod.ocr), ("metin", mod.metin)):
        if bolum.model and not _model_var(bolum.model, modeller):
            print(f"  ! {rol} modeli '{bolum.model}' sunucuda görünmüyor (Ollama: `ollama pull {bolum.model}`).")


def _model_var(model: str, modeller: list[str]) -> bool:
    """Sunucular etiketi farklı yazabilir ("deepseek-ocr" ↔ "deepseek-ocr:latest")."""
    aranan = model.lower()
    adlar = {m.lower() for m in modeller}
    return aranan in adlar or f"{aranan}:latest" in adlar or aranan.removesuffix(":latest") in adlar


# ---- modul-dene ---------------------------------------------------------------------------------


def _ocr_dene(arg, ayarlar) -> bool:
    from .ocr import DENEME_METNI, OcrModulu, benzerlik, deneme_gorseli, gorsel_oku, ocr_modulu

    modul = ocr_modulu(ayarlar)
    modul = OcrModulu(modul.sunucu, modul.ayar, None)  # sınamada önbellek yok: süre gerçek olsun
    if arg.gorsel:
        gorsel, mime = gorsel_oku(Path(arg.gorsel))
        bas = time.time()
        metin = modul.gorselden(gorsel, mime, print)
        print(f"OCR ({modul.ayar.model}, {time.time() - bas:.0f} sn):\n{metin}")
        return True
    png = deneme_gorseli(modul.ayar.dpi)
    if png is None:
        raise ModulHatasi(
            "Sınama sayfası çizilemedi: Türkçe harfleri içeren bir yazı tipi bulunamadı. Kendi görüntünle dene: "
            "python -m turkce_model modul-dene ocr --gorsel sayfa.png"
        )
    print(f"OCR modülü sınanıyor: {modul.ayar.model} @ {modul.sunucu.adres} (Türkçe harfli {len(DENEME_METNI)} satır)")
    bas = time.time()
    metin = modul.gorselden(png, "image/png", print)
    sure = time.time() - bas
    olcu = benzerlik("\n".join(DENEME_METNI), metin)
    print("Okunan metin:\n" + textwrap.indent(metin, "  "))
    print(
        f"Süre {sure:.0f} sn | karakter doğruluğu %{100 * olcu['karakter']:.1f} | Türkçe harfler "
        f"(ç ğ ı İ ö ş ü, {olcu['turkce_harf_sayisi']} adet) %{100 * olcu['turkce_harf']:.1f}"
    )
    iyi = olcu["karakter"] >= 0.97 and olcu["turkce_harf"] >= 0.95
    if iyi:
        print("Sonuç: OCR modülü çalışıyor ve Türkçe harfleri doğru okuyor.")
    else:
        print(
            "Sonuç: okuma zayıf. Kitapçıkları bu ayarla okutma; [moduller.ocr] dpi değerini (ör. 200) ve modeli "
            "denetle, çıkan metni gözle karşılaştır."
        )
    return iyi


def _metin_dene(arg, ayarlar) -> bool:
    from .kiyas import cevap_cikar, soru_istemi

    ayar = _metin_ayari(ayarlar)
    soru = Soru(
        kimlik="deneme:1", kaynak="deneme", ders="Coğrafya", soru="Türkiye'nin başkenti aşağıdakilerden hangisidir?",
        secenekler=["İzmir", "Ankara", "Bursa", "Konya"], cevap=1,
    )
    print(f"Metin modülü sınanıyor: {ayar.model} @ {ayarlar.moduller.adres}")
    bas = time.time()
    cevap = _sunucu(ayarlar).sohbet(ayar.model, [{"role": "user", "content": soru_istemi(soru)}], ayar.en_fazla_token, ek_istek=ayar.ek_istek)
    secim = cevap_cikar(cevap, len(soru.secenekler))
    print(f"Modelin cevabı ({time.time() - bas:.0f} sn): {cevap[:300]!r}")
    if secim is None:
        print("Sonuç: cevaptan şık harfi çıkarılamadı. Model yalnız harf yazmıyorsa [moduller.metin] en_fazla_token'ı büyüt.")
        return False
    print(f"Çıkarılan şık: {HARFLER[secim]} ({'doğru' if secim == soru.cevap else 'yanlış; doğrusu B'}). Sonuç: metin modülü çalışıyor.")
    return True


def komut_modul_dene(arg, ayarlar) -> int:
    roller = [arg.rol] if arg.rol else [r for r in ("ocr", "metin") if getattr(ayarlar.moduller, r).model]
    if not roller:
        raise ModulHatasi(
            "Açık modül yok. OCR modülünü açmak için: "
            + _ACMA_ADIMLARI.format(ornek="deepseek-ocr", rol="ocr")
            + ". Kıyas modülü için aynısı: `ollama pull deepseek-r1:1.5b`, [moduller.metin] model = "
            "\"deepseek-r1:1.5b\". Ayrıntı: README, 'DeepSeek modülleri'."
        )
    tamam = True
    for rol in roller:
        tamam &= _ocr_dene(arg, ayarlar) if rol == "ocr" else _metin_dene(arg, ayarlar)
    return 0 if tamam else 1


# ---- ocr ----------------------------------------------------------------------------------------


def komut_ocr(arg, ayarlar) -> None:
    from .ocr import ocr_modulu

    modul = ocr_modulu(ayarlar)
    hedef = Path(arg.cikti) if arg.cikti else ayarlar.veri_klasoru / "ocr"
    hedef.mkdir(parents=True, exist_ok=True)
    istem = modul.ayar.istem if arg.duz else None
    kullanilan: set[str] = set()
    for dosya in arg.dosya:
        yol = Path(dosya)
        sayfalar = modul.dosya_oku(yol, print, istem)
        ad, n = yol.stem, 1
        while ad.lower() in kullanilan:  # aynı adlı dosyalar (2024/IMG_0001.jpg, 2025/IMG_0001.jpg) birbirini ezmesin
            n += 1
            ad = f"{yol.stem}-{n}"
        kullanilan.add(ad.lower())
        cikti = hedef / f"{ad}.txt"
        cikti.write_text("\n\n".join(s for s in sayfalar if s) + "\n", encoding="utf-8")
        print(f"{yol.name}: {len(sayfalar)} sayfa, {sum(len(s) for s in sayfalar)} karakter → {cikti}")
    print(
        "Not: hakkına sahip olduğun metinleri eğitime katmak için .txt dosyasını veri/ek_metin klasörüne kopyala "
        "(README, 'Daha ileri gitmek')."
    )


# ---- meb-pdf ve sor bağlantıları -----------------------------------------------------------------


def meb_ayristirici(ayarlar, kip: str) -> Callable:
    """``meb-pdf --ocr``: taranmış (ya da ``hepsi`` ile bütün) kitapçıkları OCR modülüyle okuyan ayrıştırıcı."""
    from .meb_metin import ocr_ayristirici
    from .ocr import ocr_modulu

    return ocr_ayristirici(ocr_modulu(ayarlar), kip)


def resimden_soru(yol: str, ayarlar) -> Soru:
    """``sor --resim``: bir soru fotoğrafını OCR ile okuyup ``Soru``ya çevirir (cevabı bilinmez)."""
    from .meb_metin import tek_soru
    from .ocr import KESIK_ISARETI, ocr_modulu

    modul = ocr_modulu(ayarlar)
    metin = "\n\n".join(modul.dosya_oku(Path(yol), print, modul.ayar.istem))
    if KESIK_ISARETI in metin:
        raise ModulHatasi(
            "OCR çıktısı [moduller.ocr] en_fazla_token sınırında kesildi; soru eksik okunmuş olabilir. "
            "Değeri büyüt ya da fotoğrafı tek soruyu içerecek biçimde kırp."
        )
    if sum(1 for s in metin.split("\n") if re.match(r"\(?A\)\s", s.strip())) > 1:  # iki kez "A)": iki soru
        raise ModulHatasi("Görüntüde birden çok soru var; fotoğrafı tek soruyu içerecek biçimde kırp.")
    soru = tek_soru(metin)
    if soru is None:
        raise ModulHatasi(
            "Görüntüden soru çıkarılamadı (kök ve en az iki \"A) …\" seçeneği bulunmalı). OCR'ın okuduğu metin:\n"
            + textwrap.indent(metin[:800] or "(boş)", "  ")
        )
    return soru


# ---- modul-kiyas --------------------------------------------------------------------------------


def komut_modul_kiyas(arg, ayarlar) -> None:
    from ..degerlendirme import OLCUM_SURUMU, ilerleme_ekle
    from .kiyas import kiyasla, ornekle

    ayar = _metin_ayari(ayarlar)
    kaynaklar = [
        ("meb_test", "MEB test", ayarlar.cikti_klasoru / "veri" / "meb_sorular.jsonl", "test"),
        ("mmlu", "TurkishMMLU", ayarlar.veri_klasoru / "meb" / "turkishmmlu.jsonl", None),
    ]
    kumeler = []
    for anahtar, ad, yol, bolum in kaynaklar:
        if yol.exists():
            sorular = [s for s in soru_oku(yol) if bolum is None or s.bolum == bolum]
            if sorular:
                kumeler.append((anahtar, ad, ornekle(sorular, arg.adet), len(sorular)))
    if not kumeler:
        raise AyarHatasi("Kıyaslanacak soru yok. Önce meb-mmlu (TurkishMMLU) ya da meb-pdf + veri-hazirla çalıştır.")
    sunucu = _sunucu(ayarlar)
    onbellek = ayarlar.cikti_klasoru / "moduller" / "kiyas"
    kayit: dict = {"deney": f"modül: {ayar.model}", "asama": "kıyas", "kiyas": True, "olcum": OLCUM_SURUMU}
    print(f"Kıyas: {ayar.model} @ {ayarlar.moduller.adres} (cevaplar {onbellek} altında saklanır; yarıda kesilirse sürer)")
    for anahtar, ad, sorular, toplam in kumeler:
        sonuc = kiyasla(sunucu, ayar, sorular, onbellek, print, ad)
        kayit[anahtar] = sonuc
        ornek = f" (toplam {toplam} sorudan örneklem)" if len(sorular) < toplam else ""
        print(
            f"{ad}: {sonuc['n']} soru{ornek} | doğruluk (üretimle) %{100 * sonuc['dogruluk_uretim']:.1f} | "
            f"cevapsız {sonuc['cevapsiz']} | rastgele tahmin %{100 * sonuc['rastgele']:.1f}"
        )
        if sonuc.get("kesik"):
            print(
                f"  Uyarı: {sonuc['kesik']} cevap en_fazla_token ({ayar.en_fazla_token}) sınırında kesildi (model çoğu kez "
                "düşünürken); bunlar cevapsız sayıldı. [moduller.metin] en_fazla_token değerini büyüt (ör. 4096)."
            )
    md = ilerleme_ekle(ayarlar.cikti_klasoru, kayit)
    print(f"İlerleme tablosuna kıyas satırı eklendi: {md}")
    print(
        "Not: bu satır hazır eğitilmiş bir modelin sonucudur ve cevap yazdırılarak ölçülür; sıfırdan eğittiğin "
        "modelin satırlarıyla birebir aynı ölçüm değildir (README, 'DeepSeek modülleri')."
    )


# ---- kayıt --------------------------------------------------------------------------------------


def komutlari_ekle(ekle: Callable) -> None:
    """``cli.ayristirici`` içinden çağrılır; ``ekle(ad, işlev, yardım)`` alt komut ayrıştırıcısını döndürür."""
    ekle("modul-liste", komut_modul_liste, "DeepSeek'in küçük açık modelleri: hangisi modül olarak bağlanır, sunucu ne durumda?")
    p = ekle("modul-dene", komut_modul_dene, "Açık modülleri bu bilgisayarda sına (OCR: Türkçe harfli sınama sayfası)")
    p.add_argument("rol", nargs="?", choices=("ocr", "metin"), help="Yalnız bu rol (varsayılan: açık olanların hepsi)")
    p.add_argument("--gorsel", help="OCR sınaması için kendi görüntün (verilmezse yerleşik sınama sayfası)")
    p = ekle("ocr", komut_ocr, "Görüntü ve PDF dosyalarını OCR modülüyle metne çevir")
    p.add_argument("dosya", nargs="+", help="PDF ya da görüntü dosyaları (.png, .jpg, .webp …)")
    p.add_argument("--cikti", help="Metinlerin yazılacağı klasör (varsayılan: veri/ocr)")
    p.add_argument("--duz", action="store_true", help="PDF'lerde de düz metin istemini kullan (düzen ve şekil işareti olmadan)")
    p = ekle("modul-kiyas", komut_modul_kiyas, "Küçük bir DeepSeek metin modelini aynı test sorularında ölç, tabloya kıyas satırı ekle")
    p.add_argument("--adet", type=int, default=100, help="Her kümeden en çok kaç soru (varsayılan 100; 0 = hepsi)")
