import random

from conftest import CUMLELER

from turkce_model.tokenizer import (
    BOSLUK_ID,
    BUYUK,
    EOS,
    KAT,
    KATEGORILER,
    OZEL_TOKENLAR,
    TUM_BUYUK,
    TurkceTokenizer,
    morfolojik_mi,
)


def parcalar(tok, metin):
    return [tok.parcalar[i] for i in tok.encode(metin)]


def test_kok_ek_bolunmesi(tok):
    assert parcalar(tok, "kitaplarımızdan") == ["▁kitap", "lar", "ımız", "dan"]
    assert parcalar(tok, "okula") == ["▁okul", "a"]  # oku·la değil
    assert parcalar(tok, "masalardaydı") == ["▁masa", "lar", "da", "ydı"]  # masal·arda değil
    assert parcalar(tok, "kitabı") == ["▁kitab", "ı"]  # ses değişimli kök biçimi
    assert parcalar(tok, "bekliyordu") == ["▁bekli", "yor", "du"]


def test_buyuk_harf_isaretleri(tok):
    ids = tok.encode("Kitap TDK")
    assert ids[0] == BUYUK and tok.parcalar[ids[1]] == "▁kitap"
    assert TUM_BUYUK in ids
    assert tok.decode(tok.encode("İstanbul ISPARTA ırmak")) == "İstanbul ISPARTA ırmak"


def test_satir_basi_ortuk_bosluk(tok):
    ids = tok.encode("kitap\nkitap")
    assert ids.count(tok.kimlik["▁kitap"]) == 2  # satır başında da aynı token
    assert tok.decode(ids) == "kitap\nkitap"


def test_kayipsiz_geri_donus(tok):
    for m in CUMLELER + ["", "x² ə 😀 iPhone STRAßE", "a  b\n\n c ", "   ", "\n\nbaşta"]:
        assert tok.decode(tok.encode(m, normalle=False)) == m, m


def test_rastgele_kayipsizlik(tok):
    rnd = random.Random(0)
    harfler = "abcçdefgğhıijklmnoöprsştuüvyzABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ  \n.,'\"()-0123456789âîûéəß😀"
    for _ in range(3000):
        m = "".join(rnd.choice(harfler) for _ in range(rnd.randint(1, 30)))
        assert tok.decode(tok.encode(m, normalle=False)) == m, repr(m)


def test_rastgele_kimlik_dizisi_cozulebilir(tok):
    rnd = random.Random(1)
    for _ in range(500):
        tok.decode([rnd.randrange(-5, tok.boyut + 5) for _ in range(rnd.randint(0, 40))])  # çökmemeli


def test_kimlik_bloklari_turkce_sirada(tok):
    assert tok.parcalar[: len(OZEL_TOKENLAR)] == OZEL_TOKENLAR
    kategoriler = tok.kategoriler
    assert kategoriler == sorted(kategoriler), "kategoriler blok blok, sabit sırada olmalı"
    araliklar = tok.kategori_araliklari()
    assert list(araliklar) == [k for k in KATEGORILER if k in araliklar]
    harfler = [tok.parcalar[i] for i in range(*araliklar["harf"])]
    assert harfler[:6] == ["a", "b", "c", "ç", "d", "e"]  # Türk alfabesi sırası
    assert tok.parcalar[BOSLUK_ID] == "▁" and tok.parcalar[EOS] == "<eos>"


def test_ana_ve_bicim_baglari(tok):
    assert tok.parcalar[tok.analar[tok.kimlik["ler"]]] == "lar"
    assert tok.parcalar[tok.analar[tok.kimlik["▁kitab"]]] in ("▁kitap", "kitap")
    for i, a in enumerate(tok.analar):
        assert tok.analar[a] == a, "ana bağı tek adım olmalı"
        if a != i:
            assert tok.kategoriler[a] == tok.kategoriler[i] in (KAT["ek"], KAT["kok"])


def test_kaydet_yukle(tok, tmp_path):
    tok.kaydet(tmp_path)
    yeni = TurkceTokenizer.yukle(tmp_path)
    for m in CUMLELER:
        assert yeni.encode(m) == tok.encode(m)
    assert yeni.analar == tok.analar and yeni.bicimler == tok.bicimler


def test_kelime_icindeki_ust_alt_simge_ve_romen_rakamlari_kayipsiz(tok):
    # ², ₂, Ⅻ ön bölütlemede kelime karakteridir; çözücü de öyle saymalı (yoksa <BB> yarıda kalır).
    for m in ["H₂O", "H₂SO₄", "C₆H₁₂O₆", "KM²DE", "X²Y", "Ⅻ kitap", "Ⅳ. Murat", "20 M²LİK"]:
        assert tok.decode(tok.encode(m)) == m, m
    # Büyük harf işareti belgeden belgeye taşmaz.
    ids = tok.encode("Ⅻ", bos=True, eos=True) + tok.encode("kitap", bos=True, eos=True)
    assert tok.decode(ids) == "Ⅻkitap"


def test_metindeki_bosluk_isareti_bosluk_tokeniyle_karismaz(tok):
    assert tok.encode("a▁é") != tok.encode("a é")
    for m in ["a▁b", "▁kitap", "kitap▁", "x ▁ y"]:
        assert tok.decode(tok.encode(m, normalle=False)) == m


def test_satir_ayirici_iceren_parca_kaydedilip_yuklenir(tok, tmp_path):
    # normallestir U+2028'i satır sonuna çevirir; yine de elle eklenmiş böyle bir parça dosyayı bozmamalı.
    yeni = TurkceTokenizer(
        tok.parcalar + [" "], tok.kategoriler + [KAT["noktalama"]], tok.maliyetler + [20.0],
        tok.analar + [len(tok.parcalar)], tok.bicimler + [0], tok.sayilar + [0], dict(tok.bilgi),
    )
    yeni.kaydet(tmp_path)
    assert TurkceTokenizer.yukle(tmp_path).parcalar == yeni.parcalar


def test_daralmis_govde_yalniz_yor_onunde(tok):
    # "adı" (ad + ı) ile "adı-yor" (adamak) ayrı: daralmış gövde yalnız -yor önünde kullanılır.
    assert parcalar(tok, "adı") == ["▁ad", "ı"]
    assert parcalar(tok, "adıyor") == ["▁adı", "yor"]
    assert tok.bilgi["yor_once"] and "adı" in tok.bilgi["yor_once"]


def test_mastar_govde_arti_mek(tok):
    # "gelme" ve "olma" TDK'de ayrı madde başı olsa da mastar "▁gelme·k" değil "▁gel·mek" bölünür.
    assert parcalar(tok, "gelmek") == ["▁gel", "mek"]
    assert parcalar(tok, "olmak") == ["▁ol", "mak"]


def test_acilis_isaretinden_sonra_kok_ek_bolunmesi(tok):
    ids = tok.encode('"Kitaplarını getirdi."')
    assert [tok.parcalar[i] for i in ids[:3]] == ['▁"', "<B>", "▁kitap"]  # tırnaktan sonra da ▁'lı kök
    for m in ['"Kitaplarını getirdi."', "( kitap)", "x(kitap)", '"a" "b"', '("kitap")']:
        assert tok.decode(tok.encode(m, normalle=False)) == m, m


def test_morfolojik_parca_filtresi():
    kokler, ekler = {"ağz", "masa"}, {"lar", "da", "ın", "ı", "a", "n", "k", "r"}
    assert morfolojik_mi("larda", kokler, ekler)
    assert morfolojik_mi("▁ağzın", kokler, ekler)
    assert not morfolojik_mi("ankara", kokler, ekler)  # a·n·k·a·r·a "ek dizisi" sayılmaz
