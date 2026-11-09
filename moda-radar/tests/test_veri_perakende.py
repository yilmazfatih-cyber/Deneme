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


def test_kaynak_dosyasi_gecerli_ve_dogrulanmamis():
    veri = perakende.kaynaklari_oku()
    hs = perakende.hedefler(veri)
    markalar = {h.marka for h in hs}
    assert {"Beymen", "Zara", "LC Waikiki", "Addax", "Trendyol"} <= markalar
    assert {h.segment for h in hs} == {"luks", "premium", "orta", "deger"}
    assert not any(h.dogrulandi for h in hs)  # ağsız yazıldı; ilk CI çalışmasında doğrulanacak
    assert [h.marka for h in perakende.hedefler(veri, "luks")] == ["Beymen"] * len(perakende.hedefler(veri, "luks"))


def test_kaynak_dogrulama_eksik_secici():
    hatalar = perakende.kaynaklari_dogrula(
        {"segmentler": {"orta": {"X": {"kategoriler": {"kadin-ust": "http://x"}, "secici": {"kart": "a"}}}}}
    )
    assert any("eksik seçiciler" in h for h in hatalar)
    assert any("dogrulandi" in h for h in hatalar)
    assert any("https://" in h for h in hatalar)


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


def test_zara_ve_lcw_kart_secici_alternatifleri():
    veri = perakende.kaynaklari_oku()
    zara = veri["segmentler"]["premium"]["Zara"]["secici"]["kart"]
    lcw = veri["segmentler"]["orta"]["LC Waikiki"]["secici"]["kart"]
    assert {"li.product-grid-product", "article[data-productid]", ".product-grid__product"} <= {
        s.strip() for s in zara.split(",")
    }
    assert {".product-card", "[data-product-id]", ".product-item"} <= {s.strip() for s in lcw.split(",")}
    html = '<article data-productid="1"><a class="product-link" href="p1.html"><h2>Gömlek</h2></a></article>'
    secici = dict(veri["segmentler"]["premium"]["Zara"]["secici"], kart=zara)
    assert [u["url"] for u in perakende.urunleri_ayikla(html, secici, "https://www.zara.com/tr/tr/")] == [
        "https://www.zara.com/tr/tr/p1.html"
    ]
