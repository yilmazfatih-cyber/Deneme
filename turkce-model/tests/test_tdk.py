import json

from conftest import KELIME_LISTESI, SENTETIK_MADDELER

from turkce_model import tdk


def test_taki_bicimi():
    ornekler = {
        ("kitap", "bı"): "kitab",
        ("ağız", "ğzı"): "ağz",
        ("hak", "kkı"): "hakk",
        ("hak", "kk'ı"): "hakk",
        ("renk", "gi"): "reng",
        ("burun", "rnu"): "burn",
        ("akıl", "klı"): "akl",
        ("çocuk", "ğu"): "çocuğ",
        ("hâk", "ki"): None,
        ("masa", "sı"): None,
        ("kitap", None): None,
    }
    for (kok, taki), beklenen in ornekler.items():
        assert tdk.taki_bicimi(kok, taki) == beklenen, (kok, taki)


def test_daralma_bicimi():
    for govde, beklenen in [("bekle", "bekli"), ("anla", "anlı"), ("topla", "toplu"), ("söyle", "söylü"), ("de", "di"), ("ye", "yi")]:
        assert tdk.daralma_bicimi(govde) == beklenen
    assert tdk.daralma_bicimi("gel") is None


def test_kokleri_cikar():
    kokler = {k: (ana, tur) for k, ana, tur in tdk.kokleri_cikar(KELIME_LISTESI, SENTETIK_MADDELER)}
    assert kokler["kitab"] == ("kitap", "ses")
    assert kokler["ağz"] == ("ağız", "ses")
    assert kokler["git"] == ("git", "fiil")
    assert kokler["gid"] == ("git", "ses")  # gitmek'in takisi "der"
    assert kokler["bekli"] == ("bekle", "daralma")
    assert "gitmek" not in kokler  # mastarın kendisi kök değil: git + mek
    assert kokler["çocuğ"] == ("çocuk", "kural")  # TDK verisi yokken kurala göre tahmin


def test_madde_metni():
    metin = tdk.madde_metni(SENTETIK_MADDELER[0])
    assert metin.splitlines()[0] == "kitap (Arapça)"
    assert "1. isim: Sayfaları bir arada tutulan yazılı eser" in metin
    assert '"Kitabı masada unuttum."' in metin
    assert "Uydurma Yazar" not in metin  # yazar adları varsayılan olarak yok
    assert "Uydurma Yazar" in tdk.madde_metni(SENTETIK_MADDELER[0], yazar_ekle=True)
    assert "2. bk. defter" in metin
    assert metin.endswith("Birleşik sözler: kitap kurdu, el kitabı")


def test_derlem_ve_ayrim_kararli(tmp_path):
    sayac = tdk.derlem_olustur(SENTETIK_MADDELER, tmp_path / "d.jsonl")
    assert sayac["egitim"] + sayac["dogrulama"] == len(SENTETIK_MADDELER)
    ilk = (tmp_path / "d.jsonl").read_text(encoding="utf-8")
    tdk.derlem_olustur(SENTETIK_MADDELER, tmp_path / "d.jsonl")
    assert (tmp_path / "d.jsonl").read_text(encoding="utf-8") == ilk


class _Yanit:
    def __init__(self, durum, veri):
        self.status_code, self._veri, self.headers = durum, veri, {}

    def json(self):
        return self._veri


class _SahteOturum:
    def __init__(self, yanitlar):
        self.yanitlar, self.istekler = yanitlar, []

    def get(self, url, params=None, timeout=None):
        kelime = params["ara"]
        self.istekler.append(kelime)
        sira = self.yanitlar[kelime]
        return sira.pop(0) if len(sira) > 1 else sira[0]


def test_indirme_kaldigi_yerden_surer(tmp_path, monkeypatch):
    monkeypatch.setattr(tdk.time, "sleep", lambda s: None)
    cikti = tmp_path / "maddeler.jsonl"
    oturum = _SahteOturum(
        {
            "kitap": [_Yanit(200, [{"madde_id": "1", "madde": "kitap"}])],
            "yok": [_Yanit(200, {"error": "Sonuç bulunamadı"})],
            "yavas": [_Yanit(503, None), _Yanit(200, [{"madde_id": "9", "madde": "yavas"}])],
        }
    )
    sayac = tdk.maddeleri_indir(["kitap", "yok", "yavas"], cikti, bekleme=0, oturum=oturum, yaz=lambda *a: None)
    assert sayac == {"tamam": 2, "yok": 1, "hata": 0, "atlanan": 0}
    assert oturum.istekler.count("yavas") == 2  # 503'ten sonra yeniden denendi
    sayac = tdk.maddeleri_indir(["kitap", "yok", "yavas"], cikti, bekleme=0, oturum=oturum, yaz=lambda *a: None)
    assert sayac["atlanan"] == 3
    with cikti.open("a", encoding="utf-8") as f:
        f.write('{"ara": "yarim')  # yarıda kesilmiş satır
    assert [m["madde"] for m in tdk.maddeleri_oku(cikti)] == ["kitap", "yavas"]
    assert json.loads(cikti.read_text(encoding="utf-8").splitlines()[1])["durum"] == "yok"
