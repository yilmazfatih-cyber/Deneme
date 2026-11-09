from moda_radar.gorsel import istem

TAKSONOMI = istem.taksonomi_oku()


def test_sema_her_eksen_enum_ve_taksonomiyle_birebir():
    sema = istem.arac_semasi(TAKSONOMI)
    assert sema["required"] == ["parcalar"] and sema["additionalProperties"] is False
    parca = sema["properties"]["parcalar"]["items"]
    assert parca["additionalProperties"] is False
    eksenler = TAKSONOMI["eksenler"]
    assert set(parca["properties"]) == set(eksenler)
    assert set(parca["required"]) == set(eksenler)
    for eksen, ozellik in parca["properties"].items():
        assert ozellik["type"] == "string"
        assert ozellik["enum"] == eksenler[eksen]


def test_parca_konumu_zorunlu_ve_bilinmiyor_yok():
    parca = istem.arac_semasi(TAKSONOMI)["properties"]["parcalar"]["items"]
    assert "parca_konumu" in parca["required"]
    assert "bilinmiyor" not in parca["properties"]["parca_konumu"]["enum"]


def test_eksenler_dogrudan_sozluk_de_kabul_eder():
    kucuk = {"desen": ["duz", "cizgili", "bilinmiyor"], "parca_konumu": ["ust", "alt", "tam"], "yabanci": ["x"]}
    parca = istem.arac_semasi(kucuk)["properties"]["parcalar"]["items"]
    assert set(parca["properties"]) == {"desen", "parca_konumu"}  # NitelikKaydi'de olmayan eksen girmez


def test_sistem_istemi_sozlugu_ve_kurallari_tasir():
    metin = istem.sistem_istemi(TAKSONOMI)
    for eksen, degerler in TAKSONOMI["eksenler"].items():
        assert f"- {eksen}: {', '.join(degerler)}" in metin
    assert "Kişiyi tarif etme" in metin and "ayrı nesne" in metin and "bilinmiyor" in metin
