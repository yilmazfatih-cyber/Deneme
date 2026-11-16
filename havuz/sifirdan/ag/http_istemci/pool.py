"""Bağlantı havuzu: aynı kökene (şema, sunucu, kapı) giden istekler açık bağlantıyı yeniden
kullanır.

    get(url)   → boştaki bağlantı varsa ve "bayat" değilse onu, yoksa yenisini ver
    put(c, ok) → yanıt tamamen okunduysa ve yeniden kullanılabiliyorsa boşa koy (köken başına ≤ N)
Neden: her istekte yeni TCP (+ TLS) el sıkışması yüzlerce milisaniye ekleyebilir.
Bayat bağlantı: sunucu boştaki bağlantıyı kendi zaman aşımıyla kapatmış olabilir; `is_stale` bunu
yakalar. İş parçacığı güvenlidir (kilitli).
Genişletme: boşta bekleme süresi sınırı istenirse bağlantıyla birlikte bırakılma zamanını saklayın.
"""

from __future__ import annotations

import ssl
import threading

from http_istemci.connection import Connection
from http_istemci.url import Url


class ConnectionPool:
    def __init__(
        self,
        max_per_origin: int = 4,
        timeout: float = 10.0,
        ssl_context: ssl.SSLContext | None = None,
    ) -> None:
        self.max_per_origin = max_per_origin
        self.timeout = timeout
        self.ssl_context = ssl_context
        self._idle: dict[tuple[str, str, int], list[Connection]] = {}
        self._lock = threading.Lock()
        self.created = 0  # testlerde yeniden kullanımı ölçmek için

    def get(self, url: Url) -> Connection:
        while True:
            with self._lock:
                idle = self._idle.get(url.origin, [])
                conn = idle.pop() if idle else None
            if conn is None:
                break
            if conn.is_stale():
                conn.close()
                continue
            conn.reused = True
            return conn
        return self.new(url)

    def new(self, url: Url) -> Connection:
        """Havuza bakmadan yeni bağlantı açar."""
        conn = Connection(url, self.timeout, self.ssl_context)
        self.created += 1
        return conn

    def put(self, conn: Connection, reusable: bool) -> None:
        if reusable:
            with self._lock:
                idle = self._idle.setdefault(conn.origin, [])
                if len(idle) < self.max_per_origin:
                    idle.append(conn)
                    return
        conn.close()

    def close(self) -> None:
        with self._lock:
            connections = [c for idle in self._idle.values() for c in idle]
            self._idle.clear()
        for conn in connections:
            conn.close()
