"""Örnek uygulama: tek kapıda sohbet sayfası (`/`) ve sohbet odası (`/oda`, WebSocket).

    python -m websocket sun --kapi 8451    → tarayıcıda http://127.0.0.1:8451/ (iki sekmede)
Her gelen metin odadaki HERKESE yayınlanır. Sayfa iletileri `textContent` ile basar (XSS'e kapalı).
Genişletme: kullanıcı adı, oda listesi ya da geçmiş için `Room` ve `chat` işlevini kopyalayıp
uyarlayın.
"""

from __future__ import annotations

from pathlib import Path

from http_sunucu import Handler, Headers, Request, Response
from websocket.connection import WebSocket
from websocket.room import Room
from websocket.server import PathRouter, websocket_endpoint

PAGE = Path(__file__).with_name("sohbet.html")
MAX_TEXT = 500
# Satır içi betik/biçim yalnız bu tek sayfa içindir; bağlantılar yalnız aynı kökene (ws dahil).
CSP = (
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'"
)


def build_app(room: Room | None = None) -> Handler:
    """Sayfa + oda işleyicisini kurar (testler kendi odasını verebilir)."""
    chat_room = room or Room()

    async def page(request: Request) -> Response:
        headers = Headers([("Content-Type", "text/html; charset=utf-8")])
        headers.add("Content-Security-Policy", CSP)
        return Response(200, headers, PAGE.read_bytes())

    async def chat(ws: WebSocket, request: Request) -> None:
        chat_room.join(ws)
        try:
            async for message in ws:
                if isinstance(message, str) and message.strip():
                    chat_room.broadcast(message[:MAX_TEXT])
        finally:
            await chat_room.leave(ws)

    return PathRouter({"/": page, "/oda": websocket_endpoint(chat)})
