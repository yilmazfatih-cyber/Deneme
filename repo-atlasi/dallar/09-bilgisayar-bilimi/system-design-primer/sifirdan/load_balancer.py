"""
Yük dengeleyici simülasyonu: round-robin ile least-connections karşılaştırması.

Primer'deki karşılığı: "Load balancer" bölümü (dağıtım yöntemleri: random, least loaded,
session/cookies, round robin or weighted round robin, Layer 4, Layer 7).

Model (ayrık olay simülasyonu): Her sunucu istekleri sırayla (FIFO) işler; bir isteğin bitiş
zamanı = max(varış, sunucunun boşalma zamanı) + iş / hız. Sunucunun "bağlantı sayısı" o anda
kuyrukta bekleyen + işlenen istek sayısıdır. Dengeleyici her istek geldiğinde bir sunucu seçer.

Ders: İstek boyları birbirine yakınsa round-robin yeterlidir. Boylar çok farklıysa (birkaç
ağır rapor isteği, çok sayıda hafif istek) round-robin, ağır bir işin arkasına hafif istekleri
de dizer; least-connections meşgul sunucuyu atlar ve kuyruk gecikmesini (p95) düşürür.
"""

from __future__ import annotations

import heapq
import random
import statistics
from collections.abc import Sequence
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Request:
    arrival: float  # saniye
    work: float  # hız 1 olan sunucuda süre (saniye)


@dataclass
class Server:
    name: str
    speed: float = 1.0
    busy_until: float = 0.0
    served: int = 0
    _finish_times: list[float] = field(default_factory=list, repr=False)

    def connections(self, now: float) -> int:
        """`now` anında bitmemiş (kuyrukta ya da işlenmekte) istek sayısı."""
        while self._finish_times and self._finish_times[0] <= now:
            heapq.heappop(self._finish_times)
        return len(self._finish_times)

    def assign(self, request: Request) -> float:
        start = max(request.arrival, self.busy_until)
        finish = start + request.work / self.speed
        self.busy_until = finish
        self.served += 1
        heapq.heappush(self._finish_times, finish)
        return finish


class RoundRobin:
    name = "round-robin"

    def __init__(self) -> None:
        self._next = 0

    def choose(self, servers: Sequence[Server], now: float) -> Server:
        server = servers[self._next % len(servers)]
        self._next += 1
        return server


class LeastConnections:
    name = "least-connections"

    def choose(self, servers: Sequence[Server], now: float) -> Server:
        # Eşitlikte listede önce geleni seç: deterministik ve açıklaması kolay.
        return min(servers, key=lambda server: server.connections(now))


class RandomChoice:
    name = "random"

    def __init__(self, seed: int = 0) -> None:
        self._random = random.Random(seed)

    def choose(self, servers: Sequence[Server], now: float) -> Server:
        return self._random.choice(list(servers))


@dataclass
class Report:
    strategy: str
    mean_latency: float
    p95_latency: float
    max_latency: float
    served: dict[str, int]


def percentile(values: Sequence[float], ratio: float) -> float:
    """
    En yakın sıra yöntemiyle yüzdelik.

    >>> percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)
    10
    >>> percentile([4.0], 0.5)
    4.0
    """
    ordered = sorted(values)
    rank = max(1, round(ratio * len(ordered)))
    return ordered[min(rank, len(ordered)) - 1]


def simulate(
    requests: Sequence[Request], speeds: Sequence[float], strategy: RoundRobin | LeastConnections | RandomChoice
) -> Report:
    servers = [Server(f"s{i}", speed) for i, speed in enumerate(speeds)]
    latencies = []
    for request in sorted(requests, key=lambda r: r.arrival):
        server = strategy.choose(servers, request.arrival)
        latencies.append(server.assign(request) - request.arrival)
    return Report(
        strategy=strategy.name,
        mean_latency=statistics.fmean(latencies),
        p95_latency=percentile(latencies, 0.95),
        max_latency=max(latencies),
        served={server.name: server.served for server in servers},
    )


def mixed_workload(count: int = 2000, seed: int = 7, heavy_ratio: float = 0.05) -> list[Request]:
    """
    Poisson varışlı karışık iş yükü: çoğu istek hafif (~10 ms), bir kısmı ağır (~1 s).
    Ortalama yük sunucu kapasitesinin altında tutulur ki kuyruklar sonsuza büyümesin.
    """
    generator = random.Random(seed)
    now = 0.0
    requests = []
    for _ in range(count):
        now += generator.expovariate(40.0)  # saniyede ortalama 40 istek
        heavy = generator.random() < heavy_ratio
        work = generator.uniform(0.8, 1.2) if heavy else generator.uniform(0.005, 0.015)
        requests.append(Request(arrival=now, work=work))
    return requests


def uniform_workload(count: int = 2000, seed: int = 7) -> list[Request]:
    """Tüm istekler aynı boyda (~20 ms); round-robin için ideal durum."""
    generator = random.Random(seed)
    now = 0.0
    requests = []
    for _ in range(count):
        now += generator.expovariate(40.0)
        requests.append(Request(arrival=now, work=0.02))
    return requests


if __name__ == "__main__":
    for title, workload in (("karışık", mixed_workload()), ("tekdüze", uniform_workload())):
        for strategy in (RoundRobin(), LeastConnections(), RandomChoice()):
            report = simulate(workload, [1.0, 1.0, 1.0, 1.0], strategy)
            print(
                f"{title:8} {report.strategy:18} ort={report.mean_latency * 1000:7.1f} ms  "
                f"p95={report.p95_latency * 1000:7.1f} ms  en kötü={report.max_latency * 1000:7.1f} ms"
            )
