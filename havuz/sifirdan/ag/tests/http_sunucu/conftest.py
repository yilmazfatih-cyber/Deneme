"""http_sunucu testlerinin fikstürleri: arka plan döngüsünde sunucu başlatıp test sonunda
kapatır.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Any

import pytest

from destek import BackgroundLoop
from http_sunucu import Handler, HttpServer

ServeFn = Callable[..., HttpServer]


@pytest.fixture
def serve(loop_thread: BackgroundLoop) -> Iterator[ServeFn]:
    """`serve(isleyici, limits=...)` → başlamış sunucu; test bitince düzgünce kapatılır."""
    servers: list[HttpServer] = []

    def start(handler: Handler, **kwargs: Any) -> HttpServer:
        server = HttpServer(handler, **kwargs)
        loop_thread.run(server.start())
        servers.append(server)
        return server

    yield start
    for server in servers:
        loop_thread.run(server.close(grace=1.0))
