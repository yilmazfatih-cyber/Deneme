"""web_catisi testlerinin paylaştığı küçük gösterim uygulaması (tests/ kökünde: importlib kipinde
alt klasörler içe aktarılamaz)."""

from __future__ import annotations

from pathlib import Path

from web_catisi import App, Request, Response, abort, render, safe_redirect_target
from web_catisi.testing import TestClient, extract_csrf

KEY = b"t" * 32


class Clock:
    def __init__(self) -> None:
        self.now = 1_700_000_000.0

    def __call__(self) -> float:
        return self.now


def make_app(clock: Clock | None = None, static: Path | None = None) -> App:
    app = App([KEY], clock=clock or Clock(), max_body=64 * 1024)
    if static is not None:
        app.static("/statik", static)

    @app.route("/")
    def index(request: Request) -> str:
        return "ana sayfa"

    @app.route("/kullanici/<int:id>", name="kullanici")
    def user(request: Request, id: int) -> Response:
        return Response.json({"id": id})

    @app.route("/dosya/<path:yol>", name="dosya")
    def file_path(request: Request, yol: str) -> Response:
        return Response.json({"yol": yol})

    @app.route("/ara")
    def search(request: Request) -> str:
        return render("<p>Aranan: {q}</p>", q=request.query.get("q", ""))

    @app.route("/form", methods=("GET", "POST"))
    def form(request: Request) -> Response | str:
        assert request.session is not None
        if request.method == "GET":
            return render(
                '<form method="post"><input type="hidden" name="_csrf" value="{t}"></form>',
                t=request.session.csrf_token,
            )
        return Response.json(request.form.to_dict())

    @app.route("/yukle", methods=("POST",))
    def upload(request: Request) -> Response:
        uploaded = request.files["dosya"][0]
        info = {
            "ad": uploaded.filename,
            "boyut": uploaded.size,
            "baslik": request.form.get("baslik"),
        }
        return Response.json(info)

    @app.route("/json", methods=("POST",))
    def echo_json(request: Request) -> Response:
        return Response.json(request.json())

    @app.route("/hata")
    def boom(request: Request) -> str:
        raise RuntimeError("gizli-veritabani-ayrintisi")

    @app.route("/yok")
    def missing(request: Request) -> str:
        abort(404)

    @app.route("/giris", methods=("POST",))
    def login(request: Request) -> Response:
        assert request.session is not None
        request.session.regenerate()
        request.session["uid"] = 1
        request.session.flash("Hoş geldiniz!")
        return Response.redirect(safe_redirect_target(request.form.get("sonra")))

    @app.route("/ben")
    def me(request: Request) -> Response:
        assert request.session is not None
        return Response.json(
            {"uid": request.session.get("uid"), "flas": request.session.pop_flashes()}
        )

    return app


def csrf(client: TestClient) -> str:
    return extract_csrf(client.get("/form").text)
