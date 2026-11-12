from turkce_model.morfoloji import ek_envanteri, genislet


def test_dort_yonlu_uyum_ve_unsuz_benzesmesi():
    assert genislet("lAr") == ["lar", "ler"]
    assert set(genislet("DA")) == {"da", "de", "ta", "te"}
    assert set(genislet("(I)mIz")) == {"ımız", "imiz", "umuz", "ümüz", "mız", "miz", "muz", "müz"}


def test_ek_icindeki_unlu_kendinden_onceki_unluye_uyar():
    # a/e düzdür, ardından gelen I yalnız ı/i olabilir: "laru", "cağuz" üretilmemeli
    assert genislet("lArI") == ["ları", "leri"]
    assert set(genislet("CAğIz")) == {"cağız", "çağız", "ceğiz", "çeğiz"}
    assert set(genislet("mAlI")) == {"malı", "meli"}


def test_yumusama_bicimleri():
    assert {"lık", "lığ", "lik", "liğ"} <= set(genislet("lIk"))
    assert {"acak", "acağ", "yeceğ"} <= set(genislet("(y)AcAk"))
    assert "mağ" not in genislet("mAk")


def test_asil_bicim_baglari():
    env = ek_envanteri()
    assert env["ler"].ana == "lar"
    assert env["tan"].ana == "dan"
    assert env["lığ"].ana == "lık"
    assert env["di"].ana == "dı"  # hem DI hem (y)DI'den gelir, ama asıl biçim aynı
    assert env["in"].ana == "ın"
    assert env["yi"].ana == "yı"
    assert env["ı"].ana == "ı"  # tek harfli biçimler paylaşılmaz
    assert all(len(b) == 1 or len(e.ana) > 1 for b, e in env.items())
