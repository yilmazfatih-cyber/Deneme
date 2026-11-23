"""DeepSeek modülleri: yerel sunucu istemcisi, OCR, OCR metninden MEB sorusu, kıyas, katalog.

Gerçek bir model çalıştırılmaz: testler bu süreçte açılan sahte bir OpenAI uyumlu sunucuyla konuşur.
Tüm metinler sentetiktir. Adlardaki bulgu numaraları önceki incelemelerin (M1 … M8, m1 … m13) ya da son düzeltme
turunun (M2, M5, M6, M7, M9 … M12) bulgularıdır: aynı numara iki turda farklı kusurları gösterebilir.
"""

from __future__ import annotations

import base64
import http.server
import json
import re
import socket
import struct
import threading
from types import SimpleNamespace

import pytest

from turkce_model import meb
from turkce_model.ayarlar import AyarHatasi
from turkce_model.moduller import katalog, kiyas, komutlar, meb_metin
from turkce_model.moduller.ayar import MetinAyarlari, ModulAyarlari, OcrAyarlari, moduller_uygula
from turkce_model.moduller.istemci import ModulHatasi, YerelSunucu, dusunmeyi_ayikla, yerel_adres_mi
from turkce_model.moduller.ocr import (
    DENEME_METNI,
    GORSEL_ISARETI,
    KESIK_ISARETI,
    OcrModulu,
    benzerlik,
    deneme_gorseli,
    gorsel_oku,
    ocr_temizle,
    tekrar_kirp,
)

try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None

pymupdf_gerekli = pytest.mark.skipif(pymupdf is None, reason="pymupdf kurulu değil")


# ---- sahte yerel sunucu --------------------------------------------------------------------------


class _Istekci(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):  # sessiz
        pass

    def _yaz(self, kod: int, veri: dict | str, basliklar: dict | None = None) -> None:
        metin = isinstance(veri, str)  # düz metin gövde: Ollama kökünün "404 page not found" cevabı gibi
        govde = (veri if metin else json.dumps(veri)).encode("utf-8")
        self.send_response(kod)
        self.send_header("Content-Type", "text/plain; charset=utf-8" if metin else "application/json")
        for ad, deger in (basliklar or {}).items():
            self.send_header(ad, deger)
        self.send_header("Content-Length", str(len(govde)))
        self.end_headers()
        self.wfile.write(govde)

    def _ozel(self, govde: dict | None) -> bool:
        """``server.ozel(yöntem, yol, gövde)`` bir cevap ``(kod, gövde[, başlıklar])`` döndürürse onu yazar."""
        self.server.yollar.append((self.command, self.path))
        cevap = self.server.ozel(self.command, self.path, govde) if self.server.ozel else None
        if cevap is not None:
            self._yaz(*cevap)
        return cevap is not None

    def do_GET(self):
        if self._ozel(None):
            return
        if self.path == "/v1/models":
            self._yaz(200, {"object": "list", "data": [{"id": m} for m in self.server.modeller]})
        else:
            self._yaz(404, {"error": {"message": "not found"}})

    def do_POST(self):
        govde = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.istekler.append(govde)
        if self._ozel(govde):
            return
        if govde.get("model") not in self.server.modeller:
            self._yaz(404, {"error": {"message": f"model '{govde.get('model')}' not found"}})
            return
        cevap = self.server.cevapla(govde)
        metin, bitis = cevap if isinstance(cevap, tuple) else (cevap, "stop")  # ("…", "length"): token sınırı
        self._yaz(200, {"choices": [{"message": {"role": "assistant", "content": metin}, "finish_reason": bitis}]})


def _sunucu_ac() -> http.server.ThreadingHTTPServer:
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Istekci)
    s.modeller = ["deepseek-ocr", "deepseek-r1:1.5b"]
    s.istekler, s.yollar = [], []
    s.cevapla = lambda govde: "tamam"
    s.ozel = None
    s.adres = f"http://127.0.0.1:{s.server_address[1]}/v1"
    threading.Thread(target=s.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()  # hızlı kapanış
    return s


@pytest.fixture
def sunucu():
    """127.0.0.1'de sahte sunucu: ``.adres``, ``.istekler`` (POST gövdeleri), ``.yollar`` (her istek), ``.modeller``,
    ``.cevapla`` (istek → metin ya da ``(metin, finish_reason)``), ``.ozel`` (istek → hazır cevap ya da ``None``)."""
    s = _sunucu_ac()
    yield s
    s.shutdown()
    s.server_close()


def _kapali_adres() -> str:
    with socket.socket() as s:  # boş bir kapı bul, sonra kapat: orada dinleyen yok
        s.bind(("127.0.0.1", 0))
        return f"http://127.0.0.1:{s.getsockname()[1]}/v1"


def _ayarlar(tmp_path, adres: str, ocr: str = "deepseek-ocr", metin: str = "deepseek-r1:1.5b"):
    """``Ayarlar``'ın modüllerin kullandığı kısmı."""
    mod = ModulAyarlari(adres=adres, zaman_asimi=10, ocr=OcrAyarlari(model=ocr), metin=MetinAyarlari(model=metin))
    return SimpleNamespace(moduller=mod, cikti_klasoru=tmp_path / "ciktilar", veri_klasoru=tmp_path / "veri")


def _gorsel_ve_istem(govde: dict) -> tuple[bytes, str]:
    icerik = govde["messages"][0]["content"]
    url = icerik[0]["image_url"]["url"]
    return base64.b64decode(url.split(",", 1)[1]), icerik[1]["text"]


# ---- istemci ------------------------------------------------------------------------------------


def test_yalniz_yerel_adresler_kabul_edilir():
    for adres in ("http://localhost:11434/v1", "http://127.0.0.1:8080/v1", "http://192.168.1.20:8000/v1", "http://[::1]:1234/v1"):
        assert yerel_adres_mi(adres), adres
    for adres in ("https://api.deepseek.com/v1", "http://8.8.8.8/v1", "http://example.com/v1"):
        assert not yerel_adres_mi(adres), adres
    with pytest.raises(ModulHatasi, match="uzak_sunucu = true"):
        YerelSunucu("https://api.deepseek.com/v1")
    assert YerelSunucu("https://api.deepseek.com/v1", uzak_sunucu=True).adres == "https://api.deepseek.com/v1"


def test_sunucu_kapaliysa_ne_yapilacagini_soyler():
    with socket.socket() as s:  # boş bir kapı bul, sonra kapat: orada dinleyen yok
        s.bind(("127.0.0.1", 0))
        kapi = s.getsockname()[1]
    with pytest.raises(ModulHatasi, match="ulaşılamadı") as hata:
        YerelSunucu(f"http://127.0.0.1:{kapi}/v1", zaman_asimi=5).modeller()
    assert "ollama serve" in str(hata.value)


def test_model_yoksa_indirme_komutunu_soyler(sunucu):
    with pytest.raises(ModulHatasi, match="ollama pull yok-model"):
        YerelSunucu(sunucu.adres).sohbet("yok-model", [{"role": "user", "content": "selam"}])


def test_gorsel_istegi_openai_bicimindedir(sunucu):
    sunucu.cevapla = lambda govde: "okunan metin"
    metin = YerelSunucu(sunucu.adres).gorselden_metin(
        "deepseek-ocr", "Free OCR.", b"\x89PNG-sahte", en_fazla_token=77, ek_istek={"skip_special_tokens": False}
    )
    assert metin == "okunan metin"
    govde = sunucu.istekler[-1]
    assert _gorsel_ve_istem(govde) == (b"\x89PNG-sahte", "Free OCR.")
    assert govde["messages"][0]["content"][0]["image_url"]["url"].startswith("data:image/png;base64,")
    assert (govde["temperature"], govde["max_tokens"], govde["stream"]) == (0.0, 77, False)
    assert govde["skip_special_tokens"] is False
    assert YerelSunucu(sunucu.adres).modeller() == ["deepseek-ocr", "deepseek-r1:1.5b"]


def test_dusunme_bloklari_ayiklanir(sunucu):
    assert dusunmeyi_ayikla("<think>\nuzun düşünce\n</think>\n\nCevap: B") == "Cevap: B"
    assert dusunmeyi_ayikla("düşünce devamı</think>B") == "B"
    assert dusunmeyi_ayikla("<think>bitmeyen düşünce") == ""
    sunucu.cevapla = lambda govde: "<think>B mi C mi?</think>C"
    assert YerelSunucu(sunucu.adres).sohbet("deepseek-r1:1.5b", [{"role": "user", "content": "?"}]) == "C"


@pytest.mark.parametrize("kod", [301, 302, 303, 307, 308])
def test_B4_yerel_sunucunun_yonlendirmesi_izlenmez(sunucu, kod):
    hedef = _sunucu_ac()  # yönlendirmenin gösterdiği başka bir sunucu: istek oraya hiç gitmemeli
    try:
        sunucu.ozel = lambda yontem, yol, govde: (kod, {}, {"Location": f"{hedef.adres}/chat/completions"})
        with pytest.raises(ModulHatasi, match=rf"başka bir adrese yönlendirdi \(HTTP {kod} → http://127\.0\.0\.1:\d+/v1/"):
            YerelSunucu(sunucu.adres).sohbet("deepseek-r1:1.5b", [{"role": "user", "content": "SINAV METNİ"}])
        assert hedef.yollar == [] and hedef.istekler == []
    finally:
        hedef.shutdown()
        hedef.server_close()


def test_M1_v1siz_adresin_404u_model_yok_sanilmaz(sunucu, tmp_path, capsys):
    sunucu.ozel = lambda yontem, yol, govde: (404, "404 page not found")  # Ollama kökü: /v1 unutulmuş
    kok = sunucu.adres.removesuffix("/v1")
    ipucu = "404 page not found. Adres OpenAI uyumlu kökü göstermeli (çoğu sunucuda /v1 ile biter)."
    with pytest.raises(ModulHatasi) as hata:
        YerelSunucu(kok).sohbet("deepseek-r1:1.5b", [{"role": "user", "content": "?"}])
    assert str(hata.value).endswith(ipucu) and "modeli yok" not in str(hata.value)
    komutlar.komut_modul_liste(SimpleNamespace(), _ayarlar(tmp_path, kok))
    sunucu_satiri = next(s for s in capsys.readouterr().out.splitlines() if s.startswith("Sunucu:"))
    assert sunucu_satiri == f"Sunucu: Yerel model sunucusu hata döndürdü (HTTP 404, {kok}): {ipucu}"


@pytest.mark.parametrize(
    "mesaj", ["model 'x' not found, try pulling it first", "The model `x` does not exist.", "model not found"]
)
def test_M1_gercek_model_yok_iletisi_indirme_komutunu_soyler(sunucu, mesaj):
    sunucu.ozel = lambda yontem, yol, govde: (404, {"error": {"message": mesaj}}) if yontem == "POST" else None
    with pytest.raises(ModulHatasi, match="ollama pull x"):
        YerelSunucu(sunucu.adres).sohbet("x", [{"role": "user", "content": "?"}])


def test_m1_ters_bolu_ya_da_kullanici_bilgisi_tasiyan_adres_yerel_sayilmaz():
    # urlsplit "localhost" görür ama requests "uzak.example"a bağlanır: koruma atlatılmasın.
    for adres in ("http://uzak.example:8080\\@localhost/v1", "http://kullanici@192.168.1.5:8000/v1"):
        assert not yerel_adres_mi(adres), adres
        with pytest.raises(ModulHatasi, match="uzak_sunucu = true"):
            YerelSunucu(adres)


def test_m2_G3_bozuk_adres_ayarlarda_reddedilir():
    # m2: bozuk IPv6 adresi ValueError ile çökmez, modül hatası olur.
    with pytest.raises(ModulHatasi):
        YerelSunucu("http://[::1:11434/v1")
    # G3: ayarlar okunurken adresin ayrıştırılamadığı söylenir ("yerel değil" denmez).
    for bozuk in ("http://[::1/v1", "http://[::1:11434/v1", "http://localhost:abc/v1", "http://localhost:99999/v1",
                  "http:///v1", "http://local host:11434/v1"):
        with pytest.raises(AyarHatasi, match=r"moduller\.adres geçerli bir adres değil \(şu an: ") as hata:
            moduller_uygula(ModulAyarlari(), {"adres": bozuk})
        assert "ör. http://localhost:11434/v1" in str(hata.value), bozuk
    for iyi in ("http://[::1]:11434/v1", "http://192.168.1.20:8000/v1", "https://ornek.local/v1"):
        assert moduller_uygula(ModulAyarlari(), {"adres": iyi}).adres == iyi


@pytest.mark.parametrize("veri", [5, "abc", None, {"id": "x"}], ids=["sayi", "metin", "yok", "sozluk"])
def test_m3_models_cevabinda_data_liste_degilse_bos_doner(sunucu, veri):
    sunucu.ozel = lambda yontem, yol, govde: (200, {"data": veri}) if yol.endswith("/models") else None
    assert YerelSunucu(sunucu.adres).modeller() == []


@pytest.mark.parametrize("deger", [float("nan"), float("inf"), float("-inf")], ids=["nan", "inf", "-inf"])
def test_m4_sonlu_olmayan_zaman_asimi_reddedilir(deger):
    with pytest.raises(AyarHatasi, match=r"moduller\.zaman_asimi pozitif bir sayı"):
        moduller_uygula(ModulAyarlari(), {"zaman_asimi": deger})


@pytest.mark.parametrize("deger", [1e10, 10**12, 10**400, 604801], ids=["1e10", "10-uzeri-12", "float-tasan", "bir-hafta-1"])
def test_M6_cok_buyuk_zaman_asimi_reddedilir(deger):
    # 1e10 doğrulamadan geçiyor, istek "timestamp out of range for C PyTime_t" ile izleme dökümü veriyordu.
    with pytest.raises(AyarHatasi, match=r"moduller\.zaman_asimi pozitif bir sayı \(saniye\) olmalı, en çok 604800 \(bir hafta\)"):
        moduller_uygula(ModulAyarlari(), {"zaman_asimi": deger})
    assert moduller_uygula(ModulAyarlari(), {"zaman_asimi": 604800}).zaman_asimi == 604800


def test_M6_modul_liste_buyuk_zaman_asimini_izleme_dokumsuz_reddeder(tmp_path, monkeypatch, capsys):
    from turkce_model.cli import main

    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("[moduller]\nzaman_asimi = 10000000000\n", encoding="utf-8")
    assert main(["modul-liste"]) == 2
    assert capsys.readouterr().err.strip().endswith(
        "moduller.zaman_asimi pozitif bir sayı (saniye) olmalı, en çok 604800 (bir hafta) (şu an: 10000000000)"
    )


# ---- OCR: temizleme ve önbellek ------------------------------------------------------------------

HAM_OCR = """<|ref|>title<|/ref|><|det|>[[73, 60, 925, 110]]<|/det|>
# (111) TÜRK DİLİ VE EDEBİYATI - 1

<|ref|>text<|/ref|><|det|>[[73, 120, 925, 180]]<|/det|>
**1.** Aşağıdakilerden hangisi \\( x^{2} + \\frac{1}{2} \\) ifadesine eşittir?

- A) İlk seçenek
- B) İkinci seçenek
<|ref|>image<|/ref|><|det|>[[100, 200, 400, 500]]<|/det|>
<table><tr><td>1</td><td>A</td><td>2</td><td>C</td></tr></table>
| Kavram | Anlam |
| --- | --- |
| Sevgi | Nefret |
- Konuşma çizgisi kalır<|end▁of▁sentence|>
"""


def test_ocr_temizle_etiketleri_tablolari_ve_markdownu_sadelestirir():
    satirlar = [s for s in ocr_temizle(HAM_OCR).split("\n") if s]
    assert satirlar == [
        "(111) TÜRK DİLİ VE EDEBİYATI - 1",
        "1. Aşağıdakilerden hangisi x^(2) + 1/2 ifadesine eşittir?",
        "A) İlk seçenek",
        "B) İkinci seçenek",
        GORSEL_ISARETI,
        "1 / A / 2 / C",
        "Kavram / Anlam",
        "Sevgi / Nefret",
        "- Konuşma çizgisi kalır",
    ]
    assert ocr_temizle("Düz metin\nikinci satır") == "Düz metin\nikinci satır"
    # Eşitsizlikler HTML etiketi sanılmaz; üst/alt simge PDF yolundaki gibi yazılır.
    assert ocr_temizle("a<b ve c>d ise x<sup>2</sup> + H<sub>2</sub>O <b>kalın</b>") == "a<b ve c>d ise x^(2) + H_(2)O kalın"


def test_tekrar_kirp_yalniz_gercek_tekrari_kirpar():
    assert tekrar_kirp("ilk satır\n" + "aynı satır\n" * 30) == ("ilk satır\naynı satır", True)
    assert tekrar_kirp("metin " + "abc def " * 40) == ("metin abc def", True)
    assert tekrar_kirp("A) bir\nB) iki\nC) üç") == ("A) bir\nB) iki\nC) üç", False)
    assert tekrar_kirp("D) hepsi\nD) hepsi") == ("D) hepsi\nD) hepsi", False)  # iki kez yinelenen satır tekrar değil


def test_ocr_onbellegi_ayni_goruntuyu_ikinci_kez_gondermez(sunucu, tmp_path):
    sunucu.cevapla = lambda govde: "# Başlık\n\nmetin"
    modul = OcrModulu(YerelSunucu(sunucu.adres), OcrAyarlari(model="deepseek-ocr"), tmp_path / "onbellek")
    assert modul.gorselden(b"goruntu-1") == "Başlık\n\nmetin"
    assert modul.gorselden(b"goruntu-1") == "Başlık\n\nmetin"
    assert len(sunucu.istekler) == 1
    modul.gorselden(b"goruntu-2")
    modul.gorselden(b"goruntu-1", istem="<|grounding|>Convert the document to markdown.")  # istem değişti
    assert len(sunucu.istekler) == 3
    assert not list((tmp_path / "onbellek").glob("*.yaziliyor"))


@pymupdf_gerekli
def test_pdf_sayfa_sayfa_okunur_ve_kitapcik_istemi_kullanilir(sunucu, tmp_path):
    belge = pymupdf.open()
    for _ in range(3):
        belge.new_page(width=200, height=200)
    pdf = tmp_path / "taranmis.pdf"
    belge.save(pdf)
    belge.close()
    sunucu.cevapla = lambda govde: f"sayfa metni {len(sunucu.istekler)}"
    modul = OcrModulu(YerelSunucu(sunucu.adres), OcrAyarlari(model="deepseek-ocr", dpi=72), tmp_path / "onbellek")
    satirlar: list[str] = []
    # Boş sayfaların görüntüleri aynıdır: ilki sunucudan, diğerleri önbellekten gelir.
    assert modul.pdf_oku(pdf, satirlar.append) == ["sayfa metni 1"] * 3
    assert len(sunucu.istekler) == 1 and "sayfa 3/3" in satirlar[-1] and "önbellekten" in satirlar[-1]
    gorsel, istem = _gorsel_ve_istem(sunucu.istekler[0])
    assert gorsel.startswith(b"\x89PNG") and istem == "<|grounding|>Convert the document to markdown."


def _sorular_ocr(ham: str, anahtar: str = "CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. C\n3. B") -> dict[str, meb.Soru]:
    """Modelin ham çıktısı (tek sayfa) → temizlenip ayrıştırılan sorular (``"kod:no"`` → soru)."""
    sorular, _ = meb_metin.metinden_ayristir([ocr_temizle(ham), anahtar], "k.pdf", yaz=lambda m: None)
    return {f"{s.ek['ders_kodu']}:{s.ek['soru_no']}": s for s in sorular}


def test_F11_tablodaki_secenekler_ayracsiz_birlesir():
    ham = (
        "# (111) TARİH - 1\n\n1. Lale Devri'nde aşağıdakilerden hangisi yapılmıştır?\n\n"
        "<table><tr><td>A) Matbaa kurulmuştur</td><td>B) Ordu kaldırılmıştır</td></tr>"
        "<tr><td>C) Meclis açılmıştır</td><td>D) Anayasa yapılmıştır</td></tr></table>\n\n"
        "2. Hangisi bir duygudur?\n\n<table><tr><td>A)</td><td>Masa</td><td>B)</td><td>Kalem</td></tr>"
        "<tr><td>C)</td><td>Sevgi</td><td>D)</td><td>Taş</td></tr></table>\n\n"
        "3. Aşağıdakilerden hangisi bir şehirdir?\n\n| A) Deniz | B) Ankara |\n| --- | --- |\n| C) Hava | D) Uzay |\n"
    )
    sorular = _sorular_ocr(ham)
    assert sorular["111:1"].secenekler == ["Matbaa kurulmuştur", "Ordu kaldırılmıştır", "Meclis açılmıştır", "Anayasa yapılmıştır"]
    assert sorular["111:2"].secenekler == ["Masa", "Kalem", "Sevgi", "Taş"]
    assert sorular["111:3"].secenekler == ["Deniz", "Ankara", "Hava", "Uzay"]
    # Karşı durum: seçenek olmayan hücreler " / " ile ayrılır (cevap anahtarı tablosu, "Sevgi / Nefret").
    assert ocr_temizle("<table><tr><td>1</td><td>A</td><td>2</td><td>C</td></tr></table>").strip() == "1 / A / 2 / C"
    assert ocr_temizle("<table><tr><td>A)</td><td>Sevgi</td><td>Nefret</td></tr></table>").strip() == "A) Sevgi / Nefret"


B2_HAM = (  # sunucu özel token'ları atınca (skip_special_tokens) konum etiketlerinden kalan
    "title[[73, 60, 925, 110]]\n# (111) TARİH - 1\n\n"
    "text[[60, 100, 940, 140]]\n1. Osmanlı Devleti'nin kuruluş döneminde aşağıdakilerden hangisi yaşanmıştır?\n\n"
    "text[[60, 150, 940, 260]]\nA) Bursa'nın fethi\nB) İstanbul'un fethi\nC) Mohaç Savaşı\nD) Viyana kuşatması\n\n"
    "text[[60, 280, 940, 320]]\n2. Numaralanmış yerlerden hangisi bir deltadır?\n\nimage[[100, 330, 800, 500]]\n\n"
    "text[[60, 520, 940, 620]]\nA) I\nB) II\nC) III\nD) IV\n\n"
    "text[[60, 630, 940, 660]]\n3. Hangisi bir gezegendir?\n\ntext[[60, 670, 940, 700]]\nA) Ay\nB) Mars\nC) Güneş\nD) Sirius"
)


def test_B2_ozel_token_artigi_etiket_gibi_temizlenir():
    assert "[[" not in ocr_temizle(B2_HAM) and GORSEL_ISARETI in ocr_temizle(B2_HAM)
    etiketli = re.sub(r"^(title|text|image)(\[\[[^\n]*\]\])", r"<|ref|>\1<|/ref|><|det|>\2<|/det|>", B2_HAM, flags=re.M)
    for ham in (B2_HAM, etiketli):  # artıklı ve etiketli çıktı aynı soruları verir; şekilli 2. soru elenir
        sorular = _sorular_ocr(ham)
        assert set(sorular) == {"111:1", "111:3"}
        assert sorular["111:1"].soru == "Osmanlı Devleti'nin kuruluş döneminde aşağıdakilerden hangisi yaşanmıştır?"
        assert sorular["111:1"].secenekler[3] == "Viyana kuşatması"


@pytest.mark.parametrize(
    ("ham", "temiz"),
    [
        pytest.param("1 $ = 30 TL olduğuna göre 20 $ kaç TL'dir?", "1 $ = 30 TL olduğuna göre 20 $ kaç TL'dir?", id="B3-fiyat"),
        pytest.param("Kalemin fiyatı 5$ ise 3 kalem kaç $ eder?", "Kalemin fiyatı 5$ ise 3 kalem kaç $ eder?", id="B3-bitisik-fiyat"),
        pytest.param("$x^2$ ifadesinin değeri", "x^2 ifadesinin değeri", id="B3-satir-ici-formul"),
        pytest.param("\\( x^{2} \\) ve $$\\frac{1}{2}$$", "x^(2) ve 1/2", id="B3-blok-formul"),
        # R4: satırlara bölünmüş "$$ … $$" bloğunun sınırları da atılır (eşleştirme satır satır yapılır).
        pytest.param("Denklem:\n$$\n\\frac{a}{b} = 2\n$$\nBuna göre a kaçtır?", "Denklem:\n\na/b = 2\n\nBuna göre a kaçtır?", id="R4-cok-satirli-blok"),
        pytest.param("|x - 2| = 5 denkleminin çözüm kümesi hangisidir?", "|x - 2| = 5 denkleminin çözüm kümesi hangisidir?", id="M5-mutlak-deger"),
        pytest.param("|a| + |b| = 7 olduğuna göre a kaçtır?", "|a| + |b| = 7 olduğuna göre a kaçtır?", id="M5-iki-mutlak-deger"),
        pytest.param("Bir açının ölçüsü \\( 30^{\\circ} \\) ise", "Bir açının ölçüsü 30° ise", id="m12-derece"),
        pytest.param("Bir açının ölçüsü \\( 45^\\circ \\) ise", "Bir açının ölçüsü 45° ise", id="M7-parantezsiz-derece"),
        pytest.param("\\( 45 ^ \\circ \\) ve 90^\\degree", "45° ve 90°", id="M7-bosluklu-derece"),
        pytest.param("\\( A = \\{1, 2, 3\\} \\) kümesi", "A = {1, 2, 3} kümesi", id="m12-kume"),
        pytest.param("\\( \\log_{2} 8 \\) değeri", "log_(2) 8 değeri", id="m12-log"),
        pytest.param("\\( x \\in \\mathbb{R} \\) olmak üzere", "x ∈ R olmak üzere", id="m12-mathbb"),
        pytest.param("\\( A \\cup B \\) kümesi", "A ∪ B kümesi", id="m12-birlesim"),
        pytest.param("Boşluğa ____ ve ____ sözcükleri getirilmelidir.", "Boşluğa ____ ve ____ sözcükleri getirilmelidir.", id="m13-bosluk"),
        pytest.param("2**3 ile 3**2 karşılaştırılırsa", "2**3 ile 3**2 karşılaştırılırsa", id="m13-us"),
        pytest.param("**1.** Doğru cevap **A** şıkkıdır.", "1. Doğru cevap A şıkkıdır.", id="m13-karsi-durum-vurgu"),
        # R5: vurgulu sözcüğe kesmesiz eklenen ek ("**Ankara**nın") vurgu işaretini bırakmaz.
        pytest.param("**Ankara**nın nüfusu", "Ankaranın nüfusu", id="R5-vurgu-ardinda-ek"),
    ],
)
def test_ocr_temizle_metni_bozmaz(ham, temiz):  # B3, M5, m12, m13, R4, R5, M7 (tur 5)
    assert ocr_temizle(ham) == temiz


def test_M6_uzun_tekrar_dongusu_bastan_kirpilir():
    for dongu in ("abc def ghi " * 1360, "a" * 100_000):  # 16 KB ve 100 KB: 6000 karakterlik pencereden uzun
        metin, kirpildi = tekrar_kirp("Soru metni burada. " + dongu)
        assert kirpildi and metin.startswith("Soru metni burada.") and len(metin) < 40, len(metin)


def test_M7_bos_cikti_onbellege_yazilmaz(sunucu, tmp_path):
    cevaplar = iter(["", "Gerçek sayfa metni"])  # geçici boş cevap, sonra asıl metin
    sunucu.cevapla = lambda govde: next(cevaplar)
    modul = OcrModulu(YerelSunucu(sunucu.adres), OcrAyarlari(model="deepseek-ocr"), tmp_path / "onbellek")
    assert modul.gorselden(b"gorsel-1") == ""
    assert modul.gorselden(b"gorsel-1") == "Gerçek sayfa metni" and len(sunucu.istekler) == 2
    assert modul.gorselden(b"gorsel-1") == "Gerçek sayfa metni" and len(sunucu.istekler) == 2  # dolu çıktı önbellekte


@pymupdf_gerekli
def test_m8_bozuk_bos_ve_parolali_pdf_modul_hatasi_verir(sunucu, tmp_path):
    (tmp_path / "bozuk.pdf").write_bytes(b"%PDF-1.4 bozuk")
    (tmp_path / "bos.pdf").write_bytes(b"")
    belge = pymupdf.open()
    belge.new_page()
    belge.save(tmp_path / "parolali.pdf", encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="gizli", owner_pw="sahip")
    belge.close()
    ayarlar = _ayarlar(tmp_path, sunucu.adres)
    for ad, ileti in (("bozuk.pdf", "PDF açılamadı"), ("bos.pdf", "PDF açılamadı"), ("parolali.pdf", "PDF parola korumalı")):
        with pytest.raises(ModulHatasi, match=ileti):  # komut satırında iz dökümü değil, kısa ileti
            komutlar.komut_ocr(SimpleNamespace(dosya=[str(tmp_path / ad)], cikti=None, duz=False), ayarlar)
    assert sunucu.istekler == []


def _bmp(genislik: int = 4, yukseklik: int = 2) -> bytes:
    """24 bitlik, sıkıştırmasız küçük bir BMP."""
    satir = (b"\x00\x00\xff" * genislik).ljust((genislik * 3 + 3) // 4 * 4, b"\x00")
    piksel = satir * yukseklik
    bilgi = struct.pack("<IiiHHIIiiII", 40, genislik, yukseklik, 1, 24, 0, len(piksel), 2835, 2835, 0, 0)
    return b"BM" + struct.pack("<IHHI", 14 + 40 + len(piksel), 0, 0, 54) + bilgi + piksel


_GIF = bytes.fromhex("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")


@pymupdf_gerekli
def test_m10_bmp_ve_gif_pngye_cevrilip_gonderilir(sunucu, tmp_path):
    # Ollama yalnız JPEG, PNG ve WebP veri adresi kabul eder: BMP/GIF PNG'ye çevrilmeli.
    sunucu.cevapla = lambda govde: "1. Hangisi bir sayıdır?\n\nA) Bir\nB) Ev"
    (tmp_path / "soru.bmp").write_bytes(_bmp())
    (tmp_path / "soru.gif").write_bytes(_GIF)
    for ad in ("soru.bmp", "soru.gif"):
        soru = komutlar.resimden_soru(str(tmp_path / ad), _ayarlar(tmp_path, sunucu.adres))
        assert soru.secenekler == ["Bir", "Ev"]
        url = sunucu.istekler[-1]["messages"][0]["content"][0]["image_url"]["url"]
        assert url.startswith("data:image/png;base64,") and _gorsel_ve_istem(sunucu.istekler[-1])[0].startswith(b"\x89PNG")
    (tmp_path / "bozuk.gif").write_bytes(b"GIF89a-bozuk")
    with pytest.raises(ModulHatasi, match="görüntü okunamadı"):
        gorsel_oku(tmp_path / "bozuk.gif")


def _sayfali_pdf(yol, sayfa: int) -> None:
    """Metin katmanı olmayan, her sayfanın görüntüsü farklı PDF (önbellek anahtarı sayfaya göre değişsin)."""
    belge = pymupdf.open()
    for i in range(sayfa):
        belge.new_page(width=200, height=200).draw_rect(pymupdf.Rect(10 + 20 * i, 10, 25 + 20 * i, 25), fill=(0, 0, 0))
    belge.save(yol)
    belge.close()


@pymupdf_gerekli
def test_B1_token_sinirinda_kesilen_sayfanin_son_sorusu_elenir(sunucu, tmp_path):
    sayfa1 = (
        "(111) TARİH - 1\n\n1. Hangisi bir başkenttir?\n\nA) Ankara\nB) Deniz\nC) Hava\nD) Uzay\n\n"
        "2. Aşağıdakilerden hangisi Tanzimat Fermanı'nın sonuçlarından biridir?\n\nA) Kanun önünde eşitlik\n"
        "B) Saltanatın kaldırılması\nC) Cumhuriyetin ilanı\nD) Halifeliğin kal"
    )
    cevaplar = iter([(sayfa1, "length"), ("CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. A", "stop")])
    sunucu.cevapla = lambda govde: next(cevaplar)
    _sayfali_pdf(tmp_path / "taranmis.pdf", 2)
    modul = OcrModulu(YerelSunucu(sunucu.adres), OcrAyarlari(model="deepseek-ocr", dpi=72), tmp_path / "onbellek")
    satirlar: list[str] = []
    sorular, rapor = meb_metin.ocr_ayristirici(modul, "hepsi")(tmp_path / "taranmis.pdf", yaz=satirlar.append)
    assert [s.ek["soru_no"] for s in sorular] == [1] and rapor["elenen"] == {"gorsel_gerekli": 1}
    assert any("sayfa 1/2" in s and "çıktı en_fazla_token (4096) sınırında kesildi" in s for s in satirlar)
    assert not any("sayfa 2/2" in s and "kesildi" in s for s in satirlar)
    # İşaret önbellekte de durur: ikinci okuma sunucuya gitmeden aynı sonucu verir.
    assert sum(KESIK_ISARETI in p.read_text(encoding="utf-8") for p in (tmp_path / "onbellek").glob("*.txt")) == 1
    sorular2, _ = meb_metin.ocr_ayristirici(modul, "hepsi")(tmp_path / "taranmis.pdf", yaz=lambda m: None)
    assert [s.ek["soru_no"] for s in sorular2] == [1] and len(sunucu.istekler) == 2


@pymupdf_gerekli
def test_B1_donguye_giren_kesik_sayfada_tekrar_yine_kirpilir(sunucu, tmp_path):
    # Tekrar döngüsü de token sınırında biter: [KESİK] işareti kırpmayı engellememeli.
    sunucu.cevapla = lambda govde: ("1. Hangisi bir gezegendir?\n\n" + "A) Ay\n" * 40, "length")
    _sayfali_pdf(tmp_path / "t.pdf", 1)
    modul = OcrModulu(YerelSunucu(sunucu.adres), OcrAyarlari(model="deepseek-ocr", dpi=72), None)
    satirlar: list[str] = []
    (metin,) = modul.pdf_oku(tmp_path / "t.pdf", satirlar.append)
    assert metin.count("A) Ay") == 1 and metin.endswith(KESIK_ISARETI)
    assert "tekrar kırpıldı" in satirlar[-1] and "sınırında kesildi" in satirlar[-1]


# ---- OCR metninden MEB sorusu --------------------------------------------------------------------

KITAPCIK_METNI = [
    "1. OTURUM\n\n(111) TARİH - 1\n\n"
    "1. Birinci soruda kaynak olarak (Örnek kaynak, 1 ve\n2. ayetler) verilmiştir. Buna göre hangisi doğrudur?\n\n"
    "A) Birinci seçenek\nB) İkinci seçenek\nC) Üçüncü seçenek\nD) Dördüncü seçenek\n\n"
    "2. Aşağıdaki gelişmelerden hangisi\n2. Dünya Savaşı'ndan sonra yaşanmıştır?\n\n"
    "A) Kuruluş  B) Yükseliş\nC) Duraklama  D) Yenilenme\n\n2",
    "1. OTURUM\n\n3. Üçüncü sorunun kökü aşağıdakilerden hangisidir?\n\n" + GORSEL_ISARETI + "\n\n"
    "A) Bir\nB) İki\nC) Üç\nD) Dört\n\n"
    "4. Dördüncü soruda hangisi söylenebilir?\n\nA) Yalnız I\nB) Yalnız II\nC) I ve II\nD) I, II ve III\n\n3",
    "1. OTURUM\n\n(222) COĞRAFYA - 1\n\n1. Hangisi bir akarsu şeklidir?\n\nA) Delta\nB) Kumul\nC) Moren\nD) Lapya\n\n4",
    "CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1 / C / 2 / A\n\n3 / B / 4 / D\n\n(222) COĞRAFYA - 1\n\n1. A",
]


def _sorular(sayfalar: list[str]) -> tuple[dict[str, meb.Soru], dict]:
    sorular, rapor = meb_metin.metinden_ayristir(sayfalar, "kitapcik.pdf", yaz=lambda m: None)
    return {f"{s.ek['ders_kodu']}:{s.ek['soru_no']}": s for s in sorular}, rapor


def test_ocr_metninden_sorular_cikar_sahte_soru_baslari_birlesir():
    sorular, rapor = _sorular(KITAPCIK_METNI)
    assert rapor["okuma"] == "ocr" and rapor["bulunan"] == 5 and rapor["elenen"] == {"gorsel_gerekli": 1}
    assert set(sorular) == {"111:1", "111:2", "111:4", "222:1"}  # 3. soru şekilli: elendi
    s1, s2 = sorular["111:1"], sorular["111:2"]
    # "2. ayetler)" ve "2. Dünya Savaşı'ndan" satırları soru başı değildir: kök tek parça kalır.
    assert s1.soru == "Birinci soruda kaynak olarak (Örnek kaynak, 1 ve 2. ayetler) verilmiştir. Buna göre hangisi doğrudur?"
    assert s1.secenekler == ["Birinci seçenek", "İkinci seçenek", "Üçüncü seçenek", "Dördüncü seçenek"] and s1.cevap == 2
    assert s2.soru == "Aşağıdaki gelişmelerden hangisi 2. Dünya Savaşı'ndan sonra yaşanmıştır?"
    assert s2.secenekler == ["Kuruluş", "Yükseliş", "Duraklama", "Yenilenme"] and s2.cevap == 0
    assert sorular["111:4"].cevap == 3 and sorular["222:1"].cevap == 0
    assert sorular["222:1"].ders.startswith("Coğrafya")
    # Sayfa başlığı ("1. OTURUM") ve sayfa numaraları hiçbir soruya karışmaz.
    assert not any("OTURUM" in s.soru or "OTURUM" in " ".join(s.secenekler) for s in sorular.values())


def test_kapaktaki_cevap_anahtari_cumlesi_baslik_sayilmaz_ders_basligi_kenar_sayilmaz():
    kapak = "AÇIK ÖĞRETİM SINAVI\n\nCevap anahtarı, kitapçığın son sayfasındadır.\n\nBaşarılar dileriz."
    # Her sayfa aynı ders başlığıyla başlıyor: yinelenen satır olsa da sayfa başlığı gibi atılmamalı.
    sayfalar = [kapak] + [
        f"(111) TARİH - 1\n\n{no}. {no}. sorunun kökü hangisidir?\n\nA) Bir\nB) İki\nC) Üç\nD) Dört"
        for no in (1, 2, 3)
    ] + ["Cevap Anahtarı\n\n(111) TARİH - 1\n\n1. A\n2. B\n3. C"]
    sorular, rapor = _sorular(sayfalar)
    assert {k: s.cevap for k, s in sorular.items()} == {"111:1": 0, "111:2": 1, "111:3": 2}
    assert rapor["anahtar_sayfasi"] == 1 and rapor["soru_sayfasi"] == 4


def test_celiskili_cevap_anahtari_o_dersi_eler():
    sayfalar = KITAPCIK_METNI[:3] + ["CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1 / C / 1 / A / 2 / A\n\n3 / B / 4 / D\n\n(222) COĞRAFYA - 1\n\n1. A"]
    sorular, rapor = _sorular(sayfalar)
    # Tarih'te 1. soru iki farklı harfle okundu (yan yana sütunlar karışmış): dersin hiçbir cevabına güvenilmez.
    assert set(sorular) == {"222:1"} and rapor["elenen"]["cevap_yok"] == 4


@pytest.mark.skipif(pymupdf is None, reason="pymupdf kurulu değil")
def test_ocr_yolu_pdf_yoluyla_ayni_sorulari_verir(tmp_path):
    test_meb = pytest.importorskip("test_meb")
    if test_meb.YAZI_TIPI is None:
        pytest.skip("Türkçe harfli yazı tipi yok")
    pdf = test_meb._kitapcik_yap(tmp_path / "kitapcik.pdf")
    beklenen, _ = meb.pdf_ayristir(pdf, yaz=lambda m: None)
    # "OCR gibi" metin: ayrıştırıcının okuma sırasındaki satırları, konum bilgisi atılarak sayfa sayfa.
    _, _, belge, bilgi = meb._ayristir(pdf)
    sayfa_metni: dict[int, list[str]] = {no: [] for no in range(1, belge.sayfa_sayisi + 1)}
    for s in bilgi["satirlar"]:
        sayfa_metni[s.sayfa].append(s.metin)
    genislik = max(w for w, _ in belge.boyutlar.values())
    for no in bilgi["anahtar_sayfalari"]:
        govde = meb._anahtar_govdesi(belge.parcalar[no])
        satirlar = meb._satirlara_ayir(govde, meb._sutun_sinirlari(govde, genislik))
        sayfa_metni[no] = ["CEVAP ANAHTARI"] + [s.metin for s in satirlar]
    okunan, rapor = meb_metin.metinden_ayristir(
        ["\n".join(sayfa_metni[no]) for no in sorted(sayfa_metni)], "kitapcik.pdf", yaz=lambda m: None
    )
    okunan = {s.kimlik: s for s in okunan}
    assert beklenen and rapor["bulunan"] == 14
    for s in beklenen:  # PDF yolunun tuttuğu her soru OCR yolunda da aynı kök, seçenek ve cevapla çıkar
        o = okunan[s.kimlik]
        assert (o.soru.split(), o.secenekler, o.cevap) == (s.soru.split(), s.secenekler, s.cevap), s.kimlik


def test_tek_soru_fotograf_metninden_kurulur():
    s = meb_metin.tek_soru("7. Aşağıdakilerden hangisi bir\nbaşkenttir?\n\nA) Ankara\nB) İzmir  C) Bursa\nD) Konya")
    assert s.soru == "Aşağıdakilerden hangisi bir başkenttir?" and s.secenekler == ["Ankara", "İzmir", "Bursa", "Konya"]
    assert s.ek["cevap_bilinmiyor"] and meb.istem(s).endswith("D) Konya\nCevap:")
    assert meb_metin.tek_soru("Seçeneği olmayan düz bir paragraf.") is None
    assert meb_metin.tek_soru("") is None


@pymupdf_gerekli
def test_meb_ayristirici_yalniz_metinsiz_pdfleri_ocr_ile_okur(sunucu, tmp_path):
    klasor = tmp_path / "pdf"
    klasor.mkdir()
    belge = pymupdf.open()
    for _ in KITAPCIK_METNI:
        belge.new_page(width=300, height=400)  # metin katmanı yok: taranmış kitapçık gibi
    belge.save(klasor / "taranmis.pdf")
    belge.close()
    assert not meb_metin.metin_katmani_var(klasor / "taranmis.pdf")
    # Sayfa görüntüleri aynı (boş) olduğundan cevabı istek sırasına göre veriyoruz; önbellek kapalı.
    sunucu.cevapla = lambda govde: KITAPCIK_METNI[len(sunucu.istekler) - 1]
    modul = OcrModulu(YerelSunucu(sunucu.adres), OcrAyarlari(model="deepseek-ocr", dpi=72), None)
    rapor = meb.pdf_klasoru_ayristir(
        klasor, tmp_path / "meb_pdf.jsonl", yaz=lambda m: None, ayristirici=meb_metin.ocr_ayristirici(modul, "gerekirse")
    )
    sorular = meb.soru_oku(tmp_path / "meb_pdf.jsonl")
    assert rapor["yazilan"] == 4 and len(sunucu.istekler) == len(KITAPCIK_METNI)
    assert all(s.ek["okuma"] == "ocr" and s.ek["ocr_model"] == "deepseek-ocr" for s in sorular)
    with pytest.raises(ValueError, match="kip"):
        meb_metin.ocr_ayristirici(modul, "bazen")


@pymupdf_gerekli
def test_m9_sunucu_hatasi_klasoru_yarim_yazmadan_durdurur(sunucu, tmp_path):
    klasor, hedef = tmp_path / "pdf", tmp_path / "meb_pdf.jsonl"
    klasor.mkdir()
    _sayfali_pdf(klasor / "a.pdf", 1)
    sunucu.cevapla = lambda govde: (
        "(111) TARİH - 1\n\n1. Hangisi bir başkenttir?\n\nA) Ankara\nB) Deniz\nC) Hava\nD) Uzay\n\n"
        "2. Hangisi bir gezegendir?\n\nA) Ay\nB) Mars\nC) Güneş\nD) Sirius\n\nCEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. B"
    )
    onbellek = tmp_path / "onbellek"
    ayar = OcrAyarlari(model="deepseek-ocr", dpi=72)
    modul = OcrModulu(YerelSunucu(sunucu.adres), ayar, onbellek)
    meb.pdf_klasoru_ayristir(klasor, hedef, yaz=lambda m: None, ayristirici=meb_metin.ocr_ayristirici(modul, "gerekirse"))
    once = hedef.read_bytes()
    assert len(meb.soru_oku(hedef)) == 2
    # Yeni kitapçık eklendi, sunucu kapalı: a.pdf önbellekten okunur ama b.pdf okunamaz. Hata dosyaya özgü değil
    # (her kitapçıkta yinelenir): "1 okunamadı" deyip eksik çıktı yazmak yerine sunucunun iletisiyle durulur.
    _sayfali_pdf(klasor / "b.pdf", 2)
    kapali = OcrModulu(YerelSunucu(_kapali_adres(), zaman_asimi=5), ayar, onbellek)
    with pytest.raises(ModulHatasi, match="ulaşılamadı"):
        meb.pdf_klasoru_ayristir(klasor, hedef, yaz=lambda m: None, ayristirici=meb_metin.ocr_ayristirici(kapali, "gerekirse"))
    assert hedef.read_bytes() == once


M2_METIN = (
    "(111) TARİH - 1\n\n1. Hangisi bir başkenttir?\n\nA) Ankara\nB) Deniz\nC) Hava\nD) Uzay\n\n"
    "2. Hangisi bir gezegendir?\n\nA) Ay\nB) Mars\nC) Güneş\nD) Sirius\n\nCEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. B"
)


def _okunamayan_pdfler(klasor) -> None:
    """Taranmış bir kitapçığın yanında bozuk, boş ve parolalı PDF."""
    _sayfali_pdf(klasor / "a_taranmis.pdf", 1)
    (klasor / "b_bozuk.pdf").write_bytes(b"%PDF-1.4 bozuk")
    (klasor / "c_bos.pdf").write_bytes(b"")
    belge = pymupdf.open()
    belge.new_page()
    belge.save(klasor / "d_parolali.pdf", encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="gizli", owner_pw="sahip")
    belge.close()


@pymupdf_gerekli
def test_M2_ocr_hepsi_acilamayan_pdfi_atlar_digerlerini_okur(sunucu, tmp_path):
    # m8 bu PDF'leri ModulHatasi yapmıştı; m9 modül hatasında bütün klasörü durdurduğu için "--ocr hepsi" tek bir bozuk
    # dosyada hiçbir şey yazmadan duruyordu ("gerekirse" kipi atlıyordu).
    klasor = tmp_path / "pdf"
    klasor.mkdir()
    _okunamayan_pdfler(klasor)
    sunucu.cevapla = lambda govde: M2_METIN
    modul = OcrModulu(YerelSunucu(sunucu.adres), OcrAyarlari(model="deepseek-ocr", dpi=72), None)
    satirlar: list[str] = []
    rapor = meb.pdf_klasoru_ayristir(
        klasor, tmp_path / "meb_pdf.jsonl", yaz=satirlar.append, ayristirici=meb_metin.ocr_ayristirici(modul, "hepsi")
    )
    assert (rapor["yazilan"], rapor["hatali_dosya"], len(sunucu.istekler)) == (2, 3, 1)
    hatalar = {ad: r["hata"] for ad, r in rapor["dosyalar"].items() if "hata" in r}
    assert hatalar["b_bozuk.pdf"].startswith("PdfOkunamadi: PDF açılamadı: ")
    assert hatalar["c_bos.pdf"].startswith("PdfOkunamadi: PDF açılamadı: ")
    assert hatalar["d_parolali.pdf"] == f"PdfOkunamadi: PDF parola korumalı, açılamadı: {klasor / 'd_parolali.pdf'}"
    assert satirlar[-1].startswith("4 PDF (3 okunamadı): 2 soru bulundu, 2 tutuldu")


@pymupdf_gerekli
def test_M2_meb_pdf_ocr_hepsi_komutu_bozuk_pdfte_durmaz(sunucu, tmp_path, monkeypatch, capsys):
    from turkce_model.cli import main

    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")
    klasor = tmp_path / "kitaplar"
    klasor.mkdir()
    _okunamayan_pdfler(klasor)
    sunucu.cevapla = lambda govde: M2_METIN
    secenekler = ["--ayar", f"moduller.adres={sunucu.adres}", "--ayar", "moduller.ocr.model=deepseek-ocr"]
    assert main(["meb-pdf", "--ocr", "hepsi", "--klasor", str(klasor), *secenekler]) == 0
    cikti = capsys.readouterr()
    assert "4 PDF (3 okunamadı): 2 soru bulundu" in cikti.out and "Traceback" not in cikti.err
    assert len(meb.soru_oku(tmp_path / "veri" / "meb" / "meb_pdf.jsonl")) == 2
    # Tek dosyayı okuyan komut aynı hatayı izleme dökümsüz yazar.
    assert main(["ocr", str(klasor / "d_parolali.pdf"), *secenekler]) == 2
    assert capsys.readouterr().err.strip() == f"PDF parola korumalı, açılamadı: {klasor / 'd_parolali.pdf'}"


# ---- kıyas --------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("cevap", "beklenen"),
    [
        ("C", 2), ("c)", 2), ("(B)", 1), ("B.", 1), ("Cevap: D", 3), ("Doğru cevap **A** şıkkıdır.", 0),
        ("Bu soruda önce A elenir.\nDoğru cevap C'dir.", 2), ("B şıkkı doğrudur", 1), ("C) Üçüncü seçenek", 2),
        ("Sonuç olarak D", 3), ("", None), ("Bilmiyorum", None), ("A ya da B olabilir", None), ("E", None),
    ],
)
def test_cevap_cikar(cevap, beklenen):
    assert kiyas.cevap_cikar(cevap, 4) == beklenen


@pytest.mark.parametrize(
    ("cevap", "beklenen"),
    [
        pytest.param("Cevap A değil.", None, id="M9-cevap-degil"),
        pytest.param("C şıkkı yanlış", None, id="M9-sikki-yanlis"),
        pytest.param("Cevap A değildir.", None, id="M9-degildir"),
        pytest.param("Cevap A olamaz", None, id="M9-olamaz"),
        pytest.param("The answer is not A", None, id="M9-not"),
        pytest.param("Cevap A değil, B'dir.", 1, id="M9-baska-harf-onayli"),
        pytest.param("A doğru değil, C doğru", 2, id="M9-dogru-degil"),
        pytest.param("Cevap: B. A değil.", 1, id="M9-once-cevap"),
    ],
)
def test_M9_olumsuzlanan_harf_hicbir_kuralla_cevap_sayilmaz(cevap, beklenen):
    # Olumsuzluk korumaları ifade kurallarını atlatıyordu ama son satırdaki tek harf kuralı olumsuzlanan harfi
    # döndürüyordu ("Cevap A değil." → A).
    assert kiyas.cevap_cikar(cevap, 4) == beklenen


def test_cevap_cikar_bes_sikta_e_gecerlidir():
    assert kiyas.cevap_cikar("E", 5) == 4


def _test_sorulari(n: int) -> list[meb.Soru]:
    return [
        meb.Soru(kimlik=f"t:{i}", kaynak="test", ders="Tarih" if i % 2 else "Coğrafya", soru=f"Soru {i} hangisidir?",
                 secenekler=["bir", "iki", "üç", "dört"], cevap=i % 4, bolum="test")
        for i in range(n)
    ]


def test_kiyas_dogrulugu_cevapsizlari_ve_onbellegi(sunucu, tmp_path):
    sorular = _test_sorulari(12)

    def cevapla(govde):
        metin = govde["messages"][0]["content"]
        assert metin.startswith(kiyas.YONERGE) and metin.endswith("Cevap:")
        no = int(metin.split("Soru: Soru ")[1].split()[0])
        if no % 3 == 0:
            return "<think>emin değilim</think>Bilmiyorum"  # cevapsız
        return f"<think>…</think>Cevap: {'ABCD'[no % 4] if no % 2 else 'ABCD'[(no + 1) % 4]}"  # tekler doğru

    sunucu.cevapla = cevapla
    ayar = MetinAyarlari(model="deepseek-r1:1.5b")
    sonuc = kiyas.kiyasla(YerelSunucu(sunucu.adres), ayar, sorular, tmp_path / "kiyas", lambda m: None)
    assert sonuc["n"] == 12 and sonuc["cevapsiz"] == 4 and sonuc["rastgele"] == 0.25
    assert sonuc["dogruluk_uretim"] == pytest.approx(4 / 12)  # tek numaralı ve 3'e bölünmeyen: 1, 5, 7, 11
    assert sonuc["dersler"]["Tarih"] == {"n": 6, "dogruluk_uretim": pytest.approx(4 / 6)}
    assert len(sunucu.istekler) == 12
    # İkinci çalıştırma sunucuya gitmez; daha büyük bir kümede yalnız yeni sorular sorulur.
    assert kiyas.kiyasla(YerelSunucu(sunucu.adres), ayar, sorular, tmp_path / "kiyas", lambda m: None) == sonuc
    assert len(sunucu.istekler) == 12
    kiyas.kiyasla(YerelSunucu(sunucu.adres), ayar, _test_sorulari(15), tmp_path / "kiyas", lambda m: None)
    assert len(sunucu.istekler) == 15


def test_ornekle_kararli_ve_ic_icedir():
    sorular = _test_sorulari(50)
    on, yirmi = kiyas.ornekle(sorular, 10), kiyas.ornekle(sorular, 20)
    assert [s.kimlik for s in on] == [s.kimlik for s in kiyas.ornekle(list(reversed(sorular)), 10)]
    assert {s.kimlik for s in on} < {s.kimlik for s in yirmi} and len(yirmi) == 20
    assert kiyas.ornekle(sorular, 0) == sorular and len(kiyas.ornekle(sorular, 99)) == 50


@pytest.mark.parametrize(
    ("cevap", "sik", "kabul"),
    [
        pytest.param("Cevap ise C'dir.", 5, {2}, id="M2-ise"),
        pytest.param("Cevap: C\nAçıklama: B şıkkı ise eksik bilgi içerir.", 5, {2}, id="M2-aciklama"),
        pytest.param("Cevap: C. Çünkü ışık A ortamından B ortamına geçerken kırılır.", 4, {2}, id="M2-gerekce"),
        pytest.param("Cevap A değil, B'dir.", 4, {1, None}, id="M2-ret"),  # yanlış harf (A) değil; cevapsız da olur
        pytest.param("C şıkkı doğrudur, A şıkkı ise yanlıştır.", 4, {2}, id="M2-iki-sik"),
        pytest.param("A) İzmir\nB) Ankara\nC) Bursa\nD) Konya", 4, {None}, id="M2-secenek-yinelemesi"),
        pytest.param("The answer is a tricky one; it is C.", 4, {2}, id="M2-ingilizce"),
        pytest.param("Doğru cevap B şıkkıdır. Diğer şıklarda ise hata var.", 5, {1}, id="M2-diger-siklar"),
        pytest.param("Yanıt: D", 4, {3}, id="M2-yanit"),
        pytest.param("Bu ışık A noktasından geçer; cevap D", 4, {3}, id="M2-isik"),
        pytest.param("Şıklardan a seçeneği doğru değil, doğru cevap C", 4, {2}, id="M2-kucuk-harf"),
    ],
)
def test_cevap_cikar_yanlis_harf_vermez(cevap, sik, kabul):  # M2
    assert kiyas.cevap_cikar(cevap, sik) in kabul


def _soru_no(govde: dict) -> int:
    return int(govde["messages"][0]["content"].split("Soru: Soru ")[1].split()[0])


def test_M2_onbellekteki_cevap_yeni_kurallarla_yeniden_okunur(sunucu, tmp_path):
    soru = _test_sorulari(1)[0]  # doğru cevap A
    ayar = MetinAyarlari(model="deepseek-r1:1.5b")
    # Eski kurallarla okunmuş kayıt: "secim" bayat (E sanılmış); asıl kaynak modelin "cevap" metni.
    kayit = {"anahtar": kiyas._soru_anahtari(soru, ayar), "kimlik": soru.kimlik, "secim": 3,
             "cevap": "Doğru cevap A şıkkıdır. Diğer şıklarda ise hata var."}
    (tmp_path / "kiyas").mkdir()
    (tmp_path / "kiyas" / "deepseek-r1_1.5b.jsonl").write_text(json.dumps(kayit, ensure_ascii=False) + "\n", encoding="utf-8")
    sonuc = kiyas.kiyasla(YerelSunucu(sunucu.adres), ayar, [soru], tmp_path / "kiyas", lambda m: None)
    assert sonuc["dogruluk_uretim"] == 1.0 and sunucu.istekler == []


def test_M4_dusunurken_kesilen_cevaplar_sayilir_ve_uyarilir(sunucu, tmp_path, capsys):
    def cevapla(govde):
        if _soru_no(govde) % 2:  # tek numaralılar düşünürken token sınırına takılır
            return "<think>Önce şıkları tek tek ele alalım. Birinci şık", "length"
        return f"<think>kısa</think>Cevap: {'ABCD'[_soru_no(govde) % 4]}"

    sunucu.cevapla = cevapla
    ayarlar = _ayarlar(tmp_path, sunucu.adres, ocr="")
    meb.soru_yaz(_test_sorulari(10), ayarlar.cikti_klasoru / "veri" / "meb_sorular.jsonl")
    komutlar.komut_modul_kiyas(SimpleNamespace(adet=100), ayarlar)
    cikti = capsys.readouterr().out
    assert "MEB test: 10 soru | doğruluk (üretimle) %50.0 | cevapsız 5" in cikti
    assert (
        "  Uyarı: 5 cevap en_fazla_token (1024) sınırında kesildi (model çoğu kez düşünürken); bunlar cevapsız sayıldı. "
        "[moduller.metin] en_fazla_token değerini büyüt (ör. 4096)." in cikti
    )
    kayit = json.loads((ayarlar.cikti_klasoru / "ilerleme.jsonl").read_text(encoding="utf-8").splitlines()[-1])
    assert kayit["meb_test"]["kesik"] == 5 and kayit["meb_test"]["cevapsiz"] == 5


M5_DUSUNCE = "Tamam, bu soruyu düşünelim. Önce A şıkkına bakalım: cevap A olabilir mi? Belki. Ama B şıkkı da"


def test_M5_sablonun_actigi_dusunmede_kesilen_cevap_cevapsiz_sayilir(sunucu, tmp_path):
    # Şablon düşünmeyi açınca içerikte "<think>" yok; düşünürken kesilen cevap etiketsiz düşüncedir ve "cevap A"
    # cevap sanılıyordu (cevapsız 0, kesik 0, uyarı yok).
    cevaplar = {
        0: (M5_DUSUNCE, "length"),  # şablon açtı, düşünürken kesildi
        1: ("<think>\n" + M5_DUSUNCE, "length"),  # etiket içerikte (M4): değişmez
        2: ("B", "stop"),  # kısa, düzgün cevap: değişmez
        3: (M5_DUSUNCE + "</think>\n\nCevap: D. Çünkü", "length"),  # düşünme bitti, açıklamada kesildi: cevap D
    }
    sunucu.cevapla = lambda govde: cevaplar[_soru_no(govde)]
    sorular = [meb.Soru(kimlik=f"t:{i}", kaynak="test", ders="Tarih", soru=f"Soru {i} hangisidir?",
                        secenekler=["bir", "iki", "üç", "dört"], cevap=c, bolum="test") for i, c in enumerate([0, 0, 1, 3])]
    ayar = MetinAyarlari(model="deepseek-r1:1.5b")
    sonuc = kiyas.kiyasla(YerelSunucu(sunucu.adres), ayar, sorular, tmp_path / "kiyas", lambda m: None)
    assert (sonuc["cevapsiz"], sonuc["kesik"], sonuc["dogruluk_uretim"]) == (2, 2, 0.5)
    kayitlar = [json.loads(s) for s in (tmp_path / "kiyas" / "deepseek-r1_1.5b.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [(k["secim"], k["kesik"], k["dusunme_kapandi"]) for k in kayitlar] == [
        (None, True, False), (None, True, False), (1, False, False), (3, True, True)
    ]
    # Önbellekten okunurken de aynı kural; bu alanı taşımayan eski kayıt eskisi gibi okunur.
    assert kiyas.kiyasla(YerelSunucu(sunucu.adres), ayar, sorular, tmp_path / "kiyas", lambda m: None) == sonuc
    assert len(sunucu.istekler) == 4
    eski = {"anahtar": kiyas._soru_anahtari(sorular[0], ayar), "cevap": "Cevap: A", "kesik": True}
    (tmp_path / "eski").mkdir()
    (tmp_path / "eski" / "deepseek-r1_1.5b.jsonl").write_text(json.dumps(eski) + "\n", encoding="utf-8")
    assert kiyas.kiyasla(YerelSunucu(sunucu.adres), ayar, sorular[:1], tmp_path / "eski", lambda m: None)["dogruluk_uretim"] == 1.0


def test_M5_modul_dene_metin_dusunurken_kesilen_cevabi_calisiyor_saymaz(sunucu, tmp_path, capsys):
    ayarlar = _ayarlar(tmp_path, sunucu.adres, ocr="")
    sunucu.cevapla = lambda govde: (M5_DUSUNCE, "length")
    assert komutlar.komut_modul_dene(SimpleNamespace(rol="metin", gorsel=None), ayarlar) == 1
    assert "Sonuç: cevaptan şık harfi çıkarılamadı." in capsys.readouterr().out
    sunucu.cevapla = lambda govde: (M5_DUSUNCE + "</think>B", "length")  # düşünme kapandı: cevap B
    assert komutlar.komut_modul_dene(SimpleNamespace(rol="metin", gorsel=None), ayarlar) == 0


def test_m5_yarim_kalan_son_satirdan_sonraki_kayitlar_ayri_satirda(sunucu, tmp_path):
    sunucu.cevapla = lambda govde: f"Cevap: {'ABCD'[_soru_no(govde) % 4]}"
    ayar = MetinAyarlari(model="deepseek-r1:1.5b")

    def kiyasla(n: int) -> dict:
        return kiyas.kiyasla(YerelSunucu(sunucu.adres), ayar, _test_sorulari(n), tmp_path / "kiyas", lambda m: None)

    kiyasla(4)
    dosya = tmp_path / "kiyas" / "deepseek-r1_1.5b.jsonl"
    satirlar = dosya.read_text(encoding="utf-8").splitlines()
    dosya.write_text("\n".join(satirlar[:3]) + "\n" + satirlar[3][:30], encoding="utf-8")  # 4. kayıt yazılırken kesildi
    kiyasla(6)
    assert len(sunucu.istekler) == 4 + 3  # yarım kalan soru ve iki yeni soru
    assert kiyasla(6)["dogruluk_uretim"] == 1.0 and len(sunucu.istekler) == 7  # yeni kayıt yarım satıra yapışmadı


def test_m6_dosya_adi_cakisan_modellerin_cevaplari_karismaz(sunucu, tmp_path):
    modeller = ["hf.co/kullanici/depo:Q4_K_M", "hf.co/kullanici/depo_Q4_K_M"]
    assert kiyas._dosya_adi(modeller[0]) == kiyas._dosya_adi(modeller[1])  # ikisi aynı önbellek dosyasına yazar
    sunucu.modeller = modeller
    sunucu.cevapla = lambda govde: f"Cevap: {'ABCD'[_soru_no(govde) % 4]}" if govde["model"] == modeller[0] else "Cevap: A"
    dogruluk = [
        kiyas.kiyasla(YerelSunucu(sunucu.adres), MetinAyarlari(model=m), _test_sorulari(8), tmp_path / "kiyas", lambda _: None)[
            "dogruluk_uretim"
        ]
        for m in modeller
    ]
    assert dogruluk == [1.0, 0.25] and len(sunucu.istekler) == 16  # ikinci model öbürünün cevaplarını almadı


# ---- katalog, ayarlar, komutlar ------------------------------------------------------------------


def test_katalog_tutarli():
    adlar = [m.ad for m in katalog.KATALOG]
    assert len(adlar) == len(set(adlar))
    assert all(m.rol in katalog.ROLLER and m.durum in ("modul", "katalog") and m.aciklama for m in katalog.KATALOG)
    assert {m.ad for m in katalog.rolun_modelleri("ocr")} == {"DeepSeek-OCR", "DeepSeek-OCR-2"}
    assert all(m.durum == "katalog" for m in katalog.KATALOG if m.rol == "hizlandirma")  # başka modellere bağlı
    assert katalog.modul_bul("deepseek-ocr:3b").ad == "DeepSeek-OCR"
    assert katalog.modul_bul("deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B").ollama == "deepseek-r1:1.5b"
    assert katalog.modul_bul("deepseek-r1") is None and katalog.modul_bul("") is None  # belirsiz ad eşleşmez


def test_modul_ayarlari_uygulanir_ve_dogrulanir():
    mod = moduller_uygula(ModulAyarlari(), {"zaman_asimi": 60, "ocr": {"model": "deepseek-ocr", "dpi": 200}})
    assert (mod.zaman_asimi, mod.ocr.model, mod.ocr.dpi, mod.metin.model) == (60, "deepseek-ocr", 200, "")
    assert ModulAyarlari().ocr.model == "" and ModulAyarlari().metin.model == ""  # varsayılan: kapalı
    for bozuk, ipucu in (
        ({"adres": "localhost:11434"}, "http://"),
        ({"ocr": {"dpi": 5}}, "dpi"),
        ({"ocr": {"modell": "x"}}, "Bilinmeyen ayar: moduller.ocr.modell"),
        ({"metin": {"en_fazla_token": 0}}, "en_fazla_token"),
        ({"ocr": "deepseek-ocr"}, "bölümdür"),
        ({"uzak_sunucu": "evet"}, "true ya da false"),
    ):
        with pytest.raises(AyarHatasi, match=ipucu):
            moduller_uygula(ModulAyarlari(), bozuk)


def test_modul_liste_katalogu_ve_sunucuyu_gosterir(sunucu, tmp_path, capsys):
    komutlar.komut_modul_liste(SimpleNamespace(), _ayarlar(tmp_path, sunucu.adres, metin="olmayan-model"))
    cikti = capsys.readouterr().out
    assert "[modül]   DeepSeek-OCR " in cikti and "[katalog] dspark_qwen3_4b_block7" in cikti
    assert "Sunucu: çalışıyor, 2 model" in cikti and "'olmayan-model' sunucuda görünmüyor" in cikti
    assert "ocr: deepseek-ocr (katalogda: DeepSeek-OCR)" in cikti


def test_modul_kapaliysa_nasil_acilacagini_soyler(tmp_path):
    kapali = _ayarlar(tmp_path, "http://localhost:11434/v1", ocr="", metin="")
    with pytest.raises(ModulHatasi, match=r"\[moduller.ocr\] model"):
        komutlar.resimden_soru("soru.png", kapali)
    with pytest.raises(ModulHatasi, match="Açık modül yok"):
        komutlar.komut_modul_dene(SimpleNamespace(rol=None, gorsel=None), kapali)
    with pytest.raises(ModulHatasi, match=r"\[moduller.metin\] model"):
        komutlar.komut_modul_kiyas(SimpleNamespace(adet=5), kapali)


def test_resimden_soru_ocr_metnini_soruya_cevirir(sunucu, tmp_path):
    (tmp_path / "soru.png").write_bytes(b"\x89PNG-sahte-foto")
    sunucu.cevapla = lambda govde: "12. Hangisi bir **gezegendir**?\n\nA) Ay\nB) Güneş\nC) Mars\nD) Sirius"
    soru = komutlar.resimden_soru(str(tmp_path / "soru.png"), _ayarlar(tmp_path, sunucu.adres))
    assert soru.soru == "Hangisi bir gezegendir?" and soru.secenekler == ["Ay", "Güneş", "Mars", "Sirius"]
    assert _gorsel_ve_istem(sunucu.istekler[-1])[1] == "Free OCR."  # fotoğrafta düz metin istemi
    sunucu.cevapla = lambda govde: "yalnızca bir paragraf"
    (tmp_path / "bos.png").write_bytes(b"\x89PNG-baska")
    with pytest.raises(ModulHatasi, match="soru çıkarılamadı"):
        komutlar.resimden_soru(str(tmp_path / "bos.png"), _ayarlar(tmp_path, sunucu.adres))


@pymupdf_gerekli
def test_modul_dene_turkce_harf_dogrulugunu_olcer(sunucu, tmp_path, capsys):
    if deneme_gorseli() is None:
        pytest.skip("Türkçe harfli yazı tipi yok")
    ayarlar = _ayarlar(tmp_path, sunucu.adres)
    sunucu.cevapla = lambda govde: "\n".join(DENEME_METNI)
    assert komutlar.komut_modul_dene(SimpleNamespace(rol="ocr", gorsel=None), ayarlar) == 0
    assert "Türkçe harfleri doğru okuyor" in capsys.readouterr().out
    sunucu.cevapla = lambda govde: "\n".join(DENEME_METNI).replace("ş", "s").replace("ğ", "g").replace("ı", "i")
    assert komutlar.komut_modul_dene(SimpleNamespace(rol="ocr", gorsel=None), ayarlar) == 1
    assert "okuma zayıf" in capsys.readouterr().out
    olcu = benzerlik("çağ ışık", "cag isik")
    assert olcu["turkce_harf"] == 0.0 and olcu["turkce_harf_sayisi"] == 5  # ç, ğ, ı, ş, ı
    sunucu.cevapla = lambda govde: "<think>başkent</think>B"
    assert komutlar.komut_modul_dene(SimpleNamespace(rol="metin", gorsel=None), ayarlar) == 0


def test_M8_ocr_ayni_adli_dosyalari_ayri_yazar(sunucu, tmp_path):
    sunucu.cevapla = lambda govde: f"metin {len(sunucu.istekler)}"
    for alt in ("2024", "2025"):
        (tmp_path / alt).mkdir()
        (tmp_path / alt / "IMG_0001.jpg").write_bytes(b"\xff\xd8sahte-" + alt.encode())
    (tmp_path / "soru.png").write_bytes(b"\x89PNG-1")
    (tmp_path / "soru.jpg").write_bytes(b"\xff\xd8-2")
    dosyalar = [tmp_path / "2024" / "IMG_0001.jpg", tmp_path / "2025" / "IMG_0001.jpg", tmp_path / "soru.png", tmp_path / "soru.jpg"]
    ayarlar = _ayarlar(tmp_path, sunucu.adres)
    komutlar.komut_ocr(SimpleNamespace(dosya=[str(d) for d in dosyalar], cikti=None, duz=False), ayarlar)
    cikti = ayarlar.veri_klasoru / "ocr"
    assert sorted(p.name for p in cikti.iterdir()) == ["IMG_0001-2.txt", "IMG_0001.txt", "soru-2.txt", "soru.txt"]
    assert sorted(p.read_text(encoding="utf-8").strip() for p in cikti.iterdir()) == [f"metin {i}" for i in (1, 2, 3, 4)]


def test_B1_ocr_komutu_kesik_goruntu_ciktisini_soyler(sunucu, tmp_path, capsys):
    # R3: PDF'te sayfa satırı kesildiğini söylüyordu; tek görüntüde yalnız dosyanın sonundaki [KESİK] kalıyordu.
    (tmp_path / "sayfa.png").write_bytes(b"\x89PNG-uzun-sayfa")
    sunucu.cevapla = lambda govde: ("Uzun bir sayfanın metni burada yarıda kal", "length")
    ayarlar = _ayarlar(tmp_path, sunucu.adres)
    komutlar.komut_ocr(SimpleNamespace(dosya=[str(tmp_path / "sayfa.png")], cikti=None, duz=False), ayarlar)
    cikti = capsys.readouterr().out
    assert (
        "  Uyarı: çıktı en_fazla_token (4096) sınırında kesildi; metnin sonu eksik olabilir. "
        "[moduller.ocr] en_fazla_token değerini büyüt." in cikti
    )
    assert (ayarlar.veri_klasoru / "ocr" / "sayfa.txt").read_text(encoding="utf-8").rstrip().endswith(KESIK_ISARETI)


def test_m7_sunucudaki_model_etiketi_tam_eslesmeli(sunucu, tmp_path, capsys):
    sunucu.modeller = ["deepseek-ocr:latest", "deepseek-r1:8b"]  # 1.5b değil, başka bir boyut kurulu
    komutlar.komut_modul_liste(SimpleNamespace(), _ayarlar(tmp_path, sunucu.adres))
    cikti = capsys.readouterr().out
    assert "  ! metin modeli 'deepseek-r1:1.5b' sunucuda görünmüyor (Ollama: `ollama pull deepseek-r1:1.5b`)." in cikti
    assert "ocr modeli" not in cikti  # "deepseek-ocr" ile "deepseek-ocr:latest" aynı model
    assert komutlar._model_var("deepseek-ocr:latest", ["deepseek-ocr"]) and not komutlar._model_var("deepseek-r1", ["deepseek-r1:8b"])


def test_m11_B1_fotograftaki_iki_soru_ya_da_kesik_cikti_soruya_cevrilmez(sunucu, tmp_path):
    ayarlar = _ayarlar(tmp_path, sunucu.adres)
    (tmp_path / "iki.png").write_bytes(b"\x89PNG-iki-soru")
    sunucu.cevapla = lambda govde: (
        "1. Türkiye'nin başkenti hangisidir?\n\nA) İzmir\nB) Ankara\nC) Bursa\nD) Konya\n\n"
        "2. Hangisi bir gezegendir?\n\nA) Ay\nB) Güneş\nC) Mars\nD) Sirius"
    )
    with pytest.raises(ModulHatasi, match="Görüntüde birden çok soru var; fotoğrafı tek soruyu içerecek biçimde kırp."):
        komutlar.resimden_soru(str(tmp_path / "iki.png"), ayarlar)
    (tmp_path / "kesik.png").write_bytes(b"\x89PNG-kesik")
    sunucu.cevapla = lambda govde: ("1. Türkiye'nin başkenti hangisidir?\n\nA) İzmir\nB) Ankara\nC) Bur", "length")
    with pytest.raises(ModulHatasi, match=r"OCR çıktısı \[moduller\.ocr\] en_fazla_token sınırında kesildi"):
        komutlar.resimden_soru(str(tmp_path / "kesik.png"), ayarlar)


def test_M10_sor_resim_parantezli_numarali_fotografi_okur(sunucu, tmp_path):
    # m11'in denetimi yalnız "A)" satırlarını sayar: sonraki sorunun yalnız numarası görünüyorsa tek_soru'ya kalır.
    ayarlar = _ayarlar(tmp_path, sunucu.adres)
    (tmp_path / "soru.png").write_bytes(b"\x89PNG-parantezli")
    sunucu.cevapla = lambda govde: (
        "AÇIK ÖĞRETİM LİSESİ\n12\n7) Hangisi bir gezegendir?\n\nA) Ay\nB) Güneş\nC) Mars\nD) Sirius\n\n8) Sonraki soru"
    )
    soru = komutlar.resimden_soru(str(tmp_path / "soru.png"), ayarlar)
    assert (soru.soru, soru.secenekler) == ("Hangisi bir gezegendir?", ["Ay", "Güneş", "Mars", "Sirius"])


def test_M3_G4_modul_kiyas_satiri_tabloda_dogrulukla_gorunur(sunucu, tmp_path, monkeypatch, capsys):
    from turkce_model.cli import main

    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")
    meb.soru_yaz(_test_sorulari(10), tmp_path / "ciktilar" / "veri" / "meb_sorular.jsonl")
    sunucu.cevapla = lambda govde: "Cevap: A"  # doğru cevabı A olan sorular (0, 4, 8): %30
    secenekler = ["--ayar", f"moduller.adres={sunucu.adres}", "--ayar", "moduller.metin.model=deepseek-r1:1.5b"]
    assert main(["modul-kiyas", "--adet", "10", *secenekler]) == 0
    assert "MEB test: 10 soru | doğruluk (üretimle) %30.0 | cevapsız 0 | rastgele tahmin %25.0" in capsys.readouterr().out
    md = (tmp_path / "ciktilar" / "ilerleme.md").read_text(encoding="utf-8")
    satir = next(s for s in md.splitlines() if "| modül: deepseek-r1:1.5b | kıyas |" in s)
    # Y3: satır "— / —" ve "eski ölçüm: yeniden değerlendir" gösteriyordu.
    assert "| %30.0 üretimle (taban %25.0, n=10) |" in satir and "— / —" not in satir and "eski ölçüm" not in satir


def test_M11_modul_kiyas_negatif_adedi_reddeder(tmp_path, monkeypatch, capsys):
    from turkce_model.cli import main

    monkeypatch.chdir(tmp_path)
    with pytest.raises(SystemExit) as cikis:  # eskiden sessizce "hepsi" demekti
        main(["modul-kiyas", "--adet", "-5"])
    assert cikis.value.code == 2
    assert "argument --adet: 0 ya da daha büyük olmalı (şu an: -5)" in capsys.readouterr().err


# ---- M12: modül komutlarının yazdığı komutlar ve ayar dosyası çağıranın seçeneklerini taşır -----------------

M12_DOSYA = "ek ayar.toml"


def _m12_calistir(tmp_path, monkeypatch, capsys, argv: list[str], ayarlar: str) -> str:
    """``tmp_path``'te ayrı bir ayar dosyasıyla (``--ayarlar 'ek ayar.toml'``) komutu çalıştırır; hata çıktısı."""
    from turkce_model.cli import main

    monkeypatch.chdir(tmp_path)
    (tmp_path / M12_DOSYA).write_text(ayarlar, encoding="utf-8")
    assert main([*argv, "--ayarlar", M12_DOSYA]) == 2
    return capsys.readouterr().err.strip()


def test_M12_model_yok_iletisindeki_komut_ayar_dosyasini_tasir(sunucu, tmp_path, monkeypatch, capsys):
    from turkce_model import cli

    ayarlar = f'[moduller]\nadres = "{sunucu.adres}"\n[moduller.metin]\nmodel = "yok-model"\n'
    hata = _m12_calistir(tmp_path, monkeypatch, capsys, ["modul-dene", "metin"], ayarlar)
    assert hata.endswith(f"Sunucudaki modelleri görmek için: python -m turkce_model modul-liste --ayarlar {cli._tirnak(M12_DOSYA)}")
    # --ayar ile verilen ayarlar da komuta eklenir.
    secenekler = ["--ayar", f"moduller.adres={sunucu.adres}", "--ayar", "moduller.metin.model=yok-model"]
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")
    assert cli.main(["modul-dene", "metin", *secenekler]) == 2
    ek = "".join(f" --ayar {cli._tirnak(a)}" for a in secenekler[1::2])
    assert capsys.readouterr().err.strip().endswith(f"python -m turkce_model modul-liste{ek}")


@pytest.mark.parametrize(
    ("argv", "ipucu"),
    [
        pytest.param(["modul-dene"], f"{M12_DOSYA}'da [moduller.ocr] model = \"deepseek-ocr\" yaz", id="M12-acik-modul-yok"),
        pytest.param(["ocr", "sayfa.png"], f"{M12_DOSYA}'da [moduller.ocr] model = \"deepseek-ocr\" yaz", id="M12-ocr-kapali"),
        pytest.param(["modul-kiyas"], f"{M12_DOSYA}'da [moduller.metin] model = \"deepseek-r1:1.5b\" yaz", id="M12-kiyas-kapali"),
    ],
)
def test_M12_acma_ipucu_kullanilan_ayar_dosyasini_anar(tmp_path, monkeypatch, capsys, argv, ipucu):
    hata = _m12_calistir(tmp_path, monkeypatch, capsys, argv, "")
    assert ipucu in hata and "ayarlar.toml" not in hata


def test_M12_sunucu_iletisi_kullanilan_ayar_dosyasini_anar(tmp_path, monkeypatch, capsys):
    from turkce_model.cli import main

    monkeypatch.chdir(tmp_path)
    (tmp_path / M12_DOSYA).write_text(f'[moduller]\nadres = "{_kapali_adres()}"\n', encoding="utf-8")
    assert main(["modul-liste", "--ayarlar", M12_DOSYA]) == 0
    sunucu_satiri = next(s for s in capsys.readouterr().out.splitlines() if s.startswith("Sunucu:"))
    assert f"kullanıyorsan {M12_DOSYA}'da [moduller] adres değerini düzelt." in sunucu_satiri


def test_M12_ocr_sinamasi_ipucundaki_komut_ayar_dosyasini_tasir(sunucu, tmp_path, monkeypatch, capsys):
    from turkce_model import cli
    from turkce_model.moduller import ocr

    monkeypatch.setattr(ocr, "deneme_gorseli", lambda dpi=150: None)  # Türkçe harfli yazı tipi yok
    ayarlar = f'[moduller]\nadres = "{sunucu.adres}"\n[moduller.ocr]\nmodel = "deepseek-ocr"\n'
    hata = _m12_calistir(tmp_path, monkeypatch, capsys, ["modul-dene", "ocr"], ayarlar)
    assert hata.endswith(f"python -m turkce_model modul-dene ocr --gorsel sayfa.png --ayarlar {cli._tirnak(M12_DOSYA)}")


def test_M12_meb_pdf_ve_sor_baglantilari_komut_seceneklerini_alir(sunucu, tmp_path):
    # cli bu iki bağlantıya komutun seçeneklerini (arg) verirse iletiler aynı ayar dosyasını anar.
    arg = SimpleNamespace(ayarlar=M12_DOSYA, ayar=[], deney=None)
    kapali = _ayarlar(tmp_path, sunucu.adres, ocr="")
    for cagri in (lambda: komutlar.resimden_soru("soru.png", kapali, arg), lambda: komutlar.meb_ayristirici(kapali, "hepsi", arg)):
        with pytest.raises(ModulHatasi, match=f"{M12_DOSYA}'da \\[moduller.ocr\\] model"):
            cagri()
    ayarlar = _ayarlar(tmp_path, sunucu.adres, ocr="yok-model")
    (tmp_path / "soru.png").write_bytes(b"\x89PNG-m12")
    from turkce_model.cli import _tirnak

    with pytest.raises(ModulHatasi, match=re.escape(f"modul-liste --ayarlar {_tirnak(M12_DOSYA)}") + "$"):
        komutlar.resimden_soru(str(tmp_path / "soru.png"), ayarlar, arg)
