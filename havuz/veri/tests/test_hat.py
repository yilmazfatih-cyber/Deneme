"""Veri hattı: getiricinin robots/hız sınırı/yeniden deneme/önbellek davranışı (sahte aktarım ve
gerçek yerel sunucu), depolar ve kayıtlı TCMB yanıtlarıyla çevrimdışı örnek hat."""

from __future__ import annotations

import json
import threading
from collections.abc import Callable, Iterator
from contextlib import closing
from datetime import UTC, date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from verihavuzu.hat.examples import tcmb
from verihavuzu.hat.fetch import FetchConfig, Fetcher, FetchError, Response, RobotsDisallowedError
from verihavuzu.hat.pipeline import load_state, run_pipeline
from verihavuzu.hat.storage import CsvStore, JsonlStore, Store, open_store

FIXTURES = Path(__file__).parent / "fixtures" / "tcmb"
NOW = datetime(2026, 11, 16, 9, 0, tzinfo=UTC)


class FakeTransport:
    """Adres → yanıt listesi (sırayla tüketilir; son yanıt tekrarlanır) ya da işlev."""

    def __init__(
        self, routes: dict[str, list[Response | OSError] | Callable[[dict[str, str]], Response]]
    ) -> None:
        self.routes = routes
        self.calls: list[tuple[str, dict[str, str]]] = []

    def send(self, url: str, headers: dict[str, str], timeout: float) -> Response:
        self.calls.append((url, dict(headers)))
        route = self.routes.get(url)
        if route is None:
            return Response(url, 404, {}, b"yok")
        if callable(route):
            return route(headers)
        item = route.pop(0) if len(route) > 1 else route[0]
        if isinstance(item, OSError):
            raise item
        return item


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def time(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def _fetcher(
    transport: FakeTransport, clock: FakeClock, tmp_path: Path | None = None, **options: float
) -> Fetcher:
    config = FetchConfig(user_agent="test-araci/1.0", cache_dir=tmp_path, **options)  # type: ignore[arg-type]
    return Fetcher(config, transport, clock=clock.time, sleep=clock.sleep, now=lambda: NOW)


def ok(url: str, body: bytes = b"veri", **headers: str) -> Response:
    return Response(url, 200, {k.replace("_", "-"): v for k, v in headers.items()}, body)


ROBOTS_OK = [ok("https://ornek.test/robots.txt", b"User-agent: *\nDisallow: /gizli\n")]


def test_robots_rules_are_respected() -> None:
    transport = FakeTransport(
        {
            "https://ornek.test/robots.txt": list(ROBOTS_OK),
            "https://ornek.test/acik": [ok("https://ornek.test/acik")],
        }
    )
    fetcher = _fetcher(transport, FakeClock())
    assert fetcher.get("https://ornek.test/acik").status == 200
    with pytest.raises(RobotsDisallowedError):
        fetcher.get("https://ornek.test/gizli/dosya")
    # robots.txt 404 → her şeye izin; 5xx → hiçbir şeye izin yok (RFC 9309)
    missing = _fetcher(FakeTransport({"https://b.test/x": [ok("https://b.test/x")]}), FakeClock())
    assert missing.get("https://b.test/x").status == 200
    broken = FakeTransport(
        {"https://c.test/robots.txt": [Response("https://c.test/robots.txt", 503, {}, b"")]}
    )
    with pytest.raises(RobotsDisallowedError):
        _fetcher(broken, FakeClock(), max_retries=1, backoff_base=0.01).get("https://c.test/x")


def test_rate_limit_and_crawl_delay() -> None:
    robots: list[Response | OSError] = [
        ok("https://d.test/robots.txt", b"User-agent: *\nCrawl-delay: 5\n")
    ]
    transport = FakeTransport(
        {
            "https://d.test/robots.txt": robots,
            "https://d.test/a": [ok("a")],
            "https://d.test/b": [ok("b")],
        }
    )
    clock = FakeClock()
    fetcher = _fetcher(transport, clock, min_interval=1.0)
    fetcher.get("https://d.test/a")
    fetcher.get("https://d.test/b")
    assert clock.sleeps and all(abs(s - 5.0) < 1e-9 for s in clock.sleeps)  # crawl-delay kazanır


def test_retries_with_exponential_backoff_and_retry_after() -> None:
    url = "https://e.test/veri"
    responses: list[Response | OSError] = [
        Response(url, 503, {}, b""),
        OSError("bağlantı koptu"),
        Response(url, 429, {"retry-after": "30"}, b""),
        ok(url, b"sonunda"),
    ]
    transport = FakeTransport({url: responses})
    clock = FakeClock()
    fetcher = _fetcher(transport, clock, min_interval=0.0, backoff_base=1.0, backoff_max=60.0)
    assert fetcher.get(url).body == b"sonunda"
    assert len(clock.sleeps) == 3
    assert 0.5 <= clock.sleeps[0] <= 1.0 and 1.0 <= clock.sleeps[1] <= 2.0  # 1·2^k × [0,5; 1]
    assert clock.sleeps[2] == 30.0  # Retry-After üstel gecikmeden büyük olduğu için ona uyuldu
    failing = FakeTransport({url: [Response(url, 500, {}, b"")]})
    with pytest.raises(FetchError, match="yeniden denendi"):
        _fetcher(failing, FakeClock(), max_retries=2, min_interval=0.0).get(url)
    assert sum(call[0] == url for call in failing.calls) == 3
    not_found = FakeTransport({url: [Response(url, 404, {}, b"")]})
    assert _fetcher(not_found, FakeClock()).get(url).status == 404  # 4xx yeniden denenmez
    assert sum(call[0] == url for call in not_found.calls) == 1


def test_cache_and_conditional_requests(tmp_path: Path) -> None:
    url = "https://f.test/dosya.json"

    def server(headers: dict[str, str]) -> Response:
        if headers.get("If-None-Match") == '"v1"':
            return Response(url, 304, {"etag": '"v1"'}, b"")
        return Response(
            url, 200, {"etag": '"v1"', "last-modified": "Mon, 16 Nov 2026 08:00:00 GMT"}, b"[1, 2]"
        )

    transport = FakeTransport({url: server})
    fetcher = _fetcher(transport, FakeClock(), tmp_path)
    first = fetcher.get(url)
    second = fetcher.get(url)
    assert (first.body, first.from_cache) == (b"[1, 2]", False)
    assert (second.body, second.from_cache, second.status) == (b"[1, 2]", True, 200)
    sent = [headers for called, headers in transport.calls if called == url]
    assert sent[1]["If-None-Match"] == '"v1"'
    assert sent[1]["If-Modified-Since"] == "Mon, 16 Nov 2026 08:00:00 GMT"
    count = len(transport.calls)
    assert fetcher.get(url, max_age=3600).from_cache and len(transport.calls) == count  # istek yok


@pytest.fixture
def local_server(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    monkeypatch.setenv("no_proxy", "127.0.0.1,localhost")
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/robots.txt":
                body, status, extra = b"User-agent: *\nDisallow: /yasak\n", 200, {}
            elif self.headers.get("If-None-Match") == '"abc"':
                body, status, extra = b"", 304, {"ETag": '"abc"'}
            else:
                body, status, extra = "merhaba dünya".encode(), 200, {"ETag": '"abc"'}
            self.send_response(status)
            for key, value in extra.items():
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args: object) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)  # boş kapı
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


def test_real_http_server_round_trip(local_server: str, tmp_path: Path) -> None:
    fetcher = Fetcher(FetchConfig(user_agent="test/1.0", cache_dir=tmp_path, min_interval=0.0))
    assert fetcher.get(local_server + "/veri").text() == "merhaba dünya"
    again = fetcher.get(local_server + "/veri")
    assert again.from_cache and again.text() == "merhaba dünya"
    with pytest.raises(RobotsDisallowedError):
        fetcher.get(local_server + "/yasak/x")


# --- depolar --------------------------------------------------------------------------------


@pytest.mark.parametrize("kind", ["jsonl", "csv", "sqlite", "duckdb"])
def test_stores_upsert_idempotently(kind: str, tmp_path: Path) -> None:
    if kind == "duckdb":
        pytest.importorskip("duckdb")
    path = tmp_path / ("depo.db" if kind in ("sqlite", "duckdb") else "depo")
    with closing(open_store(kind, path)) as store:
        _exercise_store(store, tmp_path)


def _exercise_store(store: Store, tmp_path: Path) -> None:
    rows = [
        {"tarih": "2026-11-12", "kod": "USD", "deger": 1.5},
        {"tarih": "2026-11-12", "kod": "EUR", "deger": 2.0},
    ]
    first = store.upsert("kurlar", rows, ["tarih", "kod"])
    second = store.upsert("kurlar", rows, ["tarih", "kod"])
    third = store.upsert(
        "kurlar",
        [dict(rows[0], deger=1.75), {"tarih": "2026-11-13", "kod": "USD", "deger": 1.6}],
        ["tarih", "kod"],
    )
    assert (first.eklenen, second.degismeyen) == (2, 2)
    assert (third.eklenen, third.guncellenen) == (1, 1)
    stored = {(str(r["tarih"]), str(r["kod"])): float(r["deger"]) for r in store.read("kurlar")}
    assert stored == {
        ("2026-11-12", "USD"): 1.75,
        ("2026-11-12", "EUR"): 2.0,
        ("2026-11-13", "USD"): 1.6,
    }
    with pytest.raises(ValueError, match="Geçersiz"):
        store.upsert("kurlar; DROP TABLE x", rows, ["kod"])
    assert (
        isinstance(JsonlStore(tmp_path).read("yok"), list) and CsvStore(tmp_path).read("yok") == []
    )


# --- TCMB örnek hattı (kayıtlı yanıtlar, çevrimdışı) --------------------------------------------


def _tcmb_transport(overrides: dict[str, bytes] | None = None) -> FakeTransport:
    routes: dict[str, list[Response | OSError] | Callable[[dict[str, str]], Response]] = {
        "https://www.tcmb.gov.tr/robots.txt": [ok("robots", (FIXTURES / "robots.txt").read_bytes())]
    }
    for name in ("12112026", "13112026"):
        day = datetime.strptime(name, "%d%m%Y").date()
        body = (overrides or {}).get(name, (FIXTURES / f"{name}.xml").read_bytes())
        routes[tcmb.bulletin_url(day)] = [ok(tcmb.bulletin_url(day), body)]
    not_found = (FIXTURES / "404.html").read_bytes()
    for day in (date(2026, 11, 16), date(2026, 10, 29)):
        routes[tcmb.bulletin_url(day)] = [Response(tcmb.bulletin_url(day), 404, {}, not_found)]
    return FakeTransport(routes)


def test_tcmb_pipeline_is_idempotent_and_incremental(
    tmp_path: Path, request: pytest.FixtureRequest
) -> None:
    transport = _tcmb_transport()
    fetcher = _fetcher(transport, FakeClock())
    store = open_store("sqlite", tmp_path / "kurlar.sqlite")
    request.addfinalizer(store.close)
    params = {"baslangic": date(2026, 11, 12), "bitis": date(2026, 11, 15)}
    first = run_pipeline(tcmb.SPEC, store, fetcher, tmp_path, params=params, now=lambda: NOW)
    assert (first.durum, first.cekilen, first.eklenen, first.karantina) == ("basarili", 44, 44, 0)
    assert not any(
        "14112026" in url or "15112026" in url for url, _ in transport.calls
    )  # hafta sonu
    rows = {(r["tarih"], r["kod"]): r for r in store.read("tcmb_kurlari")}
    usd = rows[("2026-11-13", "USD")]
    assert (usd["doviz_alis"], usd["doviz_satis"], usd["birim"]) == ("50.1926", "50.2830", 1)
    assert rows[("2026-11-13", "JPY")]["birim"] == 100
    second = run_pipeline(tcmb.SPEC, store, fetcher, tmp_path, params=params, now=lambda: NOW)
    assert (second.eklenen, second.guncellenen, second.degismeyen) == (0, 0, 44)
    assert load_state(tmp_path, "tcmb_kurlari") == {"son_tarih": "2026-11-15"}
    third = run_pipeline(
        tcmb.SPEC, store, fetcher, tmp_path, params={"bitis": date(2026, 11, 16)}, now=lambda: NOW
    )
    assert third.cekilen == 0 and "bülten yok" in third.iletiler[0]  # yalnız 16 Kasım istendi
    log = [
        json.loads(line)
        for line in (tmp_path / "hat_gunlugu.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert [entry["durum"] for entry in log] == ["basarili", "basarili", "basarili"]


def test_tcmb_bad_records_go_to_quarantine(tmp_path: Path) -> None:
    good = (FIXTURES / "13112026.xml").read_bytes()
    bad = good.replace(
        b"<ForexBuying>50.1926</ForexBuying>", b"<ForexBuying>bozuk</ForexBuying>", 1
    )
    assert bad != good
    fetcher = _fetcher(_tcmb_transport({"13112026": bad}), FakeClock())
    store = open_store("jsonl", tmp_path / "depo")
    params = {"baslangic": date(2026, 11, 13), "bitis": date(2026, 11, 13)}
    record = run_pipeline(tcmb.SPEC, store, fetcher, tmp_path, params=params, now=lambda: NOW)
    assert (record.durum, record.gecerli, record.karantina) == ("karantinali", 21, 1)
    quarantine = (tmp_path / "karantina" / "tcmb_kurlari" / f"{record.kosu_id}.jsonl").read_text(
        encoding="utf-8"
    )
    item = json.loads(quarantine)
    assert (
        item["kayit"]["kod"] == "USD"
        and "doviz_alis pozitif bir sayı olmalı" in item["sorunlar"][0]
    )


def test_tcmb_rejects_xml_with_doctype() -> None:
    with pytest.raises(ValueError, match="güvenlik"):
        tcmb._parse(
            b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><Tarih_Date/>', date(2026, 1, 1)
        )


def test_failed_run_is_logged_and_state_not_advanced(tmp_path: Path) -> None:
    url = tcmb.bulletin_url(date(2026, 11, 12))
    transport = _tcmb_transport()
    transport.routes[url] = [Response(url, 500, {}, b"")]
    fetcher = _fetcher(transport, FakeClock(), max_retries=1, backoff_base=0.01)
    store = open_store("jsonl", tmp_path / "depo")
    params = {"baslangic": date(2026, 11, 12), "bitis": date(2026, 11, 13)}
    with pytest.raises(FetchError):
        run_pipeline(tcmb.SPEC, store, fetcher, tmp_path, params=params, now=lambda: NOW)
    assert load_state(tmp_path, "tcmb_kurlari") == {}
    entry = json.loads((tmp_path / "hat_gunlugu.jsonl").read_text(encoding="utf-8"))
    assert entry["durum"] == "hata" and "FetchError" in entry["hata"]
