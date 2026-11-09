from datetime import date
from pathlib import Path

import pytest

pytest.importorskip("bs4")

from moda_radar.veri import perakende
from moda_radar.veri.depo import Depo

FIXTURE = Path(__file__).parent / "fixtures" / "perakende_ornek.html"
SECICI = {
    "kart": "li.urun-karti",
    "baslik": ".urun-adi",
    "fiyat": ".fiyat",
    "eski_fiyat": ".eski",
    "link": "a.urun-link",
    "gorsel": "img.urun-gorsel",
    "gorsel_nitelik": ["data-src", "src"],
}


@pytest.mark.parametrize(
    "metin,beklenen",
    [
        ("1.299,90 TL", 1299.90),
        ("7.999,00 TL", 7999.0),
        ("1299.99", 1299.99),
        (" 1299.99 TL ", 1299.99),
        ("1.299,90\u00a0TL", 1299.90),
        ("₺ 12.999,90", 12999.90),
        ("1 299,90 TL", 1299.90),
        ("%30 1.299,90 TL", 1299.90),
        ("30% indirim 899,90 TL", 899.90),
        ("1.299", 1299.0),
        ("₺1.499", 1499.0),
        ("899 TL", 899.0),
        ("1,299.95", 1299.95),
        ("49,9", 49.9),
        ("", None),
        ("fiyat yok", None),
    ],
)
def test_fiyat_coz(metin, beklenen):
    assert perakende.fiyat_coz(metin) == beklenen


def test_urunleri_ayikla():
    urunler = perakende.urunleri_ayikla(FIXTURE.read_text("utf-8"), SECICI, "https://www.ornek.invalid/kadin-bluz")
    assert len(urunler) == 2  # linksiz kart ve yineleme atlandı
    a, b = urunler
    assert a["url"] == "https://www.ornek.invalid/kadin/keten-gomlek-p-101?renk=lacivert"
    assert a["baslik"] == "Keten Oversize Gömlek"
    assert (a["fiyat"], a["eski_fiyat"], a["indirim_yuzde"]) == (899.90, 1299.90, 30.8)
    assert a["gorsel_url"] == "https://cdn.ornek.invalid/img/101.jpg"  # data: atlandı, data-src seçildi
    assert (b["fiyat"], b["indirim_yuzde"], b["gorsel_url"]) == (1499.0, None, "https://cdn.ornek.invalid/img/102.jpg")


def test_kaynak_dosyasi_gecerli_ve_dogrulananlarin_tarihi_var():
    veri = perakende.kaynaklari_oku()
    hs = perakende.hedefler(veri)
    segment = {h.marka: h.segment for h in hs}
    assert segment == {"Beymen": "luks", "Ipekyol": "premium", "Koton": "orta", "DeFacto": "orta", "Addax": "deger"}
    for h in hs:
        assert h.kategori in {"kadin-ust", "kadin-elbise"}
        if h.dogrulandi:
            date.fromisoformat(h.dogrulama_tarihi)
    assert {h.marka for h in hs if h.dogrulandi} == {"Beymen", "Ipekyol", "Koton", "DeFacto"}


def test_bot_engelli_hedefler_kapali_ve_alanlari_yasak():
    from moda_radar.veri.ag import yasak_alanlar

    veri = perakende.kaynaklari_oku()
    kapali = [h for h in perakende.hedefler(veri, kapalilar=True) if h not in perakende.hedefler(veri)]
    assert {h.marka for h in kapali} == {"Zara", "LC Waikiki", "Trendyol"}
    yasak = yasak_alanlar()
    assert {"www.zara.com", "www.massimodutti.com", "www.trendyol.com", "www.lcw.com"} <= yasak
    for seg in veri["segmentler"].values():
        for k in seg.values():
            if k.get("etkin", True) is False:
                assert k["neden"] and not k["dogrulandi"]
    acik = {h.url.split("/")[2] for h in perakende.hedefler(veri)}
    assert not acik & yasak


def test_kaynak_dogrulama_eksik_secici():
    hatalar = perakende.kaynaklari_dogrula(
        {"segmentler": {"orta": {"X": {"kategoriler": {"kadin-ust": "http://x"}, "secici": {"kart": "a"}}}}}
    )
    assert any("eksik seçiciler" in h for h in hatalar)
    assert any("dogrulandi" in h for h in hatalar)
    assert any("https://" in h for h in hatalar)


def test_kaynak_dogrulama_tarih_ve_neden():
    secici = {"kart": "a", "baslik": "a", "fiyat": "a", "link": "a"}
    k = {"kategoriler": {"kadin-ust": "https://x.invalid"}, "secici": secici}
    hatalar = perakende.kaynaklari_dogrula(
        {"segmentler": {"orta": {"A": dict(k, dogrulandi=True), "B": dict(k, dogrulandi=False, etkin=False)}}}
    )
    assert any("orta/A" in h and "dogrulama_tarihi" in h for h in hatalar)
    assert any("orta/B" in h and "neden" in h for h in hatalar)
    tamam = {
        "A": dict(k, dogrulandi=True, dogrulama_tarihi="2026-11-09"),
        "B": dict(k, dogrulandi=False, etkin=False, neden="403"),
    }
    assert perakende.kaynaklari_dogrula({"segmentler": {"orta": tamam}}) == []
    assert [h.marka for h in perakende.hedefler({"segmentler": {"orta": tamam}})] == ["A"]


class SahteTarayici:
    def __init__(self, html):
        self.html = html
        self.istek_sayisi = 0

    def metin(self, url):
        return self.html


def test_kaynak_tara_upsert_ve_pasif(tmp_path, monkeypatch):
    from moda_radar.veri import renk_koprusu

    monkeypatch.setattr(renk_koprusu, "renk_modulu_var", lambda: False)
    h = perakende.PerakendeHedefi(
        segment="orta", marka="Ornek", kategori="kadin-ust", url="https://www.ornek.invalid/kadin-bluz", secici=SECICI
    )
    with Depo(tmp_path / "m.db") as depo:
        depo.upsert_perakende_urun(
            segment="orta", marka="Ornek", kategori="kadin-ust", url="https://eski/urun", tarih=date(2027, 1, 1)
        )
        s = perakende.kaynak_tara(depo, h, SahteTarayici(FIXTURE.read_text("utf-8")), bugun=date(2027, 3, 1))
        assert (s["bulunan"], s["pasif"]) == (2, 1)
        perakende.kaynak_tara(depo, h, SahteTarayici(FIXTURE.read_text("utf-8")), bugun=date(2027, 3, 8))
        r = depo.baglanti.execute(
            "SELECT ilk_gorulme, son_gorulme FROM perakende_urun WHERE url LIKE '%p-101%'"
        ).fetchone()
        assert tuple(r) == ("2027-03-01", "2027-03-08")


def test_gorsel_alinamazsa_sayilir_tek_uyari(tmp_path, monkeypatch, caplog):
    from moda_radar.veri import renk_koprusu
    from moda_radar.veri.ag import TaramaYasak

    monkeypatch.setattr(renk_koprusu, "renk_modulu_var", lambda: True)

    class GorselsizTarayici(SahteTarayici):
        def getir(self, url, kabul=""):
            raise TaramaYasak(f"robots.txt alınamadı (Tunnel connection failed); kibar taraf taramaz: {url}")

    h = perakende.PerakendeHedefi(
        segment="orta", marka="Ornek", kategori="kadin-ust", url="https://www.ornek.invalid/k", secici=SECICI
    )
    with Depo(tmp_path / "m.db") as depo:
        s = perakende.kaynak_tara(depo, h, GorselsizTarayici(FIXTURE.read_text("utf-8")), bugun=date(2027, 3, 1))
    assert (s["bulunan"], s["renkli"], s["gorsel_alinamadi"]) == (2, 0, 2)
    assert caplog.text.count("ürün görseli alınamadı") == 1


def test_bos_sayfa_uyari(tmp_path):
    h = perakende.PerakendeHedefi(segment="orta", marka="X", kategori="kadin-ust", url="https://x", secici=SECICI)
    with Depo(tmp_path / "m.db") as depo:
        s = perakende.kaynak_tara(depo, h, SahteTarayici("<html></html>"), bugun=date(2027, 3, 1))
    assert s["bulunan"] == 0 and "dogrulandi: false" in s["uyari"]


def test_sezon_tahmini():
    assert perakende.sezon_tahmini(date(2027, 3, 1)) == "SS27"
    assert perakende.sezon_tahmini(date(2026, 10, 1)) == "FW26"
    assert perakende.sezon_tahmini(date(2027, 1, 10)) == "FW26"


# --- Playwright yolu (sahte nesnelerle; gerçek tarayıcı açılmaz) ---


class SahteZamanAsimi(Exception):
    pass


class SahteSayfa:
    def __init__(self, kayit, hata=None):
        self.kayit, self.hata = kayit, hata
        self.mouse = self

    def goto(self, url, wait_until, timeout):
        self.kayit["goto"].append((url, wait_until))
        if self.hata:
            raise self.hata

    def wait_for_selector(self, secici, timeout, state="attached"):
        self.kayit["bekle"].append((secici, timeout))
        raise SahteZamanAsimi()  # ne çerez katmanı ne kart: uyarı yolu

    def wheel(self, x, y):
        self.kayit["kaydir"] += 1

    def wait_for_timeout(self, ms):
        pass

    def content(self):
        return "<html>tamam</html>"


class SahteTarayiciPw:
    def __init__(self, kayit, hata):
        self.kayit, self.hata = kayit, hata

    def new_context(self, **ayar):
        self.kayit["baglam"].append(ayar)
        return self

    def new_page(self):
        return SahteSayfa(self.kayit, self.hata)

    def close(self):
        self.kayit["kapat"] += 1


class SahtePlaywright:
    def __init__(self, hatalar):
        self.hatalar = list(hatalar)  # deneme başına goto hatası (None = başarılı)
        self.kayit = {"launch": [], "goto": [], "bekle": [], "baglam": [], "kaydir": 0, "kapat": 0}
        self.chromium = self

    def launch(self, args=()):
        self.kayit["launch"].append(list(args))
        return SahteTarayiciPw(self.kayit, self.hatalar.pop(0))

    def __call__(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class SahteKibarTarayici:
    istek_sayisi = 0

    def izinli_mi(self, url):
        return True

    def _bekle(self):
        pass


def _js_hedef():
    return perakende.PerakendeHedefi(
        segment="orta",
        marka="LC Waikiki",
        kategori="kadin-ust",
        url="https://www.lcw.invalid/x",
        secici=SECICI,
        js=True,
    )


def test_sayfa_getir_http2_hatasinda_http2_kapali_ikinci_deneme(monkeypatch, caplog):
    pw = SahtePlaywright([RuntimeError("Page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://www.lcw.invalid/x"), None])
    monkeypatch.setattr(perakende, "_playwright", lambda: (pw, SahteZamanAsimi, Exception))
    t = SahteKibarTarayici()
    assert perakende.sayfa_getir(_js_hedef(), t) == "<html>tamam</html>"
    assert pw.kayit["launch"] == [[], ["--disable-http2"]]
    assert pw.kayit["goto"] == [("https://www.lcw.invalid/x", "domcontentloaded")] * 2
    assert pw.kayit["kapat"] == 2 and t.istek_sayisi == 2
    from moda_radar.veri.ag import KULLANICI_ARACISI

    ayar = pw.kayit["baglam"][-1]
    assert ayar == {"user_agent": KULLANICI_ARACISI, "locale": "tr-TR", "viewport": {"width": 1280, "height": 900}}
    assert ("li.urun-karti", 20_000) in pw.kayit["bekle"]  # kart seçicisi 20 sn
    assert pw.kayit["kaydir"] == 2  # yalnız başarılı denemede iki kaydırma
    assert "HTTP/2 kapatılarak" in caplog.text and "kart seçicisi" in caplog.text


def test_sayfa_getir_ag_disi_hatada_yeniden_denemez(monkeypatch):
    pw = SahtePlaywright([ValueError("beklenmeyen"), None])
    monkeypatch.setattr(perakende, "_playwright", lambda: (pw, SahteZamanAsimi, Exception))
    with pytest.raises(ValueError):
        perakende.sayfa_getir(_js_hedef(), SahteKibarTarayici())
    assert pw.kayit["launch"] == [[]]


def test_sayfa_getir_ikinci_deneme_de_duserse_hata_yukselir(monkeypatch):
    hata = RuntimeError("net::ERR_HTTP2_PROTOCOL_ERROR")
    pw = SahtePlaywright([hata, RuntimeError("net::ERR_CONNECTION_RESET")])
    monkeypatch.setattr(perakende, "_playwright", lambda: (pw, SahteZamanAsimi, Exception))
    with pytest.raises(RuntimeError, match="CONNECTION_RESET"):
        perakende.sayfa_getir(_js_hedef(), SahteKibarTarayici())
    assert len(pw.kayit["launch"]) == 2  # en fazla bir yeniden deneme


MAGAZALAR = Path(__file__).parent / "fixtures" / "perakende_magazalar.html"


@pytest.mark.parametrize(
    "segment,marka,taban,beklenen",
    [
        (
            "orta",
            "Koton",
            "https://www.koton.com/kadin-bluz/",
            [
                ("Sentetik Keten Gömlek", 1299.99, None, "https://www.koton.com/sentetik-keten-gomlek-1/", "k1_on.jpg"),
                ("Sentetik Saten Bluz", 599.99, None, "https://www.koton.com/sentetik-saten-bluz-2/", "k2.jpg"),
            ],
        ),
        (
            "orta",
            "DeFacto",
            "https://www.defacto.com.tr/kadin-bluz",
            [
                ("Sentetik Basic Bluz", 766.99, 41.0, "https://www.defacto.com.tr/sentetik-basic-bluz-11", "d11.jpg"),
                (
                    "Sentetik Maxi Elbise",
                    1799.99,
                    None,
                    "https://www.defacto.com.tr/sentetik-maxi-elbise-12",
                    "d12.jpg",
                ),
            ],
        ),
        (
            "premium",
            "Ipekyol",
            "https://www.ipekyol.com.tr/giyim/bluz-modelleri",
            [
                (
                    "Sentetik vatkalı bluz",
                    7999.0,
                    None,
                    "https://www.ipekyol.com.tr/urun/sentetik-vatkali-bluz",
                    "i21.jpg",
                ),
                (
                    "Sentetik triko elbise",
                    11999.0,
                    None,
                    "https://www.ipekyol.com.tr/urun/sentetik-triko-elbise",
                    "i22.jpg",
                ),
            ],
        ),
    ],
)
def test_dogrulanmis_seciciler_sentetik_kartlarda(segment, marka, taban, beklenen):
    """content/perakende-kaynaklar.json seçicileri, gerçek kart yapısını taklit eden sentetik HTML'de çalışır; öteki
    mağazaların kartları karışmaz (her mağazanın seçicisi yalnız kendi 2 kartını bulur)."""
    secici = perakende.kaynaklari_oku()["segmentler"][segment][marka]["secici"]
    urunler = perakende.urunleri_ayikla(MAGAZALAR.read_text("utf-8"), secici, taban)
    bulunan = [
        (u["baslik"], u["fiyat"], u["indirim_yuzde"], u["url"], u["gorsel_url"].rsplit("/", 1)[1]) for u in urunler
    ]
    assert bulunan == beklenen
