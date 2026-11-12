"""Aşama 5 — Zamanlanmış tetikleyici: 5 alanlı cron ayrıştırıcı + kalıcı zamanlama tablosu.

Gerçek karşılığı: autogpt_platform/backend/backend/executor/scheduler.py — APScheduler
BackgroundScheduler, CronTrigger.from_crontab ve PostgreSQL'e yazan bir SQLAlchemy iş deposu
(ResilientSQLAlchemyJobStore). Zamanlayıcı ayrı bir süreçtir; zamanı gelen iş grafı çalıştırma
kuyruğuna (RabbitMQ) atar, grafı yürütücü süreç çalıştırır.

Bu mini sürümde saat dışarıdan verilir (tick(simdi)); böylece testler beklemeden, deterministik çalışır.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Any, Callable

from asama2_graf import Graph
from asama3_yurutucu import Executor, GraphRunResult

# Haftanın günü 0-7: Unix cron'da hem 0 hem 7 Pazar'dır; ayrıştırınca 7'yi 0'a katlıyoruz.
_ALANLAR = (("dakika", 0, 59), ("saat", 0, 23), ("gün", 1, 31), ("ay", 1, 12), ("haftanın günü", 0, 7))


def _alan_coz(ifade: str, ad: str, alt: int, ust: int) -> set[int]:
    """'*', '*/15', '1-5', '0,30', '10-20/5' biçimlerini değer kümesine çevirir."""
    degerler: set[int] = set()
    for parca in ifade.split(","):
        aralik, _, adim_s = parca.partition("/")
        adim = int(adim_s) if adim_s else 1
        if adim < 1:
            raise ValueError(f"{ad}: adım 1'den küçük olamaz")
        if aralik == "*":
            bas, son = alt, ust
        elif "-" in aralik:
            bas_s, son_s = aralik.split("-", 1)
            bas, son = int(bas_s), int(son_s)
        else:
            bas = son = int(aralik)
            if adim_s:
                son = ust  # '5/10' → 5'ten başla, 10'ar artır
        if not (alt <= bas <= ust and alt <= son <= ust and bas <= son):
            raise ValueError(f"{ad}: {parca!r} {alt}-{ust} aralığı dışında")
        degerler.update(range(bas, son + 1, adim))
    return degerler


class CronExpression:
    """Standart 5 alan: dakika saat ay-günü ay hafta-günü (0 ve 7 = Pazar, 1 = Pazartesi).

    Tuzak: Python'un weekday()'i 0 = Pazartesi sayar; matches() bu yüzden isoweekday() % 7
    kullanır. Gerçek depo da aynı tuzağı çözer: APScheduler 0 = Pazartesi saydığı için
    scheduler.py, ifadeyi CronTrigger.from_crontab'a vermeden önce _normalize_cron_day_of_week
    ile çevirir."""

    def __init__(self, ifade: str):
        parcalar = ifade.split()
        if len(parcalar) != 5:
            raise ValueError(f"cron ifadesi 5 alan içermeli: {ifade!r}")
        self.ifade = ifade
        dakika, saat, gun, ay, hgun = (_alan_coz(p, *alan) for p, alan in zip(parcalar, _ALANLAR, strict=True))
        hgun = {g % 7 for g in hgun}  # 7 (Pazar) → 0
        self.dakika, self.saat, self.gun, self.ay, self.hgun = dakika, saat, gun, ay, hgun
        self._gun_kisitli = parcalar[2] != "*"
        self._hgun_kisitli = parcalar[4] != "*"

    def matches(self, an: datetime) -> bool:
        if an.minute not in self.dakika or an.hour not in self.saat or an.month not in self.ay:
            return False
        gun_uyar = an.day in self.gun
        hgun_uyar = (an.isoweekday() % 7) in self.hgun
        if self._gun_kisitli and self._hgun_kisitli:
            return gun_uyar or hgun_uyar  # klasik cron kuralı: ikisi de kısıtlıysa VEYA
        return gun_uyar and hgun_uyar

    def next_after(self, an: datetime) -> datetime:
        """'an'dan SONRAKİ ilk eşleşen dakika (basit ve anlaşılır: dakika dakika ilerle)."""
        aday = an.replace(second=0, microsecond=0) + timedelta(minutes=1)
        for _ in range(366 * 24 * 60):
            if self.matches(aday):
                return aday
            aday += timedelta(minutes=1)
        raise ValueError(f"{self.ifade!r} bir yıl içinde hiç eşleşmiyor")


class Scheduler:
    """Zamanlamaları sqlite'ta tutar; tick() zamanı gelenleri çalıştırır."""

    def __init__(self, executor: Executor, graph_loader: Callable[[str], Graph], db: sqlite3.Connection | None = None):
        self.executor = executor
        self.graph_loader = graph_loader
        self.db = db or sqlite3.connect(":memory:")
        self.db.execute("""CREATE TABLE IF NOT EXISTS schedules (
                 id TEXT PRIMARY KEY, graph_id TEXT NOT NULL, user_id TEXT NOT NULL, cron TEXT NOT NULL,
                 inputs TEXT NOT NULL, next_run_at TEXT NOT NULL, last_exec_id TEXT)""")

    def add_schedule(self, graph_id: str, cron: str, inputs: dict[str, Any], user_id: str, simdi: datetime) -> str:
        ilk = CronExpression(cron).next_after(simdi)  # geçersiz ifade burada reddedilir
        sid = str(uuid.uuid4())
        self.db.execute(
            "INSERT INTO schedules VALUES (?, ?, ?, ?, ?, ?, NULL)",
            (sid, graph_id, user_id, cron, json.dumps(inputs, ensure_ascii=False), ilk.isoformat()),
        )
        self.db.commit()
        return sid

    def list_schedules(self) -> list[dict[str, Any]]:
        satirlar = self.db.execute(
            "SELECT id, graph_id, cron, next_run_at, last_exec_id FROM schedules ORDER BY next_run_at"
        )
        return [dict(zip(("id", "graph_id", "cron", "next_run_at", "last_exec_id"), s, strict=True)) for s in satirlar]

    def delete_schedule(self, sid: str) -> bool:
        silinen = self.db.execute("DELETE FROM schedules WHERE id = ?", (sid,)).rowcount
        self.db.commit()
        return silinen > 0

    def tick(self, simdi: datetime) -> list[GraphRunResult]:
        """Zamanı gelmiş her işi bir kez çalıştırır. Önce bir sonraki zamanı yazar, sonra çalıştırır:
        süreç çalıştırma sırasında çökerse aynı dilim iki kez koşmaz (en fazla bir kez)."""
        sonuclar = []
        gelenler = self.db.execute(
            "SELECT id, graph_id, user_id, cron, inputs FROM schedules WHERE next_run_at <= ? ORDER BY next_run_at",
            (simdi.isoformat(),),
        ).fetchall()
        for sid, graph_id, user_id, cron, inputs in gelenler:
            sonraki = CronExpression(cron).next_after(simdi)
            self.db.execute("UPDATE schedules SET next_run_at = ? WHERE id = ?", (sonraki.isoformat(), sid))
            self.db.commit()
            sonuc = self.executor.run(self.graph_loader(graph_id), json.loads(inputs), user_id=user_id)
            self.db.execute("UPDATE schedules SET last_exec_id = ? WHERE id = ?", (sonuc.graph_exec_id, sid))
            self.db.commit()
            sonuclar.append(sonuc)
        return sonuclar
