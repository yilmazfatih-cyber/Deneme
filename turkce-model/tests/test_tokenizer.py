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


def test_morfolojik_parca_filtresi():
    kokler, ekler = {"ağz", "masa"}, {"lar", "da", "ın", "ı", "a", "n", "k", "r"}
    assert morfolojik_mi("larda", kokler, ekler)
    assert morfolojik_mi("▁ağzın", kokler, ekler)
    assert not morfolojik_mi("ankara", kokler, ekler)  # a·n·k·a·r·a "ek dizisi" sayılmaz
