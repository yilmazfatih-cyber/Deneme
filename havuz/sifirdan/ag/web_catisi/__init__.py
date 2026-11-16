"""web_catisi — WSGI ve http_sunucu ile çalışan küçük web çatısı.

    from web_catisi import App, Request, Response, render
    app = App(secret_keys=[secrets.token_bytes(32)])

    @app.route("/merhaba/<str:ad>")
    def merhaba(istek: Request, ad: str) -> str:
        return render("<p>Merhaba {ad}!</p>", ad=ad)  # kaçışlı

Genişletme: yeni bir dışa açık ad eklerseniz `__all__` listesine de yazın.
"""

from web_catisi.adapters import http_handler, wsgi_app
from web_catisi.app import App
from web_catisi.datastructures import MultiDict
from web_catisi.errors import HttpStatusError, abort
from web_catisi.multipart import UploadedFile
from web_catisi.request import Request
from web_catisi.response import Response, safe_redirect_target
from web_catisi.security import hash_password, verify_password
from web_catisi.sessions import Session, SessionSigner
from web_catisi.templates import Markup, escape, render, render_each, safe_url

__all__ = [
    "App",
    "HttpStatusError",
    "Markup",
    "MultiDict",
    "Request",
    "Response",
    "Session",
    "SessionSigner",
    "UploadedFile",
    "abort",
    "escape",
    "hash_password",
    "http_handler",
    "render",
    "render_each",
    "safe_redirect_target",
    "safe_url",
    "verify_password",
    "wsgi_app",
]
