"""kendi-modelinle-sohbet doğrulaması: yz denetimi + sunucu sözleşmesi + yz komutları + tek komutluk deneme.

Kullanım:  python havuz/tarifler/kendi-modelinle-sohbet/dogrula.py <proje-klasörü>   (önce uygula.py)
Adımlar:  1) yz kendi denetimi (yeni ayar dosyası kurallarını bozmuyor mu)
          2) dil-modeli sunucusu boş kapıda başlar; sözleşme HTTP ile denetlenir: model listesi,
             akışsız + akışlı sohbet ve kullanım bilgisi, araç çağrısının 400 ile reddi,
             response_format'ın sessizce yok sayılması (bilgi olarak kaydedilir)
          3) yz'nin GERÇEK komutları (ayrı süreç): modeller, sohbet, degerlendir, cikar
          4) baglanti/dene.py (sahibin çalıştıracağı tek komut) baştan sona
Genişletme: yeni sözleşme maddesi → `sozlesmeyi_dene` içine bir `with gunluk.adim(...)` bloğu.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tarifcik.betik import bu_tarif, hedef_al
from tarifcik.komut import Gunluk, calistir_ve_ozetle
from tarifcik.kurulum import temeli_denetle, venv_ortami, venv_python
from tarifcik.sunucu import Surec, bos_kapi, http_istek

MESAJ = [{"role": "user", "content": "Merhaba"}]


def sozlesmeyi_dene(gunluk: Gunluk, taban: str) -> None:
    with gunluk.adim("sözleşme: /v1/models ve akışsız sohbet (kullanım bilgisiyle)"):
        _, _, liste = http_istek("GET", f"{taban}/models")
        if [m["id"] for m in liste["data"]] != ["ornek-model"]:
            raise AssertionError(f"model listesi beklenmedik: {liste}")
        durum, _, yanit = http_istek("POST", f"{taban}/chat/completions",
                                     {"messages": MESAJ, "max_tokens": 8, "temperature": 0})  # fmt: skip
        if durum != 200 or yanit["usage"]["completion_tokens"] < 1:
            raise AssertionError(f"sohbet yanıtı beklenmedik: {durum} {yanit}")
        print(f"  yanıt: {yanit['choices'][0]['message']['content']!r}")
    with gunluk.adim("sözleşme: akış (SSE) parçaları, kullanım ve [DONE]"):
        govde = {"messages": MESAJ, "max_tokens": 6, "stream": True,
                 "stream_options": {"include_usage": True}}  # fmt: skip
        _, basliklar, ham = http_istek("POST", f"{taban}/chat/completions", govde)
        satirlar = [s[6:] for s in str(ham).splitlines() if s.startswith("data: ")]
        if "text/event-stream" not in basliklar.get("content-type", "") or satirlar[-1] != "[DONE]":
            raise AssertionError(f"akış beklenen biçimde değil: {basliklar} {ham!r:.300}")
        if "usage" not in json.loads(satirlar[-2]):
            raise AssertionError("akışın sonunda kullanım (usage) parçası yok")
        print(f"  {len(satirlar) - 1} parça")
    with gunluk.adim("sözleşme: araç çağrısı 400 ile reddedilir (yz metin kipine geçer)"):
        araclar = [{"type": "function", "function": {"name": "hesapla", "parameters": {}}}]
        durum, _, yanit = http_istek("POST", f"{taban}/chat/completions",
                                     {"messages": MESAJ, "tools": araclar})  # fmt: skip
        if durum != 400 or "tools" not in json.dumps(yanit, ensure_ascii=False):
            raise AssertionError(f"tools reddedilmedi: {durum} {yanit}")
    with gunluk.adim("sözleşme: response_format sessizce yok sayılır (bilgi)"):
        durum, _, yanit = http_istek("POST", f"{taban}/chat/completions", {
            "messages": MESAJ, "max_tokens": 8, "temperature": 0,
            "response_format": {"type": "json_object"}})  # fmt: skip
        icerik = yanit["choices"][0]["message"]["content"]
        try:
            json.loads(icerik)
            sonuc = "çıktı JSON (bu model için beklenmezdi)"
        except json.JSONDecodeError:
            sonuc = "çıktı JSON değil: alan uygulanmıyor → yapili_kip: kapali doğru seçim"
        if durum != 200:
            raise AssertionError(f"response_format isteği {durum} döndü (200 beklenirdi)")
        print(f"  {sonuc}")


def yz_komutlari(gunluk: Gunluk, proje: Path, kapi: int) -> None:
    yz = proje / "yz"
    calisma = proje / "baglanti" / "calisma" / "dogrula"
    calisma.mkdir(parents=True, exist_ok=True)
    ayar = (yz / "yz.dil-modeli.yaml").read_text(encoding="utf-8")
    (calisma / "yz.yaml").write_text(ayar.replace(":8430", f":{kapi}"), encoding="utf-8")
    ortam = venv_ortami(yz, {"YZ_VERI_DIZINI": str(calisma / ".yz")})
    py, ayar_yolu = str(venv_python(yz)), str(calisma / "yz.yaml")
    gunluk.calistir("yz modeller", [py, "-m", "yz", "modeller", "--ayar", ayar_yolu], yz, ortam)
    gunluk.calistir("yz sohbet -m (akışlı)",
                    [py, "-m", "yz", "sohbet", "--ayar", ayar_yolu, "-m", "Merhaba"], yz, ortam)  # fmt: skip
    gunluk.calistir("yz degerlendir (5 örnek)", [
        py, "-m", "yz", "degerlendir", "gorevler/siniflandirma.yaml", "--ayar", ayar_yolu,
        "--sinir", "5", "--cikti", str(calisma / "kosu")], yz, ortam)  # fmt: skip
    with gunluk.adim("değerlendirme özeti: 5 örnek, sıfır bağlantı hatası"):
        rapor = (calisma / "kosu" / "rapor.md").read_text(encoding="utf-8")
        satir = next(s for s in rapor.splitlines() if s.startswith("| ornek-model"))
        hucreler = [h.strip() for h in satir.strip("|").split("|")]
        print(f"  {satir}")
        if hucreler[3] != "0":
            raise AssertionError(f"değerlendirmede {hucreler[3]} bağlantı/sunucu hatası var")
    with gunluk.adim("yz cikar: biçim geçerli ama anlamsız (dürüst sonuç kaydı)"):
        sonuc = subprocess.run(
            [py, "-m", "yz", "cikar", "--ayar", ayar_yolu, "--sema", "yz.yapili.semalar:Iletisim",
             "--katmanlar", "istem,alan", "--metin", "Ben Elif Demir, telefonum 0532 444 55 66."],
            cwd=yz, env=ortam, capture_output=True, text=True, timeout=300, check=False,
        )  # fmt: skip
        print(sonuc.stdout[-600:], sonuc.stderr[-600:], sep="\n")
        if sonuc.returncode not in (0, 2) or "Traceback" in sonuc.stderr:
            raise AssertionError(f"cikar beklenmedik biçimde bitti (kod {sonuc.returncode})")


def sunucuyla(gunluk: Gunluk, proje: Path) -> None:
    dm = proje / "dil-modeli"
    kapi = bos_kapi()
    komut = [str(venv_python(dm)), "-m", "dil_modeli", "sun", "--model", "ornek-model",
             "--kapi", str(kapi)]  # fmt: skip
    gunluk_yolu = proje / "baglanti" / "calisma" / "dogrula" / "sunucu.log"
    with Surec("dil-modeli sunucusu", komut, dm, venv_ortami(dm), gunluk_yolu) as sunucu:
        with gunluk.adim("dil-modeli sunucusu: başlat"):
            sunucu.saglik_bekle(f"http://127.0.0.1:{kapi}/v1/models", sure_sn=180)
        sozlesmeyi_dene(gunluk, f"http://127.0.0.1:{kapi}/v1")
        yz_komutlari(gunluk, proje, kapi)


def main(argv: list[str]) -> int:
    tarif = bu_tarif(__file__)
    proje = hedef_al(argv, yeni=False)
    gunluk = Gunluk(f"{tarif.ad} · doğrula → {proje}")
    return calistir_ve_ozetle(
        gunluk,
        [
            lambda: temeli_denetle(gunluk, proje / "yz"),
            lambda: sunucuyla(gunluk, proje),
            lambda: gunluk.calistir(
                "baglanti/dene.py (tek komut)", [sys.executable, "baglanti/dene.py"], proje
            ),
        ],
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
