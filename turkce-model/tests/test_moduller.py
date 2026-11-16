"""DeepSeek modülleri: yerel sunucu istemcisi, OCR, OCR metninden MEB sorusu, kıyas, katalog.

Gerçek bir model çalıştırılmaz: testler bu süreçte açılan sahte bir OpenAI uyumlu sunucuyla konuşur.
Tüm metinler sentetiktir.
"""

from __future__ import annotations

import base64
import http.server
import json
import socket
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
    OcrModulu,
    benzerlik,
    deneme_gorseli,
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

    def _yaz(self, kod: int, veri: dict) -> None:
        govde = json.dumps(veri).encode("utf-8")
        self.send_response(kod)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(govde)))
        self.end_headers()
        self.wfile.write(govde)

    def do_GET(self):
        if self.path == "/v1/models":
            self._yaz(200, {"object": "list", "data": [{"id": m} for m in self.server.modeller]})
        else:
            self._yaz(404, {"error": {"message": "not found"}})

    def do_POST(self):
        govde = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.istekler.append(govde)
        if govde.get("model") not in self.server.modeller:
            self._yaz(404, {"error": {"message": f"model '{govde.get('model')}' not found"}})
            return
        self._yaz(200, {"choices": [{"message": {"role": "assistant", "content": self.server.cevapla(govde)}}]})


@pytest.fixture
def sunucu():
    """127.0.0.1'de sahte sunucu: ``.adres``, ``.istekler``, ``.modeller``, ``.cevapla`` (istek → metin)."""
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Istekci)
    s.modeller = ["deepseek-ocr", "deepseek-r1:1.5b"]
    s.istekler = []
    s.cevapla = lambda govde: "tamam"
    s.adres = f"http://127.0.0.1:{s.server_address[1]}/v1"
    is_parcacigi = threading.Thread(target=s.serve_forever, daemon=True)
    is_parcacigi.start()
    yield s
    s.shutdown()
    s.server_close()


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
