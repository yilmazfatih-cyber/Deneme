"""Gerçek tarayıcı duman testi: başsız Chromium sayfayı açar, WebSocket ile sunucuyla konuşur.

Playwright paketi gerekmez: tarayıcı doğrudan başlatılır, doğrulama SUNUCU tarafında yapılır
(tarayıcının gönderdiği iletiler beklenenle aynı mı?). Yalnız `python scripts/check.py --uzun` ile
koşar.
Tarayıcı yolu: PLAYWRIGHT_CHROMIUM_EXECUTABLE ortam değişkeni ya da /opt/pw-browsers/chromium.
"""

from __future__ import annotations

import os
import signal
import subprocess
import threading
from pathlib import Path

import pytest

from destek import BackgroundLoop
from http_sunucu import HttpServer, Request, Response
from websocket import PathRouter, WebSocket, websocket_endpoint

CHROMIUM = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE", "/opt/pw-browsers/chromium")
PAGE = """<!doctype html><html lang="tr"><meta charset="utf-8"><title>Duman testi</title>
<script>
  const kanal = new WebSocket(`ws://${location.host}/ws`)
  kanal.onopen = () => kanal.send('tarayıcıdan merhaba: ğüşiöç İ')
  kanal.onmessage = (olay) => kanal.send('geri:' + olay.data)
</script></html>"""


@pytest.mark.tarayici
def test_gercek_tarayici_ile_ileti_alisverisi(loop_thread: BackgroundLoop, tmp_path: Path) -> None:
    if not Path(CHROMIUM).exists():
        pytest.skip(
            "Chromium bulunamadı; PLAYWRIGHT_CHROMIUM_EXECUTABLE ortam değişkenini ayarlayın."
        )
    received: list[str | bytes] = []
    finished = threading.Event()

    async def page(request: Request) -> Response:
        return Response.html(PAGE)

    async def channel(ws: WebSocket, request: Request) -> None:
        received.append(await ws.recv())
        await ws.send("sunucudan: İstanbul 🚀")
        received.append(await ws.recv())
        finished.set()

    server = HttpServer(PathRouter({"/": page, "/ws": websocket_endpoint(channel)}))
    loop_thread.run(server.start())
    command = [
        CHROMIUM,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-background-networking",
        f"--user-data-dir={tmp_path / 'profil'}",
        f"http://127.0.0.1:{server.port}/",
    ]
    browser = subprocess.Popen(
        command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True
    )
    try:
        assert finished.wait(60), "Tarayıcı 60 saniyede iletileri tamamlamadı."
    finally:
        os.killpg(browser.pid, signal.SIGKILL)  # tarayıcının tüm alt süreçleriyle birlikte
        browser.wait(10)
        loop_thread.run(server.close(grace=1))
    assert received == ["tarayıcıdan merhaba: ğüşiöç İ", "geri:sunucudan: İstanbul 🚀"]
