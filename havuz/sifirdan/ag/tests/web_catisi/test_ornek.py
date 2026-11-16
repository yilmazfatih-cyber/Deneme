"""Örnek not defteri: uçtan uca akışlar (test istemcisi) ve gerçek sunucular üzerinden tam yığın.

Tam yığın: http_istemci (çerez kavanozuyla) → http_sunucu ya da wsgiref → web_catisi → orm (SQLite).
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Iterator
from wsgiref.simple_server import WSGIRequestHandler, make_server

import pytest
from web_demo import Clock

from destek import HOST, BackgroundLoop
from http_istemci import Client
from http_sunucu import HttpServer
from orm import Database
from web_catisi import App
from web_catisi.adapters import http_handler, wsgi_app
from web_catisi.ornek import Kullanici, Not, create_app
from web_catisi.testing import TestClient, TestResponse, extract_csrf


@pytest.fixture
def ornek() -> Iterator[tuple[Database, Clock, App]]:
    db = Database()
    db.migrate([Kullanici, Not])
    clock = Clock()
    yield db, clock, create_app(db, [b"o" * 32], password_cost=2**10, clock=clock)
    db.close()


def submit(client: TestClient, form_page: str, action: str, **fields: str) -> TestResponse:
    token = extract_csrf(client.get(form_page).text)
    return client.post(action, data={"_csrf": token, **fields})


def register(client: TestClient, name: str = "ayşe", password: str = "parola-123") -> TestResponse:
    return submit(client, "/kayit", "/kayit", ad=name, parola=password)


def login(client: TestClient, name: str, password: str, sonra: str = "") -> TestResponse:
    return submit(client, "/giris", "/giris", ad=name, parola=password, sonra=sonra)


def test_kayit_not_ekleme_ve_xss_kacisi(ornek: tuple[Database, Clock, App]) -> None:
    client = TestClient(ornek[2])
    response = register(client)
    assert (response.status, response.location) == (303, "/notlar")
    assert "Hesabınız açıldı" in client.get("/notlar").text
    title, text = '<script>alert("x")</script>', "<img src=x onerror=alert(1)>"
    added = submit(client, "/notlar", "/notlar", baslik=title, metin=text)
    assert added.location == "/notlar"
    listing = client.get("/notlar").text
    assert "<script>" not in listing
    assert "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;" in listing
    detail = client.get("/notlar/1")
    assert detail.status == 200
    assert "<img" not in detail.text and "&lt;img src=x onerror=alert(1)&gt;" in detail.text
    assert detail.headers.get("cache-control") == "no-store"


def test_baskasinin_notu_gorulemez_silinemez(ornek: tuple[Database, Clock, App]) -> None:
    db, _, app = ornek
    owner, other = TestClient(app), TestClient(app)
    register(owner, "sahip")
    submit(owner, "/notlar", "/notlar", baslik="gizli plan")
    register(other, "komsu")
    assert other.get("/notlar/1").status == 404
    assert submit(other, "/notlar", "/notlar/1/sil").status == 404
    assert db.query(Not).count() == 1
    assert submit(owner, "/notlar/1", "/notlar/1/sil").location == "/notlar"
    assert db.query(Not).count() == 0


def test_giris_hatalari_ve_deneme_siniri(ornek: tuple[Database, Clock, App]) -> None:
    _, clock, app = ornek
    register(TestClient(app), "mehmet", "dogru-parola")
    client = TestClient(app)
    wrong = login(client, "mehmet", "yanlis-parola")
    unknown = login(client, "olmayan", "yanlis-parola")
    assert wrong.status == unknown.status == 400
    assert "Kullanıcı adı ya da parola hatalı." in wrong.text and "hatalı" in unknown.text
    for _ in range(4):
        login(client, "mehmet", "yanlis-parola")
    blocked = login(client, "mehmet", "dogru-parola")  # doğru parola bile beklemeli
    assert "Çok fazla deneme" in blocked.text
    clock.now += 901
    assert login(client, "mehmet", "dogru-parola").location == "/notlar"


def test_cikis_eski_cerezleri_gecersiz_kilar(ornek: tuple[Database, Clock, App]) -> None:
    app = ornek[2]
    client = TestClient(app)
    register(client)
    stolen = dict(client.cookies)  # ör. başka bir cihazda kalmış çerez
    assert submit(client, "/notlar", "/cikis").location == "/"
    thief = TestClient(app)
    thief.cookies.update(stolen)
    response = thief.get("/notlar")
    assert (response.status, response.location) == (303, "/giris?sonra=/notlar")


def test_oturum_sabitleme_ve_acik_yonlendirme(ornek: tuple[Database, Clock, App]) -> None:
    app = ornek[2]
    register(TestClient(app), "zeynep", "zeynep-parola")
    client = TestClient(app)
    client.get("/giris")
    planted = client.cookies["oturum"]
    assert (
        login(client, "zeynep", "zeynep-parola", sonra="//kotu.site/yakala").location == "/notlar"
    )
    assert client.cookies["oturum"] != planted
    assert login(client, "zeynep", "zeynep-parola", sonra="/notlar/7").location == "/notlar/7"


def test_kullanici_adi_turkce_kurallar(ornek: tuple[Database, Clock, App]) -> None:
    db, _, app = ornek
    assert register(TestClient(app), "AYŞE IŞIK".replace(" ", "_")).status == 303
    assert db.query(Kullanici).filter(ad="ayşe_ışık").exists()  # Türkçe küçültme (I → ı)
    duplicate = register(TestClient(app), "ayşe_ışık")
    assert duplicate.status == 400 and "alınmış" in duplicate.text
    assert login(TestClient(app), "Ayşe_Işık", "parola-123").location == "/notlar"
    assert "3–32 karakter" in register(TestClient(app), "a").text
    assert "en az 8" in register(TestClient(app), "kisa_parola", "1234").text


def test_dosyadan_not_ekleme(ornek: tuple[Database, Clock, App]) -> None:
    db, _, app = ornek
    client = TestClient(app)
    register(client)

    def upload(name: str, data: bytes) -> TestResponse:
        token = extract_csrf(client.get("/notlar").text)
        files = {"dosya": (name, data, "text/plain")}
        return client.post("/notlar/yukle", data={"_csrf": token}, files=files)

    assert upload("alışveriş listesi.txt", "süt\nekmek\n".encode()).location == "/notlar"
    note = db.query(Not).first()
    assert note is not None and (note.baslik, note.metin) == ("alışveriş listesi", "süt\nekmek\n")
    for name, data in [
        ("program.exe", b"MZ"),
        ("bozuk.txt", b"\xff\xfe\x00"),
        ("dev.txt", b"a" * 70000),
    ]:
        response = upload(name, data)
        assert response.status == 400 and "64 KB" in response.text
    assert db.query(Not).count() == 1


def test_csrf_olmadan_islem_yapilamaz(ornek: tuple[Database, Clock, App]) -> None:
    client = TestClient(ornek[2])
    register(client)
    assert client.post("/notlar", data={"baslik": "csrf yok"}).status == 403
    assert client.post("/cikis").status == 403


class _QuietHandler(WSGIRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return


def full_stack_flow(base: str) -> None:
    """Gerçek HTTP üzerinden kayıt → not ekle → listede gör (çerezler istemcinin kavanozunda)."""
    with Client(timeout=10) as client:
        token = extract_csrf(client.get(base + "/kayit").text())
        page = client.post(
            base + "/kayit", data={"_csrf": token, "ad": "ağ_kullanicisi", "parola": "parola-123"}
        )
        assert page.status == 200 and "Notlarım" in page.text()
        assert [r.status for r in page.history] == [303]
        token = extract_csrf(page.text())
        listing = client.post(base + "/notlar", data={"_csrf": token, "baslik": "Ağdan gelen not"})
        assert "Ağdan gelen not" in listing.text()
        assert (
            client.get(base + "/statik/stil.css").headers.get("content-type")
            == "text/css; charset=utf-8"
        )
        assert client.head(base + "/").read() == b""


def run_full_stack(serve: Callable[[App], tuple[str, Callable[[], None]]]) -> None:
    db = Database()
    db.migrate([Kullanici, Not])
    base, stop = serve(create_app(db, [b"y" * 32], password_cost=2**10))
    try:
        full_stack_flow(base)
    finally:
        stop()
        db.close()


def test_tam_yigin_http_sunucu_ile(loop_thread: BackgroundLoop) -> None:
    def serve(app: App) -> tuple[str, Callable[[], None]]:
        server = HttpServer(http_handler(app))
        loop_thread.run(server.start())
        return f"http://{HOST}:{server.port}", lambda: loop_thread.run(server.close(grace=1))

    run_full_stack(serve)


def test_tam_yigin_wsgiref_ile() -> None:
    def serve(app: App) -> tuple[str, Callable[[], None]]:
        server = make_server(HOST, 0, wsgi_app(app), handler_class=_QuietHandler)
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05})
        thread.start()

        def stop() -> None:
            server.shutdown()
            server.server_close()
            thread.join(5)

        return f"http://{HOST}:{server.server_port}", stop

    run_full_stack(serve)
