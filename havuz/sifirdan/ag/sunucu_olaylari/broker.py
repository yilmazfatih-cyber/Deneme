"""SSE yayıncısı ve uç noktası: olayları numaralar, son N olayı saklar, yeniden bağlanana
kaçırdıklarını yollar.

    yayinci = Broker(history=100)
    HttpServer(sse_endpoint(yayinci), port=8457)       # GET → text/event-stream
    yayinci.publish("Sipariş kargoda", event="siparis")  # tüm abonelere
Yeniden bağlanma: tarayıcının EventSource'u (ve `client.listen`) kopunca "Last-Event-ID" ile döner;
o numaradan sonraki olaylar geçmişten yeniden gönderilir. Yavaş abone (kuyruğu dolan) bağlantısı
kesilir, diğerleri etkilenmez.
Genişletme: kanal/oda ayrımı için `Broker`'ı kanal adına göre sözlükte tutun; uç noktada yoldan
kanalı seçin.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections import deque
from collections.abc import AsyncIterator

from http_sunucu import Handler, Headers, Request, Response
from sunucu_olaylari.events import Event, comment, format_event


class Broker:
    def __init__(self, history: int = 100, max_queue: int = 100) -> None:
        self._history: deque[Event] = deque(maxlen=history)
        self._subscribers: set[asyncio.Queue[Event | None]] = set()
        self._next_id = 1
        self.max_queue = max_queue

    def publish(self, data: str, event: str = "message") -> Event:
        item = Event(data, event, str(self._next_id))
        self._next_id += 1
        self._history.append(item)
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(item)
            except asyncio.QueueFull:
                self._subscribers.discard(queue)
                with contextlib.suppress(asyncio.QueueFull):
                    queue.get_nowait()
                    queue.put_nowait(None)  # yavaş abone: akış kapatılır, istemci yeniden bağlanır
        return item

    def subscribe(self, last_event_id: str | None) -> asyncio.Queue[Event | None]:
        queue: asyncio.Queue[Event | None] = asyncio.Queue(self.max_queue)
        if last_event_id is not None and last_event_id.isdigit():
            for item in self._history:
                if item.id is not None and int(item.id) > int(last_event_id) and not queue.full():
                    queue.put_nowait(item)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[Event | None]) -> None:
        self._subscribers.discard(queue)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)


def sse_endpoint(broker: Broker, heartbeat: float = 15.0, retry_ms: int = 2000) -> Handler:
    async def endpoint(request: Request) -> Response:
        if request.method != "GET":
            return Response.error(405, Headers([("Allow", "GET")]))
        queue = broker.subscribe(request.headers.get("last-event-id"))

        async def stream() -> AsyncIterator[bytes]:
            try:
                yield format_event(Event("bağlandı", "hazir", retry=retry_ms))
                while True:
                    try:
                        item = await asyncio.wait_for(queue.get(), heartbeat)
                    except TimeoutError:
                        yield comment("nabız")
                        continue
                    if item is None:
                        return
                    yield format_event(item)
            finally:
                broker.unsubscribe(queue)

        headers = Headers([("Content-Type", "text/event-stream; charset=utf-8")])
        headers.add("Cache-Control", "no-store")
        headers.add("X-Accel-Buffering", "no")  # ara vekiller akışı tamponlamasın
        return Response(200, headers, stream())

    return endpoint
