"""Ayarlar: varsayılanlar < text2sql.toml (çalışma klasöründe) < ortam değişkenleri < komut satırı.

Ortam değişkenleri:
  TEXT2SQL_PROFIL       model profili: qwen (varsayılan) | slm-sql | prem | buyuk (bkz. PROFILES)
  TEXT2SQL_MODEL        Ollama'daki model adı (varsayılan "text2sql": kurulum betiğinin Modelfile ile oluşturduğu model)
  TEXT2SQL_BASE_MODEL   Modelfile'ın üzerine kurulduğu Ollama etiketi (varsayılan "qwen2.5-coder:1.5b")
  TEXT2SQL_BACKEND      "ollama" (varsayılan) | "llamacpp" | "sahte" (testler için)
  TEXT2SQL_GGUF         llamacpp arka ucu için .gguf dosya yolu
  TEXT2SQL_NUM_CTX      bağlam penceresi (varsayılan 4096)
  TEXT2SQL_TIMEOUT      model yanıtı için en uzun bekleme, saniye (varsayılan 180)
  TEXT2SQL_MAX_TOKENS   yanıt üst sınırı (varsayılan 512; profil "buyuk" 2048)
  OLLAMA_HOST           Ollama adresi (varsayılan http://localhost:11434)
  TEXT2SQL_DB           --db verilmezse kullanılacak veritabanı (parolayı komut geçmişine yazmamak için)

Kurulum betikleri değerleri buradan okur: ``python -m text2sql.config --profil slm-sql base_model``.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field, fields
from pathlib import Path

if sys.version_info >= (3, 11):
    import tomllib
else:  # pragma: no cover - Python 3.10
    import tomli as tomllib

# Model profilleri: yalnızca veri. Seçim gerekçeleri ve kaynaklar: docs/MODEL_SECIMI.md.
#   model       : kurulumun Ollama'da oluşturduğu ad (ollama create <model> -f <modelfile>)
#   base_model  : Modelfile'daki FROM için çekilecek Ollama etiketi; boşsa FROM yerel gguf_path olur
#   gguf_path   : llama.cpp arka ucu (ve base_model boşsa Ollama) için yerel dosya
#   gguf_source : GGUF dosyasının indirileceği Hugging Face deposu (bilgi)
#   max_tokens  : (isteğe bağlı) yanıt üst sınırı; yoksa 512
PROFILES: dict[str, dict[str, str]] = {  # değerler metin; max_tokens sayıya çevrilir
    "qwen": {
        "model": "text2sql",
        "base_model": "qwen2.5-coder:1.5b",
        "modelfile": "Modelfile",
        "gguf_path": "models/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
        "gguf_source": "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF (qwen2.5-coder-1.5b-instruct-q4_k_m.gguf, ≈ 986 MB)",
        "license": "Apache-2.0",
        "note": "Varsayılan. Qwen2.5-Coder-1.5B-Instruct, ≈ 1,54 B parametre, çok dilli; Türkçe sorular için daha güvenli.",
    },
    "slm-sql": {
        "model": "text2sql-slm",
        "base_model": "hf.co/frizynn/SLM-SQL-1.5B-GGUF:Q4_K_M",
        "modelfile": "Modelfile",  # taban Qwen2.5-Coder-1.5B: aynı sohbet şablonu
        "gguf_path": "models/SLM-SQL-1.5B-Q4_K_M.gguf",
        "gguf_source": "frizynn/SLM-SQL-1.5B-GGUF (topluluk; dosya adını depo listesinden denetleyin)",
        "license": "kart tutarsız (apache-2.0 yalnızca bir PR revizyonunda)",
        "note": "SQL için ince ayarlı. Üretici BIRD dev %67 bildiriyor, ama çok örnekli düzeltmeli çıkarımla; bu araç tek çağrı "
                "yapar ve kendi istemini kullanır (model kartının şablonunu değil), skor daha düşük olur, doğrulanmadı. "
                "İngilizce eğitimli; Türkçe sorularda doğrulanmadı.",
    },
    "prem": {
        "model": "text2sql-prem",
        "base_model": "",
        "modelfile": "Modelfile.prem",
        "gguf_path": "models/prem-1B-SQL.Q4_K_M.gguf",
        "gguf_source": "QuantFactory/prem-1B-SQL-GGUF ya da tensorblock/prem-1B-SQL-GGUF (dosya adını depo listesinden denetleyin)",
        "license": "MIT (kartta; meta veride apache-2.0 da geçiyor)",
        "note": "premai-io/prem-1B-SQL, ≈ 1,3 B, deepseek-coder-1.3b tabanlı, 2024 tarihli; BIRD dev %46 (üretici).",
    },
    "buyuk": {
        "model": "text2sql-buyuk",
        "base_model": "",
        "modelfile": "Modelfile",  # taban Qwen2.5-Coder-7B
        "gguf_path": "models/Arctic-Text2SQL-R1-7B-Q4_K_M.gguf",
        "gguf_source": "Snowflake/Arctic-Text2SQL-R1-7B için bir topluluk GGUF'u (Q4_K_M ≈ 4,7 GB); resmî Ollama etiketi doğrulanamadı",
        "license": "Apache-2.0",
        "max_tokens": "2048",  # akıl yürütme (<think>) çıktısı SQL'den önce gelebilir
        "note": "8 GB+ VRAM için. 7B; BIRD dev %68,9 (üretici). Bu araçla denenmedi. Diskte ≈ 4,7 GB (yerel GGUF'tan kurulursa ≈ 9,5 GB).",
    },
}
DEFAULT_PROFILE = "qwen"
DEFAULT_MODEL = PROFILES[DEFAULT_PROFILE]["model"]
DEFAULT_BASE_MODEL = PROFILES[DEFAULT_PROFILE]["base_model"]
DEFAULT_OLLAMA_HOST = "http://localhost:11434"
CONFIG_FILE = "text2sql.toml"

BACKENDS = ("ollama", "llamacpp", "sahte")
_BACKEND_ALIASES = {"fake": "sahte", "llama.cpp": "llamacpp", "gguf": "llamacpp", "llama-cpp": "llamacpp"}

_ENV = {
    "profile": "TEXT2SQL_PROFIL",
    "model": "TEXT2SQL_MODEL",
    "base_model": "TEXT2SQL_BASE_MODEL",
    "backend": "TEXT2SQL_BACKEND",
    "gguf_path": "TEXT2SQL_GGUF",
    "num_ctx": "TEXT2SQL_NUM_CTX",
    "timeout": "TEXT2SQL_TIMEOUT",
    "max_tokens": "TEXT2SQL_MAX_TOKENS",
    "ollama_host": "OLLAMA_HOST",
}


def normalize_backend(name: str) -> str:
    name = (name or "").strip().lower()
    name = _BACKEND_ALIASES.get(name, name)
    if name not in BACKENDS:
        from .errors import ConfigError

        raise ConfigError(f"Bilinmeyen arka uç: {name!r}. Seçenekler: {', '.join(BACKENDS)}")
    return name


def normalize_host(host: str) -> str:
    """OLLAMA_HOST "0.0.0.0:11434" ya da "localhost" gibi de verilebilir; tam URL'ye çevir."""
    host = (host or DEFAULT_OLLAMA_HOST).strip().rstrip("/")
    if "://" not in host:
        host = "http://" + host
    scheme, rest = host.split("://", 1)
    hostport = rest.split("/", 1)[0]
    if hostport.startswith("0.0.0.0"):  # sunucu dinleme adresi; istemci için yerel makine
        rest = rest.replace("0.0.0.0", "127.0.0.1", 1)
        hostport = rest.split("/", 1)[0]
    if ":" not in hostport.split("]")[-1]:
        rest = hostport + ":11434" + rest[len(hostport):]
    return f"{scheme}://{rest}"


@dataclass
class Settings:
    model: str = DEFAULT_MODEL
    base_model: str = DEFAULT_BASE_MODEL
    backend: str = "ollama"
    ollama_host: str = DEFAULT_OLLAMA_HOST
    gguf_path: str = PROFILES[DEFAULT_PROFILE]["gguf_path"]
    profile: str = DEFAULT_PROFILE
    modelfile: str = PROFILES[DEFAULT_PROFILE]["modelfile"]
    num_ctx: int = 4096
    timeout: float = 180.0
    max_tokens: int = 512
    sample_rows: int = 2
    retries: int = 1
    limit: int = 200
    history: int = 3
    query_timeout: float = 30.0
    source: list[str] = field(default_factory=list)  # hangi katmanlar uygulandı (bilgi için)

    @classmethod
    def load(cls, cwd: str | Path | None = None, env: dict | None = None, profile: str | None = None) -> Settings:
        """Katmanlar: profil < text2sql.toml < ortam değişkenleri.

        Profil seçimi: ``profile`` (komut satırı --profil) > TEXT2SQL_PROFIL > toml'daki ``profil`` > "qwen".
        Tek tek anahtarlar (ör. TEXT2SQL_BASE_MODEL) seçilen profilin değerlerini ezer.
        """
        s = cls()
        env = os.environ if env is None else env
        path = Path(cwd or os.getcwd()) / CONFIG_FILE
        data: dict = {}
        if path.is_file():
            try:
                data = tomllib.loads(path.read_text(encoding="utf-8"))
            except (OSError, tomllib.TOMLDecodeError) as exc:
                from .errors import ConfigError

                raise ConfigError(f"{path} okunamadı: {exc}") from exc
            data = dict(data.get("text2sql", data))  # [text2sql] tablosu da, düz anahtarlar da olur
            if "profil" in data:
                data["profile"] = data.pop("profil")
        from_env = {k: env[v] for k, v in _ENV.items() if env.get(v)}
        s.apply_profile(profile or from_env.get("profile") or data.get("profile") or DEFAULT_PROFILE)
        if data:
            s._apply({k: v for k, v in data.items() if k != "profile"})
            s.source.append(str(path))
        if from_env:
            s._apply({k: v for k, v in from_env.items() if k != "profile"})
            s.source.append("ortam değişkenleri")
        return s

    def apply_profile(self, name: str) -> None:
        name = (name or "").strip().lower()
        if name not in PROFILES:
            from .errors import ConfigError

            raise ConfigError(f"Bilinmeyen profil: {name!r}. Seçenekler: {', '.join(PROFILES)}")
        p = PROFILES[name]
        self.profile = name
        self.model, self.base_model = p["model"], p["base_model"]
        self.modelfile, self.gguf_path = p["modelfile"], p["gguf_path"]
        self.max_tokens = int(p.get("max_tokens", 512))

    def from_value(self) -> str:
        """Modelfile'daki FROM değeri: Ollama etiketi ya da yerel GGUF yolu."""
        if self.base_model:
            return self.base_model
        p = self.gguf_path.replace("\\", "/")
        return p if p.startswith(("/", "./", "../")) or ":" in p[:3] else "./" + p

    def _apply(self, data: dict) -> None:
        types = {f.name: f.type for f in fields(self)}
        for key, value in data.items():
            if key not in types or key == "source":
                continue
            current = getattr(self, key)
            try:
                if isinstance(current, bool):
                    value = str(value).lower() in ("1", "true", "evet", "yes")
                elif isinstance(current, int):
                    value = int(value)
                elif isinstance(current, float):
                    value = float(value)
                else:
                    value = str(value)
            except (TypeError, ValueError):
                from .errors import ConfigError

                raise ConfigError(f"Ayar değeri geçersiz: {key} = {value!r}") from None
            setattr(self, key, value)
        self.backend = normalize_backend(self.backend)
        self.ollama_host = normalize_host(self.ollama_host)

    def as_dict(self) -> dict:
        return {f.name: getattr(self, f.name) for f in fields(self) if f.name != "source"}


def render_modelfile(s: Settings, root: Path | None = None) -> str:
    """Profilin Modelfile'ını okur, FROM satırını ``s.from_value()`` ile değiştirir."""
    root = root or Path(__file__).resolve().parents[1]
    path = Path(s.modelfile) if Path(s.modelfile).is_absolute() else root / s.modelfile
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    done = False
    for i, line in enumerate(lines):
        if not done and line.upper().startswith("FROM "):
            lines[i] = f"FROM {s.from_value()}\n"
            done = True
        elif line.startswith("PARAMETER num_predict "):
            lines[i] = f"PARAMETER num_predict {s.max_tokens}\n"
    return "".join(lines)


def main(argv: list[str] | None = None) -> int:
    """``python -m text2sql.config [--profil ad] [anahtar]``: kurulum betikleri için tek değer yazar.

    Ek anahtarlar: ``from`` (Modelfile FROM değeri), ``gguf_source``, ``modelfile_text`` (FROM satırı
    profile göre değiştirilmiş Modelfile içeriği; kurulum betikleri bunu ``ollama create``e verir).
    """
    argv = list(sys.argv[1:] if argv is None else argv)
    profile = None
    if argv[:1] == ["--profil"]:
        if len(argv) < 2:
            print("--profil bir ad ister", file=sys.stderr)
            return 2
        profile, argv = argv[1], argv[2:]
    from .errors import ConfigError

    try:
        s = Settings.load(profile=profile)
    except ConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if argv[:1] == ["from"]:
        print(s.from_value())
        return 0
    if argv[:1] == ["modelfile_text"]:
        print(render_modelfile(s), end="")
        return 0
    if argv[:1] == ["gguf_source"]:
        print(PROFILES[s.profile]["gguf_source"])
        return 0
    if not argv:
        for k, v in s.as_dict().items():
            print(f"{k} = {v}")
        return 0
    key = argv[0]
    if key not in s.as_dict():
        print(f"Bilinmeyen ayar: {key}", file=sys.stderr)
        return 2
    print(getattr(s, key))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
