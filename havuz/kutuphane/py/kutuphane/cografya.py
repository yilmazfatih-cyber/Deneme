"""cografya — küre üzerinde coğrafi hesap: iki nokta arası büyük daire uzaklığı (haversine), ilk yön açısı, verilen
yön ve uzaklıktaki nokta, bir merkezin çevresindeki sınır kutusu (veritabanında ön süzme için), kutu içinde mi,
en yakın noktalar. TypeScript eşiyle aynı formüller.

Kullanım:
    haversine_distance(LatLon(41.0082, 28.9784), LatLon(39.9334, 32.8597))   # ≈ 349 km (metre döner)
    kutu = bounding_box(merkez, 5000)        # 5 km yarıçap → BoundingBox(min_lat, min_lon, max_lat, max_lon)
    # SQL: WHERE lat BETWEEN … AND lon BETWEEN …, sonra haversine ile kesinleştir
    nearest(konum, subeler, key=lambda s: s.konum, limit=3)

Noktalar `LatLon(lat, lon)` ya da {"lat": …, "lon": …} sözlüğü olabilir.

Sınırlar: Dünya küre kabul edilir (ortalama yarıçap 6 371 008,8 m); gerçek (elipsoit) uzaklıktan sapma %0,5'e kadar
çıkabilir. Sınır kutusu 180. boylamı aşarsa min_lon > max_lon olur (is_in_bounding_box bunu bilir).

Genişletme: Yeni işlev derece alıp derece döndürür, girdiyi `_point` ile denetler; TypeScript eşine aynı formülle
eklenir ve `vektorler/cografya.json`'a örnek yazılır.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

__all__ = [
    "EARTH_RADIUS_M",
    "BoundingBox",
    "GeoError",
    "LatLon",
    "Nearest",
    "bounding_box",
    "destination_point",
    "haversine_distance",
    "initial_bearing",
    "is_in_bounding_box",
    "nearest",
]

EARTH_RADIUS_M = 6_371_008.8
"""Ortalama Dünya yarıçapı (IUGG, metre)."""

T = TypeVar("T")


class GeoError(ValueError):
    """Geçersiz enlem/boylam ya da yarıçap."""


@dataclass(frozen=True)
class LatLon:
    lat: float
    lon: float


@dataclass(frozen=True)
class BoundingBox:
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float


@dataclass(frozen=True)
class Nearest(Generic[T]):
    item: T
    distance: float


PointLike = LatLon | Mapping[str, float]


def _point(value: PointLike, label: str = "nokta") -> LatLon:
    point = value if isinstance(value, LatLon) else LatLon(float(value["lat"]), float(value["lon"]))
    if not math.isfinite(point.lat) or not -90 <= point.lat <= 90:
        raise GeoError(f"{label}: enlem −90 ile 90 arasında olmalı ({point.lat}).")
    if not math.isfinite(point.lon) or not -180 <= point.lon <= 180:
        raise GeoError(f"{label}: boylam −180 ile 180 arasında olmalı ({point.lon}).")
    return point


def _normalize_lon(lon: float) -> float:
    wrapped = ((lon + 180) % 360 + 360) % 360 - 180
    return 180.0 if wrapped == -180 and lon > 0 else wrapped


def haversine_distance(a: PointLike, b: PointLike, radius: float = EARTH_RADIUS_M) -> float:
    """Büyük daire uzaklığı (metre), haversine formülü."""
    p, q = _point(a, "a"), _point(b, "b")
    d_lat = math.radians(q.lat - p.lat)
    d_lon = math.radians(q.lon - p.lon)
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(p.lat)) * math.cos(math.radians(q.lat)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * radius * math.asin(min(1.0, math.sqrt(h)))


def initial_bearing(a: PointLike, b: PointLike) -> float:
    """a'dan b'ye ilk yön açısı (derece; 0 = kuzey, 90 = doğu)."""
    p, q = _point(a, "a"), _point(b, "b")
    phi1, phi2 = math.radians(p.lat), math.radians(q.lat)
    d_lambda = math.radians(q.lon - p.lon)
    y = math.sin(d_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lambda)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def destination_point(
    start: PointLike, bearing: float, distance: float, radius: float = EARTH_RADIUS_M
) -> LatLon:
    """Başlangıçtan `bearing` yönünde `distance` metre ilerideki nokta."""
    s = _point(start, "başlangıç")
    delta = distance / radius
    theta = math.radians(bearing)
    phi1, lambda1 = math.radians(s.lat), math.radians(s.lon)
    phi2 = math.asin(
        math.sin(phi1) * math.cos(delta) + math.cos(phi1) * math.sin(delta) * math.cos(theta)
    )
    lambda2 = lambda1 + math.atan2(
        math.sin(theta) * math.sin(delta) * math.cos(phi1),
        math.cos(delta) - math.sin(phi1) * math.sin(phi2),
    )
    return LatLon(math.degrees(phi2), _normalize_lon(math.degrees(lambda2)))


def bounding_box(center: PointLike, radius_m: float, radius: float = EARTH_RADIUS_M) -> BoundingBox:
    """Merkezin `radius_m` metre çevresini kapsayan en küçük enlem/boylam kutusu (J. Matuschek yöntemi)."""
    c = _point(center, "merkez")
    if not radius_m >= 0:
        raise GeoError("Yarıçap 0 veya daha büyük olmalı.")
    delta = radius_m / radius
    lat = math.radians(c.lat)
    min_lat, max_lat = lat - delta, lat + delta
    if min_lat > -math.pi / 2 and max_lat < math.pi / 2:
        d_lambda = math.asin(min(1.0, math.sin(delta) / math.cos(lat)))
        min_lon = _normalize_lon(c.lon - math.degrees(d_lambda))
        max_lon = _normalize_lon(c.lon + math.degrees(d_lambda))
    else:
        min_lat, max_lat = max(min_lat, -math.pi / 2), min(max_lat, math.pi / 2)
        min_lon, max_lon = -180.0, 180.0
    return BoundingBox(math.degrees(min_lat), min_lon, math.degrees(max_lat), max_lon)


def is_in_bounding_box(point: PointLike, box: BoundingBox | Mapping[str, float]) -> bool:
    """Nokta kutunun içinde mi? (180. boylamı aşan kutuyu da doğru değerlendirir.)"""
    p = _point(point)
    b = (
        box
        if isinstance(box, BoundingBox)
        else BoundingBox(box["minLat"], box["minLon"], box["maxLat"], box["maxLon"])
    )
    if p.lat < b.min_lat or p.lat > b.max_lat:
        return False
    if b.min_lon <= b.max_lon:
        return b.min_lon <= p.lon <= b.max_lon
    return p.lon >= b.min_lon or p.lon <= b.max_lon


def nearest(
    target: PointLike,
    items: Sequence[T],
    *,
    key: Callable[[T], PointLike] | None = None,
    limit: int = 1,
) -> list[Nearest[T]]:
    """Hedefe en yakın `limit` öğe (uzaklık metre), yakından uzağa; eşitlikte listedeki sıra."""
    get: Callable[[T], Any] = key or (lambda item: item)
    scored = [
        (haversine_distance(target, get(item)), index, item) for index, item in enumerate(items)
    ]
    scored.sort(key=lambda entry: (entry[0], entry[1]))
    return [Nearest(item=item, distance=distance) for distance, _, item in scored[:limit]]
