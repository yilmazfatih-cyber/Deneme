"""Model arka uçları: Ollama (HTTP, standart kütüphane), llama.cpp (isteğe bağlı) ve testler için sahte arka uç.

Ortak arayüz: ``chat(messages: list[dict]) -> str`` (modelin ham yanıt metni).
"""

from __future__ import annotations

import http.client
import json
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable
from pathlib import Path

from .config import Settings
from .errors import BackendError, ConfigError, MissingExtraError

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}


class OllamaBackend:
    name = "ollama"

    def __init__(self, model: str, host: str = "http://localhost:11434", timeout: float = 180.0, num_ctx: int = 4096,
                 max_tokens: int = 512, profile: str = "qwen") -> None:
        self.model = model
        self.profile = profile
        self.host = host.rstrip("/")
        self.timeout = timeout
        self.num_ctx = num_ctx
        self.max_tokens = max_tokens
        handlers = []
        if (urllib.parse.urlsplit(self.host).hostname or "") in _LOCAL_HOSTS:
            handlers.append(urllib.request.ProxyHandler({}))  # yerel sunucuya vekil sunucu üzerinden gitme
        self._opener = urllib.request.build_opener(*handlers)

    # -- HTTP
    def _request(self, path: str, payload: dict | None = None, timeout: float | None = None) -> dict:
        url = self.host + path
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST" if data else "GET")
        try:
            with self._opener.open(req, timeout=timeout or self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")
            try:
                detail = json.loads(body).get("error", body)
            except ValueError:
                detail = body
            if exc.code == 404 and "not found" in detail.lower():
                raise BackendError(f"Ollama'da model bulunamadı: {self.model}. {install_hint(self.profile, self.model)}") from None
            raise BackendError(f"Ollama hata döndürdü ({exc.code}): {detail.strip()[:300]}") from None
        except TimeoutError:  # socket.timeout da (3.10+)
            raise BackendError(
                f"Model {int(timeout or self.timeout)} saniyede yanıt vermedi. İlk istek modeli belleğe yükler; "
                "yeniden deneyin. Sürekli yavaşsa 'text2sql bilgi' ile GPU kullanımını denetleyin."
            ) from None
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, TimeoutError):
                raise BackendError(f"Model {int(timeout or self.timeout)} saniyede yanıt vermedi.") from None
            raise BackendError(
                f"Ollama sunucusuna ulaşılamadı ({self.host}). Ollama kurulu mu ve çalışıyor mu? "
                "Başlatmak için: ollama serve  (indirme: https://ollama.com/download)"
            ) from None
        except (ConnectionError, http.client.HTTPException):  # RemoteDisconnected, ConnectionResetError ...
            raise BackendError(
                "Ollama bağlantıyı yanıt vermeden kesti (model yüklenirken bellek yetmemiş olabilir). "
                "'ollama ps' çıktısına ve Ollama günlüğüne bakıp yeniden deneyin."
            ) from None
        except ValueError as exc:
            raise BackendError(f"Ollama yanıtı okunamadı: {exc}") from None

    def version(self, timeout: float = 3.0) -> str | None:
        try:
            return self._request("/api/version", timeout=timeout).get("version", "?")
        except BackendError:
            return None

    def list_models(self, timeout: float = 5.0) -> list[str]:
        data = self._request("/api/tags", timeout=timeout)
        return [m.get("name", "") for m in data.get("models", [])]

    @staticmethod
    def has_model(names: Iterable[str], model: str) -> bool:
        """'text2sql' adı Ollama listesinde 'text2sql:latest' olarak görünür."""
        want = model if ":" in model else model + ":latest"
        return any(n == model or n == want for n in names)

    def chat(self, messages: list[dict]) -> str:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0, "num_ctx": self.num_ctx, "num_predict": self.max_tokens},
        }
        data = self._request("/api/chat", payload)
        return (data.get("message") or {}).get("content", "")


def install_hint(profile: str, model: str = "<model>") -> str:
    """Modeli profile uygun kurma önerisi (Modelfile'daki FROM satırı profile göre değişir)."""
    return (
        f"Kurmak için: ./kur.sh --profil {profile}  (Windows: .\\kur.ps1 -Profil {profile}). "
        f"Elle: python -m text2sql.config --profil {profile} modelfile_text > .Modelfile.olusan, "
        f"sonra ollama create {model} -f .Modelfile.olusan"
    )


class LlamaCppBackend:
    """llama-cpp-python ile yerel GGUF dosyası (``pip install -e ".[gguf]"``)."""

    name = "llamacpp"

    def __init__(self, gguf_path: str, num_ctx: int = 4096, max_tokens: int = 512, n_gpu_layers: int = -1) -> None:
        path = Path(gguf_path).expanduser()
        if not path.is_file():
            raise ConfigError(f"GGUF dosyası bulunamadı: {path}. README'deki 'Model değiştirme' bölümüne bakın.")
        try:
            from llama_cpp import Llama
        except ImportError:
            raise MissingExtraError("gguf", "llama.cpp arka ucu") from None
        self.model = str(path)
        self.max_tokens = max_tokens
        self._llm = Llama(model_path=str(path), n_ctx=num_ctx, n_gpu_layers=n_gpu_layers, verbose=False)

    def chat(self, messages: list[dict]) -> str:
        out = self._llm.create_chat_completion(messages=messages, temperature=0.0, max_tokens=self.max_tokens)
        return out["choices"][0]["message"]["content"] or ""


Responder = Callable[[list[dict]], str]


class FakeBackend:
    """Ağsız sahte model. ``responses`` sırayla döner (son öğe tekrarlanır) ya da bir işlev her isteğe yanıt üretir.

    Hiçbiri verilmezse: soru ornek/sorular.md'deki bir soruysa onun SQL'i, değilse sabit bir sayım sorgusu.
    """

    name = "sahte"

    def __init__(self, responses: list[str] | Responder | None = None) -> None:
        self.model = "sahte"
        self.calls: list[list[dict]] = []
        self._responses = responses

    def chat(self, messages: list[dict]) -> str:
        self.calls.append(messages)
        r = self._responses
        if callable(r):
            return r(messages)
        if r:
            return r[min(len(self.calls), len(r)) - 1]
        return self._default(messages)

    @staticmethod
    def _default(messages: list[dict]) -> str:
        from .examples import bundled_examples, normalize_question

        question = messages[-1]["content"].removeprefix("Question:").strip()
        for q, sql in bundled_examples():
            if normalize_question(q) == normalize_question(question):
                return f"```sql\n{sql}\n```"
        return "```sql\nSELECT COUNT(*) AS musteri_sayisi FROM musteriler;\n```"


def make_backend(settings: Settings):
    if settings.backend == "ollama":
        return OllamaBackend(settings.model, settings.ollama_host, settings.timeout, settings.num_ctx, settings.max_tokens, settings.profile)
    if settings.backend == "llamacpp":
        return LlamaCppBackend(settings.gguf_path, settings.num_ctx, settings.max_tokens)
    if settings.backend == "sahte":
        return FakeBackend()
    raise ConfigError(f"Bilinmeyen arka uç: {settings.backend}")
