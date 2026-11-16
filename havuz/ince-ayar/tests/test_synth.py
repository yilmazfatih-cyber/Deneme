"""Sentetik veri hattı: sahte OpenAI uyumlu uç nokta ile süzgeçler, kaynak kaydı, tohumlar, lisans."""

from __future__ import annotations

import json
import threading
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import httpx
import pytest

from ince_ayar.errors import UserError
from ince_ayar.synth.client import TeacherClient
from ince_ayar.synth.config import FilterSection, SynthConfig, TeacherSection
from ince_ayar.synth.langid import looks_turkish, turkish_score
from ince_ayar.synth.license import check_teacher_license
from ince_ayar.synth.pipeline import run_pipeline, side_paths
from ince_ayar.synth.recipes import extract_json, load_prompt

GOOD = [
    {"talimat": "Kargom kaç günde gelir?", "yanit": "Siparişler üç iş günü içinde teslim edilir."},
    {
        "talimat": "Kargo ücreti ne kadar?",
        "yanit": "Beş yüz lira üzeri siparişlerde kargo ücretsizdir.",
    },
    {"talimat": "How long is shipping?", "yanit": "Shipping takes three days."},
    {"talimat": "Bana yardım eder misin?", "yanit": "Üzgünüm, bu konuda yardımcı olamam."},
    {"talimat": "Kargom kaç günde gelir?", "yanit": "Üç iş günü içinde gelir."},
]


def _reply(content: str) -> dict[str, Any]:
    return {"choices": [{"message": {"role": "assistant", "content": content}}]}


class FakeTeacher:
    """İstekleri kaydeden sahte uç nokta: 2. tohum bozuk JSON, diğerleri <think> + çitli JSON döner."""

    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.requests.append(body)
        if "iade" in body["messages"][0]["content"]:
            return httpx.Response(200, json=_reply("Elbette! İşte örnekler: {bozuk"))
        text = (
            "<think>düşünüyorum</think>\n```json\n"
            + json.dumps({"ornekler": GOOD}, ensure_ascii=False)
            + "\n```"
        )
        return httpx.Response(200, json=_reply(text))


def _config(tmp_path: Path, **teacher: Any) -> SynthConfig:
    seeds = tmp_path / "tohumlar.jsonl"
    seeds.write_text(
        '{"kimlik": "kargo", "konu": "Kargo", "belge": "Teslim üç iş günüdür."}\n'
        '{"kimlik": "iade", "konu": "iade", "belge": "İade on dört gündür."}\n'
        '{"kimlik": "odeme", "konu": "Ödeme", "belge": "Kredi kartı geçerlidir."}\n',
        encoding="utf-8",
    )
    settings = {
        "uc_nokta": "http://ogretmen.yerel:11434/v1",
        "model": "sahte:1b",
        "lisans": "apache-2.0",
        **teacher,
    }
    return SynthConfig(
        tarif="talimat",
        ogretmen=TeacherSection(**settings),
        girdi=str(seeds),
        cikti=str(tmp_path / "uretilen.jsonl"),
        tohum=100,
        suzgec=FilterSection(),
    )


def _client(fake: FakeTeacher) -> TeacherClient:
    return TeacherClient(
        "http://ogretmen.yerel:11434/v1", "sahte:1b", transport=httpx.MockTransport(fake)
    )


def test_hat_suzer_ve_kaynak_kaydi_yazar(tmp_path: Path) -> None:
    config, fake = _config(tmp_path), FakeTeacher()
    stats = run_pipeline(config, _client(fake), today=lambda: date(2026, 11, 16))
    assert [r["seed"] for r in fake.requests] == [100, 101, 102]
    assert all(r["model"] == "sahte:1b" and r["temperature"] == 0.7 for r in fake.requests)
    rows = [
        json.loads(line) for line in Path(config.cikti).read_text(encoding="utf-8").splitlines()
    ]
    # tohum başına 2 kabul: İngilizce, ret ve yineleme ayıklanır; 2. tohum bozuk JSON
    assert stats.accepted == 2 and len(rows) == 2
    assert stats.rejected == {"bicim": 1, "dil": 2, "ret_yaniti": 2, "yineleme": 4}
    first = rows[0]
    assert first["messages"][-1] == {"role": "assistant", "content": GOOD[0]["yanit"]}
    assert first["grup"] == "kargo"
    assert first["kaynak"] == {
        "tur": "sentetik",
        "tarif": "talimat",
        "ogretmen_model": "sahte:1b",
        "ogretmen_lisansi": "apache-2.0",
        "uc_nokta": "ogretmen.yerel:11434",
        "istem_surumu": "talimat-v1",
        "istem_ozeti": load_prompt("talimat").digest,
        "tohum": 100,
        "sicaklik": 0.7,
        "tohum_kimligi": "kargo",
        "sira": 0,
        "tarih": "2026-11-16",
    }
    rejected_path, record_path = side_paths(Path(config.cikti))
    reasons = [
        json.loads(line)["neden"] for line in rejected_path.read_text(encoding="utf-8").splitlines()
    ]
    assert sorted(set(reasons)) == ["bicim", "dil", "ret_yaniti", "yineleme"]
    assert json.loads(record_path.read_text(encoding="utf-8"))["sonuc"]["kabul"] == 2


def test_uretilen_veri_dogrulayicidan_gecer(tmp_path: Path) -> None:
    from ince_ayar.data.validate import load_chat

    config = _config(tmp_path)
    run_pipeline(config, _client(FakeTeacher()))
    loaded = load_chat(Path(config.cikti), group_field="grup")
    assert not loaded.errors and {row.group for row in loaded.rows} == {"kargo"}


def test_devam_tamamlanan_tohumlari_atlar(tmp_path: Path) -> None:
    config, fake = _config(tmp_path), FakeTeacher()
    run_pipeline(config, _client(fake), limit=1)
    resumed = run_pipeline(config, _client(fake), resume=True)
    assert resumed.skipped_seeds == 1 and [r["seed"] for r in fake.requests] == [100, 101, 102]
    lines = Path(config.cikti).read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2  # "odeme" tohumunun yanıtları önceki koşunun yinelemesi sayıldı


def test_mevcut_veriyle_ayni_adaylar_atilir(tmp_path: Path) -> None:
    held_out = tmp_path / "test.jsonl"
    held_out.write_text(
        json.dumps(
            {
                "messages": [
                    {"role": "user", "content": "Kargom kaç günde gelir?"},
                    {"role": "assistant", "content": "x"},
                ]
            },
            ensure_ascii=False,
        )
    )
    config = _config(tmp_path)
    config.suzgec.mevcut_veri = [str(held_out)]
    stats = run_pipeline(config, _client(FakeTeacher()), limit=1)
    assert stats.rejected["mevcut_veriyle_ayni"] == 2


def test_istemci_yeniden_dener_sonra_vazgecer() -> None:
    calls = {"n": 0}

    def flaky(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503) if calls["n"] < 3 else httpx.Response(200, json=_reply("tamam"))

    waits: list[float] = []
    client = TeacherClient(
        "http://x/v1", "m", retries=3, transport=httpx.MockTransport(flaky), sleep=waits.append
    )
    assert client.complete([{"role": "user", "content": "a"}], 0.0, 8, 1) == "tamam"
    assert waits == [2.0, 4.0]

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("bağlantı reddedildi")

    dead = TeacherClient(
        "http://x/v1", "m", retries=1, transport=httpx.MockTransport(down), sleep=lambda _: None
    )
    with pytest.raises(UserError, match="ulaşılamadı.*2 deneme"):
        dead.complete([{"role": "user", "content": "a"}], 0.0, 8, 1)
    bad = TeacherClient(
        "http://x/v1",
        "m",
        transport=httpx.MockTransport(lambda r: httpx.Response(404, text="model yok")),
    )
    with pytest.raises(UserError, match="HTTP 404"):
        bad.complete([{"role": "user", "content": "a"}], 0.0, 8, 1)


def test_gercek_yerel_sunucuyla_http_yolu() -> None:
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            length = int(self.headers["Content-Length"])
            body = json.loads(self.rfile.read(length))
            payload = json.dumps(_reply(f"tohum={body['seed']}")).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args: Any) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with TeacherClient(
            f"http://127.0.0.1:{server.server_address[1]}/v1", "m", timeout=10
        ) as client:
            assert client.complete([{"role": "user", "content": "a"}], 0.0, 8, 7) == "tohum=7"
    finally:
        server.shutdown()
        server.server_close()


def test_lisans_denetimi() -> None:
    with pytest.raises(UserError, match="ticari kullanıma kapalı"):
        check_teacher_license(TeacherSection(uc_nokta="u", model="m", lisans="cc-by-nc-4.0"))
    approved = TeacherSection(
        uc_nokta="u", model="m", lisans="cc-by-nc-4.0", ticari_olmayan_kullanim=True
    )
    assert "Ticari olmayan kullanım onaylandı" in check_teacher_license(approved)[0]
    assert (
        "koşullu"
        in check_teacher_license(TeacherSection(uc_nokta="u", model="m", lisans="llama3.2"))[0]
    )
    assert check_teacher_license(TeacherSection(uc_nokta="u", model="m", lisans="apache-2.0")) == []


def test_json_cikarma_ve_dil_sezgisi() -> None:
    assert extract_json('Önsöz {"a": 1} sonsöz') == {"a": 1}
    assert extract_json('<think>x</think>```json\n{"b": [1]}\n```') == {"b": [1]}
    assert looks_turkish("Kargonuz üç iş günü içinde teslim edilir.")
    assert looks_turkish("Kargom ne zaman gelir?")
    assert not looks_turkish("Your order will arrive in three days.")
    assert turkish_score("") == 0.0
