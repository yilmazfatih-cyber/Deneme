"""Yerel LLM istemcisi (Ollama REST API).

ollama/ollama @ d63b702 (2026-11-07) klonunda doğrulandı:
- docs/api.md "Generate a chat completion": POST /api/chat; "stream": false tek bir JSON yanıt döndürür; "format"
  "json" ya da bir JSON şeması olabilir (yapılandırılmış çıktı); "options" içinde temperature; yanıt metni
  message.content alanındadır.
- internal/modelref/modelref.go (parseSourceSuffix): etiketi "cloud" olan ya da "-cloud" ile biten model adları
  (ör. gemma4:cloud, gpt-oss:120b-cloud) yerel sunucudan çağrılsa da Ollama'nın bulutunda çalışır.
  docs/faq.mdx: OLLAMA_NO_CLOUD=1 ya da ~/.ollama/server.json içinde "disable_ollama_cloud": true bulutu kapatır.
Bulut modeli ya da yerel ağ dışındaki bir Ollama sunucusu transkripti başka bir sunucuya, belki yurt dışına gönderir
(KVKK md. 9); bu yüzden ikisi de açık izin ister.
"""

import json
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from .kaynak import yerel_ag_mi

AZAMI_YANIT = 20 * 1024 * 1024  # bayt; yanlış adreste sınırsız okuma yapılmaz


class LLMHatasi(Exception):
    pass


class GonderimIzniHatasi(LLMHatasi):
    """Transkript bilgisayardan ya da yerel ağdan çıkacaksa ve buna izin verilmemişse."""


def bulut_modeli_mi(model: str) -> bool:
    """Ollama kuralı: son ':' işaretinden sonraki etiket 'cloud' ise ya da '-cloud' ile bitiyorsa bulut modelidir."""
    _, iki_nokta, etiket = model.strip().rpartition(":")
    if not iki_nokta or "/" in etiket:
        return False
    etiket = etiket.strip().lower()
    return etiket == "cloud" or etiket.endswith("-cloud")


def _hata_ayrintisi(hata: urllib.error.HTTPError) -> str:
    try:
        govde = hata.read(2000).decode("utf-8", errors="replace")
    except OSError:
        return str(hata)
    try:
        return str(json.loads(govde).get("error") or govde)
    except (ValueError, AttributeError):
        return govde.strip() or str(hata)


class OllamaIstemci:
    def __init__(
        self,
        temel_url="http://127.0.0.1:11434",
        model="qwen2.5:7b",
        zaman_asimi=300,
        gonder=None,
        bulut_izni=False,
        uzak_izni=False,
    ):
        self.temel_url = temel_url.rstrip("/")
        try:
            parca = urlsplit(self.temel_url)
            host = (parca.hostname or "").rstrip(".")
        except ValueError:
            parca, host = None, ""
        if parca is None or parca.scheme not in ("http", "https") or not host:
            raise LLMHatasi(f"Geçersiz Ollama adresi: {temel_url}")
        if (bulut_modeli_mi(model) or host == "ollama.com" or host.endswith(".ollama.com")) and not bulut_izni:
            raise GonderimIzniHatasi(
                f"'{model}' ({host}) bulutta çalışır; transkript yurt dışına gider (KVKK md. 9). Yerel bir model "
                "seçin ya da aktarım için hukuki dayanağınız varsa --bulut-modeline-izin verin."
            )
        if not yerel_ag_mi(host) and not uzak_izni:
            raise GonderimIzniHatasi(
                f"{host} yerel ağda değil; transkript o sunucuya gider, sunucu yurt dışındaysa KVKK md. 9 uygulanır. "
                "Kendi sunucunuzsa ve aktarımın dayanağı varsa --uzak-ollama verin."
            )
        self.model = model
        self.zaman_asimi = zaman_asimi
        self._gonder = gonder or self._http_post
        # Ortamdaki HTTP(S)_PROXY yok sayılır: yerel Ollama'ya giden transkript bir vekil sunucudan geçmesin.
        self._acici = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def _http_post(self, yol: str, govde: dict) -> dict:
        istek = urllib.request.Request(
            self.temel_url + yol,
            data=json.dumps(govde).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with self._acici.open(istek, timeout=self.zaman_asimi) as yanit:
                ham = yanit.read(AZAMI_YANIT + 1)
        except urllib.error.HTTPError as hata:
            raise LLMHatasi(f"Ollama {hata.code} döndürdü: {_hata_ayrintisi(hata)}") from hata
        except OSError as hata:  # bağlantı reddi, zaman aşımı, ad çözümleme
            raise LLMHatasi(f"Ollama'ya ulaşılamadı ({self.temel_url}): {hata}") from hata
        if len(ham) > AZAMI_YANIT:
            raise LLMHatasi("Ollama yanıtı beklenenden büyük; okunmadı.")
        try:
            return json.loads(ham.decode("utf-8"))
        except ValueError as hata:  # JSONDecodeError ve UnicodeDecodeError
            raise LLMHatasi(f"Ollama yanıtı JSON değil: {hata}") from hata

    def json_sohbet(self, sistem: str, kullanici: str, sema: dict) -> dict:
        govde = {
            "model": self.model,
            "messages": [{"role": "system", "content": sistem}, {"role": "user", "content": kullanici}],
            "stream": False,
            "format": sema,
            "options": {"temperature": 0.2},
        }
        yanit = self._gonder("/api/chat", govde)
        try:
            sonuc = json.loads(yanit["message"]["content"])
        except (KeyError, TypeError, ValueError) as hata:
            raise LLMHatasi(f"Model geçerli JSON döndürmedi: {hata}") from hata
        if not isinstance(sonuc, dict):
            raise LLMHatasi("Model JSON nesnesi yerine başka bir değer döndürdü.")
        return sonuc
