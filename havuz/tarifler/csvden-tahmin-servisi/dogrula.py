"""csvden-tahmin-servisi doğrulaması: temel denetimleri + uçtan uca hat + gerçek HTTP servisine istekler.

Kullanım:  python havuz/tarifler/csvden-tahmin-servisi/dogrula.py <proje-klasörü>   (önce uygula.py)
Adımlar:  1) ml-temel ve veri kendi denetimleri (ml-temel'de yeni `sun` komutunun testleri dahil)
          2) hat/calistir.py: üret → profil → temizle → sızıntı sütununu at → eğit
          3) çıktı denetimi: sızıntı sütunu eğitim verisinde yok, sınama ROC-AUC makul aralıkta
          4) servis boş kapıda, geçici anahtarla başlar; tahmin, sıralama, anahtar ve şema hataları
Sunucu her durumda kapatılır (bağlam yöneticisi). Anahtar her koşuda yeniden üretilir, diske yazılmaz.
Genişletme: yeni bir uçtan uca denetim → `servisi_dene` içine bir `with gunluk.adim(...)` bloğu.
"""

from __future__ import annotations

import csv
import json
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tarifcik.betik import bu_tarif, hedef_al
from tarifcik.komut import Gunluk, calistir_ve_ozetle
from tarifcik.kurulum import temeli_denetle, venv_ortami, venv_python
from tarifcik.sunucu import Surec, bos_kapi, http_istek

ROC_ARALIGI = (0.65, 0.95)  # altı: model öğrenmemiş; üstü: büyük olasılıkla sızıntı var


def hat_ciktilarini_denetle(gunluk: Gunluk, proje: Path) -> None:
    calisma = proje / "hat" / "calisma"
    with gunluk.adim("hat çıktıları: sızıntı sütunu yok, rapor ve ölçüt makul"):
        with (calisma / "egitim.csv").open(encoding="utf-8") as dosya:
            baslik = next(csv.reader(dosya))
        if "gercek_olasilik" in baslik:
            raise AssertionError("egitim.csv'de sızıntı sütunu (gercek_olasilik) duruyor")
        degisiklik = (calisma / "degisiklikler.jsonl").read_text(encoding="utf-8").splitlines()
        if len(degisiklik) < 100:
            raise AssertionError(f"temizle yalnız {len(degisiklik)} değer düzeltti; kirli veri mi?")
        olcut = json.loads((calisma / "model" / "metrikler.json").read_text(encoding="utf-8"))
        roc = float(olcut["sinama"]["olcutler"]["roc_auc"]["deger"])
        print(f"  sınama ROC-AUC = {roc:.3f} (beklenen aralık {ROC_ARALIGI})")
        if not ROC_ARALIGI[0] < roc < ROC_ARALIGI[1]:
            raise AssertionError(f"ROC-AUC {roc:.3f} beklenen aralığın dışında")


def servisi_dene(gunluk: Gunluk, proje: Path) -> None:
    ml = proje / "ml-temel"
    kapi, anahtar = bos_kapi(), secrets.token_urlsafe(24)
    model = proje / "hat" / "calisma" / "model" / "model.npz"
    komut = [
        str(venv_python(ml)),
        "-m",
        "ml_temel",
        "sun",
        "--model",
        str(model),
        "--kapi",
        str(kapi),
    ]
    ortam = venv_ortami(ml, {"ML_TEMEL_ANAHTAR": anahtar})
    taban = f"http://127.0.0.1:{kapi}"
    yetki = {"Authorization": f"Bearer {anahtar}"}
    with Surec(
        "tahmin servisi", komut, ml, ortam, proje / "hat" / "calisma" / "sunucu.log"
    ) as sunucu:
        with gunluk.adim("servis: başlat ve /saglik"):
            sunucu.saglik_bekle(f"{taban}/saglik", sure_sn=60)
        with gunluk.adim("servis: curl ile örnek istek (düşük < yüksek risk)"):
            ornek = proje / "hat" / "ornek_istek.json"
            if shutil.which("curl"):
                cikti = subprocess.run(
                    ["curl", "-sS", "--fail-with-body", f"{taban}/tahmin", "-H",
                     "Content-Type: application/json", "-H", f"Authorization: Bearer {anahtar}",
                     "-d", f"@{ornek}"],
                    capture_output=True, text=True, check=True, timeout=60,
                ).stdout  # fmt: skip
                yanit = json.loads(cikti)
            else:
                _, _, yanit = http_istek(
                    "POST", f"{taban}/tahmin", json.loads(ornek.read_text()), yetki
                )
            print(f"  yanıt: {json.dumps(yanit, ensure_ascii=False)}")
            dusuk, yuksek = (t["olasiliklar"]["1"] for t in yanit["tahminler"])
            if not dusuk < 0.3 < yuksek:
                raise AssertionError(
                    f"riskler beklenen sırada değil: düşük={dusuk}, yüksek={yuksek}"
                )
        with gunluk.adim("servis: anahtarsız 401, hatalı girdi 400 (alan yoluyla)"):
            durum, _, _ = http_istek("POST", f"{taban}/tahmin", {"satirlar": [{}]})
            if durum != 401:
                raise AssertionError(f"anahtarsız istek {durum} döndü (401 beklenirdi)")
            bozuk = {"satirlar": [{"yas": "otuz", "bolgee": "Ege"}]}
            durum, _, govde = http_istek("POST", f"{taban}/tahmin", bozuk, yetki)
            yollar = {a["yol"] for a in govde["hata"]["ayrintilar"]}
            if durum != 400 or not {"satirlar[0].yas", "satirlar[0].bolgee"} <= yollar:
                raise AssertionError(f"doğrulama hatası beklenen biçimde değil: {durum} {govde}")
            durum, _, govde = http_istek("GET", f"{taban}/sema", None, yetki)
            print(f"  şema: {[a['ad'] for a in govde['alanlar']]}")


def main(argv: list[str]) -> int:
    tarif = bu_tarif(__file__)
    proje = hedef_al(argv, yeni=False)
    gunluk = Gunluk(f"{tarif.ad} · doğrula → {proje}")
    return calistir_ve_ozetle(
        gunluk,
        [
            lambda: temeli_denetle(gunluk, proje / "ml-temel"),
            lambda: temeli_denetle(gunluk, proje / "veri"),
            lambda: gunluk.calistir(
                "hat: üret → profil → temizle → hazırla → eğit",
                [sys.executable, "hat/calistir.py"],
                proje,
            ),
            lambda: hat_ciktilarini_denetle(gunluk, proje),
            lambda: servisi_dene(gunluk, proje),
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
