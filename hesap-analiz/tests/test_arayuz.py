import http.client
import socket
import sys
import threading
from pathlib import Path
from urllib.parse import urlencode

import pandas as pd
import pytest

KOK = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KOK / "ornek"))

from ornek_uret import uret  # noqa: E402

from hesap_analiz import guvenlik  # noqa: E402
from hesap_analiz.arayuz import Ayarlar, guvenli_dosya_adi, sunucu_olustur  # noqa: E402


@pytest.fixture
def sunucu(tmp_path):
    kaynak = tmp_path / "kaynak"
    uret(kaynak)
    ayarlar = Ayarlar(tmp_path / "girdi", tmp_path / "rapor", KOK / "bankalar",
                      KOK / "kurallar" / "kategoriler.yaml", tmp_path / "kisiler.csv")
    ayarlar.girdi.mkdir()
    s = sunucu_olustur(ayarlar, port=0)
    guvenlik.ag_kilidini_tak(yalniz_yerel=True)
    t = threading.Thread(target=s.serve_forever, daemon=True)
    t.start()
    try:
        yield s, ayarlar, kaynak
    finally:
        s.shutdown()
        s.server_close()
        guvenlik.ag_kilidini_cikar()


def _istek(s, yontem, yol, govde=None, basliklar=None):
    c = http.client.HTTPConnection("127.0.0.1", s.server_address[1], timeout=30)
    c.request(yontem, yol, body=govde, headers=basliklar or {})
    y = c.getresponse()
    veri = y.read()
    c.close()
    return y, veri.decode("utf-8", "replace")


def _multipart(dosyalar):
    sinir = "----hesapanaliztest"
    parcalar = []
    for ad, veri in dosyalar:
        parcalar.append(
            f"--{sinir}\r\nContent-Disposition: form-data; name=\"dosya\"; filename=\"{ad}\"\r\n"
            "Content-Type: application/octet-stream\r\n\r\n".encode("utf-8") + veri + b"\r\n")
    govde = b"".join(parcalar) + f"--{sinir}--\r\n".encode()
    return govde, f"multipart/form-data; boundary={sinir}"


def test_guvenli_dosya_adi():
    assert guvenli_dosya_adi("../../etc/passwd.csv") == "passwd.csv"
    assert guvenli_dosya_adi("C:\\Users\\x\\ekstre.xlsx") == "ekstre.xlsx"
    assert guvenli_dosya_adi("virus.exe") is None
    assert guvenli_dosya_adi(".gizli.csv") is None


def test_yerel_kilit_internete_izin_vermez(sunucu):
    with pytest.raises(guvenlik.AgKilidiHatasi):
        socket.getaddrinfo("example.com", 443)
    with pytest.raises(guvenlik.AgKilidiHatasi):
        socket.create_connection(("93.184.216.34", 80), timeout=1)


def test_yabanci_host_ve_origin_reddedilir(sunucu):
    s, _, _ = sunucu
    y, _ = _istek(s, "GET", "/", basliklar={"Host": "kotu-site.com"})
    assert y.status == 403
    y, _ = _istek(s, "POST", "/calistir", govde=b"", basliklar={"Origin": "https://kotu-site.com"})
    assert y.status == 403


def test_tam_akis_arayuzden(sunucu):
    s, ayarlar, kaynak = sunucu
    y, metin = _istek(s, "GET", "/")
    assert y.status == 200 and "Henüz ekstre yok" in metin
    assert "default-src 'none'" in y.getheader("Content-Security-Policy")

    dosyalar = [("ekstre-şubat.xlsx" if p.suffix == ".xlsx" and "kart" in p.name else p.name, p.read_bytes())
                for p in sorted(kaynak.iterdir())]
    dosyalar.append(("zararli.exe", b"MZ"))
    govde, ctype = _multipart(dosyalar)
    y, metin = _istek(s, "POST", "/yukle", govde, {"Content-Type": ctype})
    assert y.status == 200 and "3 dosya eklendi" in metin and "zararli.exe" in metin
    assert (ayarlar.girdi / "ekstre-şubat.xlsx").exists()

    y, metin = _istek(s, "POST", "/calistir", b"", {"Content-Type": "application/x-www-form-urlencoded"})
    assert y.status == 200 and "Analiz tamamlandı" in metin

    y, metin = _istek(s, "GET", "/rapor")
    assert y.status == 200 and "Kişi Dengesi" in metin
    y, _ = _istek(s, "GET", "/rapor.xlsx")
    assert y.status == 200 and "attachment" in y.getheader("Content-Disposition")

    # Kişiler sayfasından Mehmet Demir'i "EV SAHİBİ / kurum" olarak onayla ve yeniden çalıştır
    y, metin = _istek(s, "GET", "/kisiler?filtre=kisi")
    assert "MEHMET DEMIR" in metin
    k = pd.read_csv(ayarlar.kisiler, dtype=str).fillna("")
    kisiler = k[k["tur"] == "kisi"].reset_index(drop=True)
    form = {"adet": str(len(kisiler)), "sonra": "calistir"}
    for i, r in kisiler.iterrows():
        form[f"ham_{i}"] = r["ham_ad"]
        if r["ham_ad"] == "MEHMET DEMIR":
            form.update({f"kanonik_{i}": "EV SAHİBİ", f"tur_{i}": "kurum", f"onay_{i}": "evet"})
        else:
            form.update({f"kanonik_{i}": r["kanonik_ad"], f"tur_{i}": "kisi", f"onay_{i}": "evet"})
    y, metin = _istek(s, "POST", "/kisiler?filtre=kisi", urlencode(form).encode(),
                      {"Content-Type": "application/x-www-form-urlencoded",
                       "Origin": f"http://127.0.0.1:{s.server_address[1]}"})
    assert y.status == 200 and "Analiz tamamlandı" in metin
    denge = pd.read_excel(ayarlar.cikti / "hesap-analizi.xlsx", sheet_name="Kişi Dengesi")
    assert "EV SAHİBİ" not in set(denge["kisi"])
    assert set(denge["onay"]) == {"onaylı"}

    # Silme önce onay ister, sonra dosyayı geri alınabilir klasöre taşır
    y, metin = _istek(s, "GET", "/sil?dosya=ekstre-%C5%9Fubat.xlsx")
    assert "kaldırılsın mı" in metin and (ayarlar.girdi / "ekstre-şubat.xlsx").exists()
    y, metin = _istek(s, "POST", "/sil", urlencode({"dosya": "ekstre-şubat.xlsx"}).encode(),
                      {"Content-Type": "application/x-www-form-urlencoded"})
    assert not (ayarlar.girdi / "ekstre-şubat.xlsx").exists()
    assert (ayarlar.girdi / ".kaldirilanlar" / "ekstre-şubat.xlsx").exists()
