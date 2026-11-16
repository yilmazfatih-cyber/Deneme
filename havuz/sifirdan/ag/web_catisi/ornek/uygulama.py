"""Örnek uygulama: kayıt/giriş + kişisel not defteri (web_catisi + orm + stdlib kriptografisi).

Yollar:  /  ·  /kayit  ·  /giris  ·  /cikis (POST)  ·  /notlar (GET/POST)  ·  /notlar/<id>
         /notlar/<id>/sil (POST)  ·  /notlar/yukle (POST, .txt)  ·  /statik/…
Güvenlik kararları (her birinin testi `tests/web_catisi/test_ornek.py`'de):
    - parola scrypt ile özetlenir; kullanıcı yoksa da sahte özet doğrulanır (zamanlamayla ad sızmaz)
    - aynı ada 15 dakikada 5 hatalı deneme → geçici engel; hata iletisi adın var olup olmadığını
      söylemez
    - girişte oturum yenilenir (sabitleme), çıkışta `oturum_surumu` artar (tüm eski çerezler
      geçersiz)
    - başkasının notu 404 (varlığı bile sızmaz); her form CSRF belirteçli; her çıktı kaçışlı
    - giriş sonrası `sonra` yalnız site içi yola yönlendirir (açık yönlendirme yok)
Genişletme: yeni sayfa = `sablonlar.py`'ye şablon + `metinler.py`'ye metin + burada `@app.route` +
test.
"""

from __future__ import annotations

import re
import sqlite3
import time
from collections.abc import Callable
from pathlib import Path
from urllib.parse import quote

from orm import Database
from orm.turkish import lower_tr
from web_catisi import (
    App,
    Markup,
    Request,
    Response,
    abort,
    hash_password,
    render,
    render_each,
    safe_redirect_target,
    verify_password,
)
from web_catisi.ornek import sablonlar as s
from web_catisi.ornek.metinler import t
from web_catisi.ornek.modeller import Kullanici, Not

NAME_RE = re.compile(r"[\w.\-]{3,32}")
MAX_UPLOAD = 64 * 1024
STATIC = Path(__file__).with_name("statik")


class LoginThrottle:
    """Kullanıcı adı başına başarısız giriş sınırı (bellekte, tek süreç; saat dışarıdan verilir)."""

    def __init__(self, clock: Callable[[], float], limit: int = 5, window: float = 900.0) -> None:
        self.clock, self.limit, self.window = clock, limit, window
        self._failures: dict[str, list[float]] = {}

    def blocked(self, name: str) -> bool:
        recent = [at for at in self._failures.get(name, []) if self.clock() - at < self.window]
        self._failures[name] = recent
        return len(recent) >= self.limit

    def failed(self, name: str) -> None:
        self._failures.setdefault(name, []).append(self.clock())

    def reset(self, name: str) -> None:
        self._failures.pop(name, None)


def create_app(
    db: Database,
    secret_keys: list[bytes],
    *,
    password_cost: int = 2**14,
    clock: Callable[[], float] = time.time,
) -> App:
    app = App(secret_keys, clock=clock, max_body=256 * 1024)
    app.static("/statik", STATIC)
    throttle = LoginThrottle(clock)
    dummy_hash = hash_password("zamanlama-esitleme", n=password_cost)

    def session_of(request: Request) -> dict[str, object]:
        assert request.session is not None
        return request.session.data

    def current_user(request: Request) -> Kullanici | None:
        data = session_of(request)
        uid = data.get("uid")
        user = db.get(Kullanici, uid) if isinstance(uid, int) else None
        if user is None or data.get("sv") != user.oturum_surumu:
            return None  # çıkış yapılmış (sürüm artmış) ya da silinmiş kullanıcının eski çerezi
        return user

    def csrf_field(request: Request) -> Markup:
        assert request.session is not None
        return render(s.CSRF_ALANI, belirtec=request.session.csrf_token)

    def page(request: Request, title: str, content: Markup, status: int = 200) -> Response:
        assert request.session is not None
        user = current_user(request)
        if user is not None:
            menu = render(
                s.MENU_UYE,
                notlar=t("menu.notlar"),
                ad=user.ad,
                csrf_alani=csrf_field(request),
                cikis=t("menu.cikis"),
            )
        else:
            menu = render(s.MENU_MISAFIR, giris=t("menu.giris"), kayit=t("menu.kayit"))
        flashes = [{"tur": c, "ileti": m} for c, m in request.session.pop_flashes()]
        html = render(
            s.SAYFA,
            baslik=title,
            uygulama=t("uygulama"),
            menu=menu,
            flaslar=render_each(s.FLAS, flashes),
            icerik=content,
        )
        response = Response(html, status)
        response.headers.set("Cache-Control", "no-store")  # kişisel sayfalar önbelleğe girmez
        return response

    def account_form(request: Request, kind: str, error: str = "", name: str = "") -> Response:
        is_login = kind == "giris"
        content = render(
            s.HESAP_FORMU,
            hata=render(s.HATA, ileti=error) if error else Markup(""),
            eylem=f"/{kind}",
            csrf_alani=csrf_field(request),
            sonra=request.form.get("sonra") or request.query.get("sonra") or "",
            etiket_ad=t("alan.ad"),
            ad=name,
            etiket_parola=t("alan.parola"),
            otomatik="current-password" if is_login else "new-password",
            dugme=t("dugme.giris" if is_login else "dugme.kayit"),
        )
        return page(request, t(f"{kind}.baslik"), content, 400 if error else 200)

    def sign_in_as(request: Request, user: Kullanici) -> None:
        assert request.session is not None
        request.session.regenerate()  # oturum sabitlemeye karşı: yeni kimlik, yeni CSRF belirteci
        request.session["uid"] = user.id
        request.session["sv"] = user.oturum_surumu

    def credentials(request: Request) -> tuple[str, str]:
        name = lower_tr((request.form.get("ad") or "").strip()) or ""  # "AYŞE" ve "ayşe" aynı hesap
        return name, request.form.get("parola") or ""

    @app.route("/")
    def index(request: Request) -> Response:
        if current_user(request) is not None:
            return Response.redirect("/notlar")
        return page(request, t("ana.baslik"), render(s.ANA, tanitim=t("ana.tanitim")))

    @app.route("/kayit", methods=("GET", "POST"))
    def register(request: Request) -> Response:
        if request.method != "POST":
            return account_form(request, "kayit")
        name, password = credentials(request)
        if not NAME_RE.fullmatch(name):
            return account_form(request, "kayit", t("hata.ad"), name)
        if not 8 <= len(password) <= 128:
            return account_form(request, "kayit", t("hata.parola"), name)
        try:
            user = db.save(
                Kullanici(ad=name, parola_ozeti=hash_password(password, n=password_cost))
            )
        except sqlite3.IntegrityError:  # benzersizlik: eşzamanlı iki kayıtta da doğru sonuç
            return account_form(request, "kayit", t("hata.ad_alinmis"), name)
        assert isinstance(user, Kullanici)
        sign_in_as(request, user)
        assert request.session is not None
        request.session.flash(t("bilgi.kayit"))
        return Response.redirect("/notlar")

    @app.route("/giris", methods=("GET", "POST"))
    def sign_in(request: Request) -> Response:
        if request.method != "POST":
            return account_form(request, "giris")
        name, password = credentials(request)
        if throttle.blocked(name):
            return account_form(request, "giris", t("hata.cok_deneme"), name)
        user = db.query(Kullanici).filter(ad=name).first()
        valid = verify_password(password, user.parola_ozeti if user else dummy_hash)
        if user is None or not valid:
            throttle.failed(name)
            return account_form(request, "giris", t("hata.giris"), name)
        throttle.reset(name)
        sign_in_as(request, user)
        assert request.session is not None
        request.session.flash(t("bilgi.giris"))
        return Response.redirect(safe_redirect_target(request.form.get("sonra"), "/notlar"))

    @app.route("/cikis", methods=("POST",))
    def sign_out(request: Request) -> Response:
        user = current_user(request)
        if user is not None:
            user.oturum_surumu += 1  # bu kullanıcının TÜM çerezleri geçersiz olur
            db.save(user)
        assert request.session is not None
        request.session.regenerate()
        request.session.flash(t("bilgi.cikis"))
        return Response.redirect("/")

    def require_user(request: Request) -> Kullanici:
        user = current_user(request)
        if user is None:
            raise _LoginRedirectError(request.path)
        return user

    def own_note(user: Kullanici, note_id: int) -> Not:
        note = db.query(Not).filter(id=note_id, sahip=user).first()
        if note is None:
            abort(404)  # başkasının notu da "yok"tur: varlığı sızdırılmaz (IDOR)
        return note

    def notes_page(request: Request, user: Kullanici, error: str = "") -> Response:
        notes = db.query(Not).filter(sahip=user).order_by("-id").all()
        rows = render_each(s.NOT_SATIRI, [{"id": n.id, "baslik": n.baslik} for n in notes])
        content = render(
            s.NOTLAR,
            hata=render(s.HATA, ileti=error) if error else Markup(""),
            satirlar=rows or render("<li>{bos}</li>", bos=t("notlar.bos")),
            yeni=t("notlar.yeni"),
            csrf_alani=csrf_field(request),
            etiket_baslik=t("alan.not_baslik"),
            etiket_metin=t("alan.not_metin"),
            dugme_ekle=t("dugme.ekle"),
            yukle=t("notlar.yukle"),
            etiket_dosya=t("alan.dosya"),
            dugme_yukle=t("dugme.yukle"),
        )
        return page(request, t("notlar.baslik"), content, 400 if error else 200)

    def add_note(request: Request, user: Kullanici, title: str, text: str) -> Response:
        if not 1 <= len(title) <= 200:
            return notes_page(request, user, t("hata.not_baslik"))
        if len(text) > 10_000:
            return notes_page(request, user, t("hata.not_metin"))
        db.save(Not(baslik=title, metin=text, sahip=user))
        assert request.session is not None
        request.session.flash(t("bilgi.not_eklendi"))
        return Response.redirect("/notlar")  # Post/Redirect/Get: yenilemede form yeniden gitmez

    @app.route("/notlar", methods=("GET", "POST"))
    def notes(request: Request) -> Response:
        user = require_user(request)
        if request.method != "POST":
            return notes_page(request, user)
        title = (request.form.get("baslik") or "").strip()
        return add_note(request, user, title, request.form.get("metin") or "")

    @app.route("/notlar/yukle", methods=("POST",))
    def upload(request: Request) -> Response:
        user = require_user(request)
        files = request.files.get("dosya", [])
        if len(files) != 1 or not files[0].filename.lower().endswith(".txt"):
            return notes_page(request, user, t("hata.dosya"))
        if files[0].size > MAX_UPLOAD:
            return notes_page(request, user, t("hata.dosya"))
        try:
            text = files[0].data.decode("utf-8")
        except UnicodeDecodeError:
            return notes_page(request, user, t("hata.dosya"))
        return add_note(request, user, files[0].filename[:-4][:200] or "Dosya", text)

    @app.route("/notlar/<int:id>")
    def show(request: Request, id: int) -> Response:
        note = own_note(require_user(request), id)
        content = render(
            s.NOT_AYRINTI,
            metin=note.metin,
            id=note.id,
            csrf_alani=csrf_field(request),
            dugme_sil=t("dugme.sil"),
        )
        return page(request, note.baslik, content)

    @app.route("/notlar/<int:id>/sil", methods=("POST",))
    def delete(request: Request, id: int) -> Response:
        db.delete(own_note(require_user(request), id))
        assert request.session is not None
        request.session.flash(t("bilgi.not_silindi"))
        return Response.redirect("/notlar")

    app.use(_login_redirects)
    return app


class _LoginRedirectError(Exception):
    """Giriş gerektiren sayfaya oturumsuz gelindi; giriş sayfasına (geri dönüş adresiyle)
    yönlendir.
    """

    def __init__(self, path: str) -> None:
        super().__init__(path)
        self.path = path


def _login_redirects(request: Request, call_next: Callable[[Request], Response]) -> Response:
    try:
        return call_next(request)
    except _LoginRedirectError as exc:
        return Response.redirect("/giris?sonra=" + quote(exc.path))
