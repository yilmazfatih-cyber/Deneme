import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from text2sql.backends import FakeBackend, OllamaBackend, make_backend
from text2sql.config import PROFILES, Settings, normalize_host, render_modelfile
from text2sql.config import main as config_main
from text2sql.errors import BackendError, ConfigError
from text2sql.hardware import parse_nvidia_smi, recommend


def test_defaults_and_env(tmp_path):
    s = Settings.load(cwd=tmp_path, env={})
    assert s.profile == "qwen" and s.model == "text2sql" and s.base_model == "qwen2.5-coder:1.5b"
    assert s.backend == "ollama" and s.sample_rows == 2 and s.retries == 1 and s.limit == 200
    s = Settings.load(cwd=tmp_path, env={"TEXT2SQL_MODEL": "benim", "OLLAMA_HOST": "0.0.0.0", "TEXT2SQL_BACKEND": "fake"})
    assert s.model == "benim" and s.ollama_host == "http://127.0.0.1:11434" and s.backend == "sahte"


def test_toml_then_env_then_cli_profile(tmp_path):
    (tmp_path / "text2sql.toml").write_text('profil = "prem"\nnum_ctx = 8192\nmodel = "toml-model"\n', encoding="utf-8")
    s = Settings.load(cwd=tmp_path, env={})
    assert s.profile == "prem" and s.num_ctx == 8192 and s.model == "toml-model" and s.modelfile == "Modelfile.prem"
    s = Settings.load(cwd=tmp_path, env={"TEXT2SQL_PROFIL": "slm-sql"})
    assert s.profile == "slm-sql" and s.model == "toml-model"
    s = Settings.load(cwd=tmp_path, env={"TEXT2SQL_PROFIL": "qwen", "TEXT2SQL_BASE_MODEL": "hf.co/x/y:Q4_K_M"}, profile="buyuk")
    assert s.profile == "buyuk" and s.base_model == "hf.co/x/y:Q4_K_M"  # tek anahtarlar profili ezer
    assert s.from_value() == "hf.co/x/y:Q4_K_M"
    (tmp_path / "text2sql.toml").unlink()
    assert Settings.load(cwd=tmp_path, env={}, profile="slm-sql").model == PROFILES["slm-sql"]["model"]
    with pytest.raises(ConfigError):
        Settings.load(cwd=tmp_path, env={}, profile="yok")


def test_bad_toml(tmp_path):
    (tmp_path / "text2sql.toml").write_text("num_ctx = 'çok'\n", encoding="utf-8")
    with pytest.raises(ConfigError):
        Settings.load(cwd=tmp_path, env={})


def test_profiles_are_complete_and_render():
    for name, p in PROFILES.items():
        assert {"model", "base_model", "modelfile", "gguf_path", "gguf_source", "license", "note"} <= set(p), name
        s = Settings()
        s.apply_profile(name)
        text = render_modelfile(s)
        from_line = next(line for line in text.splitlines() if line.startswith("FROM "))
        assert from_line == f"FROM {s.from_value()}"
    s = Settings()
    s.apply_profile("prem")
    assert s.from_value() == "./models/prem-1B-SQL.Q4_K_M.gguf" and s.max_tokens == 512
    s.apply_profile("buyuk")
    assert s.max_tokens == 2048 and "PARAMETER num_predict 2048" in render_modelfile(s)
    assert "tek çağrı" in PROFILES["slm-sql"]["note"]


def test_config_cli(capsys):
    assert config_main(["base_model"]) == 0
    assert capsys.readouterr().out.strip() == "qwen2.5-coder:1.5b"
    assert config_main(["--profil", "slm-sql", "from"]) == 0
    assert capsys.readouterr().out.strip() == "hf.co/frizynn/SLM-SQL-1.5B-GGUF:Q4_K_M"
    assert config_main(["yok"]) == 2


def test_normalize_host():
    assert normalize_host("localhost") == "http://localhost:11434"
    assert normalize_host("http://10.0.0.5:8080/") == "http://10.0.0.5:8080"
    assert normalize_host("[::1]:11434") == "http://[::1]:11434"


def test_hardware_parsing_and_recommend():
    gpus = parse_nvidia_smi("NVIDIA GeForce RTX 3060, 12288 MiB\nNVIDIA GeForce GTX 1650, 4096 MiB\n")
    assert [g.vram_mib for g in gpus] == [12288, 4096] and gpus[0].name == "NVIDIA GeForce RTX 3060"
    assert recommend(None).tag == "qwen2.5-coder:1.5b"
    assert recommend(2048).tag == "qwen2.5-coder:1.5b"
    assert "q8_0" in recommend(4096).tag
    assert "fp16" in recommend(8192).tag
    assert recommend(12288).profile == "buyuk"


def test_make_backend_variants():
    s = Settings()
    s.backend = "sahte"
    assert isinstance(make_backend(s), FakeBackend)
    s.backend = "llamacpp"
    s.gguf_path = "yok/model.gguf"
    with pytest.raises(ConfigError, match="bulunamadı"):
        make_backend(s)


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/version":
            self._send(200, {"version": "0.test"})
        elif self.path == "/api/tags":
            self._send(200, {"models": [{"name": "text2sql:latest"}, {"name": "qwen2.5-coder:1.5b"}]})

    def do_POST(self):
        if self.path == "/kes":  # yanıt vermeden bağlantıyı kapat
            self.close_connection = True
            return
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.requests.append(req)
        if req["model"] != "text2sql":
            self._send(404, {"error": f"model '{req['model']}' not found"})
        else:
            self._send(200, {"message": {"role": "assistant", "content": "```sql\nSELECT 1;\n```"}})


@pytest.fixture
def fake_ollama():
    srv = HTTPServer(("127.0.0.1", 0), _Handler)
    srv.requests = []
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    yield srv
    srv.shutdown()


def test_ollama_backend_against_local_fake_server(fake_ollama):
    host = f"http://127.0.0.1:{fake_ollama.server_port}"
    ob = OllamaBackend("text2sql", host, timeout=5, num_ctx=4096)
    assert ob.version() == "0.test"
    names = ob.list_models()
    assert OllamaBackend.has_model(names, "text2sql") and OllamaBackend.has_model(names, "qwen2.5-coder:1.5b")
    assert not OllamaBackend.has_model(names, "text2sql-slm")
    assert ob.chat([{"role": "user", "content": "x"}]) == "```sql\nSELECT 1;\n```"
    req = fake_ollama.requests[-1]
    assert req["stream"] is False and req["options"]["temperature"] == 0 and req["options"]["num_ctx"] == 4096
    with pytest.raises(BackendError, match="kur.sh --profil slm-sql") as exc:
        OllamaBackend("yok", host, timeout=5, profile="slm-sql").chat([{"role": "user", "content": "x"}])
    assert "ollama create yok -f .Modelfile.olusan" in str(exc.value)
    with pytest.raises(BackendError, match="bağlantıyı yanıt vermeden kesti"):
        ob._request("/kes", {"x": 1})


def test_ollama_backend_server_down():
    ob = OllamaBackend("text2sql", "http://127.0.0.1:9", timeout=2)
    assert ob.version() is None
    with pytest.raises(BackendError, match="ollama serve"):
        ob.chat([{"role": "user", "content": "x"}])
