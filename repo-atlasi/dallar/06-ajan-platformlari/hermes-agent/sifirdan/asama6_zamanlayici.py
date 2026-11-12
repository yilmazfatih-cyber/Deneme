"""Aşama 6 — Zamanlanmış işler (cron): doğal zaman ifadeleri, jobs.json, tick, platforma teslim.

Gerçek karşılıkları: cron/jobs.py (iş deposu: ~/.hermes/cron/jobs.json, çıktı:
~/.hermes/cron/output/<job_id>/<zaman>.md), cron/scheduler.py (tick: gateway her 60 sn'de çağırır,
~/.hermes/cron/.tick.lock ile tek tick), tools/cronjob_tools.py (ajanın iş kurduğu araç).

Kabul edilen zaman ifadeleri (gerçek depodakine benzer): '30m', '2h', '1d', 'every 2h',
5 alanlı cron ('0 9 * * *') ve ISO tek seferlik ('2026-11-10T09:00:00').
Değişmez kural: tick, işi çalıştırmadan ÖNCE next_run_at'ı ilerletir → çökme olsa da en fazla bir kez.
"""

from __future__ import annotations

import json
import re
import threading
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

from asama1_hafiza import atomik_yaz
from asama2_araclar import registry, tool_error

_SURE = re.compile(r"^(?:every\s+)?(\d+)\s*([mhd])$")
_BIRIM = {"m": "minutes", "h": "hours", "d": "days"}


def _cron_alani(ifade: str, alt: int, ust: int) -> set[int]:
    degerler: set[int] = set()
    for parca in ifade.split(","):
        aralik, _, adim = parca.partition("/")
        if aralik == "*":
            bas, son = alt, ust
        elif "-" in aralik:
            bas, son = (int(x) for x in aralik.split("-", 1))
        else:
            bas = son = int(aralik)
        if not (alt <= bas <= son <= ust) or (adim and int(adim) < 1):
            raise ValueError(f"cron alanı geçersiz: {parca}")
        degerler.update(range(bas, son + 1, int(adim or 1)))
    return degerler


def parse_schedule(ifade: str) -> dict[str, Any]:
    ifade = ifade.strip().lower()
    if m := _SURE.match(ifade):
        return {"kind": "interval", "seconds": int(timedelta(**{_BIRIM[m[2]]: int(m[1])}).total_seconds())}
    parcalar = ifade.split()
    if len(parcalar) == 5:
        sinirlar = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 6)]
        alanlar = [sorted(_cron_alani(p, *s)) for p, s in zip(parcalar, sinirlar, strict=True)]
        return {"kind": "cron", "expr": ifade, "fields": alanlar}
    try:
        return {"kind": "once", "at": datetime.fromisoformat(ifade.upper().replace("Z", "")).isoformat()}
    except ValueError:
        raise ValueError(f"anlaşılmayan zaman ifadesi: {ifade!r}") from None


def compute_next_run(plan: dict[str, Any], sonra: datetime) -> datetime | None:
    if plan["kind"] == "interval":
        return sonra + timedelta(seconds=plan["seconds"])
    if plan["kind"] == "once":
        an = datetime.fromisoformat(plan["at"])
        return an if an > sonra else None
    dakika, saat, gun, ay, hgun = (set(a) for a in plan["fields"])
    aday = sonra.replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(366 * 24 * 60):  # en fazla bir yıl ileri bak
        if (
            aday.minute in dakika
            and aday.hour in saat
            and aday.day in gun
            and aday.month in ay
            and (aday.isoweekday() % 7) in hgun
        ):
            return aday
        aday += timedelta(minutes=1)
    return None


class JobStore:
    """jobs.json; süreç içi kilitle korunur (gerçekte ayrıca fcntl dosya kilidi)."""

    def __init__(self, home: Path):
        self.klasor = Path(home) / "cron"
        self.yol = self.klasor / "jobs.json"
        self._kilit = threading.Lock()

    def load(self) -> list[dict[str, Any]]:
        return json.loads(self.yol.read_text(encoding="utf-8")) if self.yol.exists() else []

    def save(self, isler: list[dict[str, Any]]) -> None:
        atomik_yaz(self.yol, json.dumps(isler, ensure_ascii=False, indent=2))

    def create(self, prompt: str, schedule: str, simdi: datetime, deliver: str | None = None, name: str = "") -> dict:
        plan = parse_schedule(schedule)
        sonraki = compute_next_run(plan, simdi)
        if sonraki is None:
            raise ValueError("bu zaman ifadesi bir daha hiç çalışmaz")
        is_ = {
            "id": uuid.uuid4().hex[:8],
            "name": name or prompt[:30],
            "prompt": prompt,
            "schedule": schedule,
            "plan": plan,
            "deliver": deliver,  # "telegram:12345" gibi; None ise yalnızca dosyaya yazılır
            "enabled": True,
            "next_run_at": sonraki.isoformat(),
            "last_run_at": None,
        }
        with self._kilit:
            self.save(self.load() + [is_])
        return is_

    def remove(self, job_id: str) -> bool:
        with self._kilit:
            isler = self.load()
            kalan = [i for i in isler if i["id"] != job_id]
            self.save(kalan)
        return len(kalan) != len(isler)


class CronScheduler:
    def __init__(self, store: JobStore, agent_factory: Callable[[dict[str, Any]], Any], deliver: Callable[..., bool]):
        self.store = store
        self.agent_factory = agent_factory  # iş → ajan (cron ajanları skip_memory=True ile kurulur)
        self.deliver = deliver

    def tick(self, simdi: datetime) -> list[dict[str, Any]]:
        with self.store._kilit:
            isler = self.store.load()
            gelenler = [i for i in isler if i["enabled"] and datetime.fromisoformat(i["next_run_at"]) <= simdi]
            for is_ in gelenler:  # 1) önce ilerlet ve KAYDET (en fazla bir kez)
                sonraki = compute_next_run(is_["plan"], simdi)
                is_["last_run_at"] = simdi.isoformat()
                is_["enabled"] = sonraki is not None  # tek seferlik iş tükenince kapanır
                is_["next_run_at"] = (sonraki or simdi).isoformat()
            self.store.save(isler)
        kayitlar = []
        for is_ in gelenler:  # 2) sonra çalıştır
            cikti = self.agent_factory(is_).chat(f"[Zamanlanmış görev: {is_['name']}]\n{is_['prompt']}")
            dosya = self.store.klasor / "output" / is_["id"] / f"{simdi.strftime('%Y%m%dT%H%M%S')}.md"
            atomik_yaz(dosya, cikti)
            teslim = False
            if is_["deliver"]:
                platform, _, chat_id = is_["deliver"].partition(":")
                teslim = self.deliver(platform, chat_id, cikti)
            kayitlar.append({"job_id": is_["id"], "output": cikti, "file": str(dosya), "delivered": teslim})
        return kayitlar


def _cronjob(args: dict[str, Any], cron_store: JobStore | None = None, now: datetime | None = None, **_: Any) -> Any:
    if cron_store is None:
        return tool_error("zamanlayıcı kapalı")
    if args.get("action") == "create":
        try:
            is_ = cron_store.create(args["prompt"], args["schedule"], now or datetime.now(), args.get("deliver"))
        except (KeyError, ValueError) as hata:
            return tool_error(str(hata))
        return {"success": True, "job_id": is_["id"], "next_run_at": is_["next_run_at"]}
    if args.get("action") == "list":
        return {
            "jobs": [{k: i[k] for k in ("id", "name", "schedule", "next_run_at", "enabled")} for i in cron_store.load()]
        }
    if args.get("action") == "remove":
        return {"success": cron_store.remove(args.get("job_id", ""))}
    return tool_error("action: create | list | remove")


registry.register(
    "cronjob",
    "cron",
    {
        "description": "Zamanlanmış görev kur/listele/sil. schedule: '30m', 'every 2h', '0 9 * * *' ya da ISO tarih.",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["create", "list", "remove"]},
                "prompt": {"type": "string"},
                "schedule": {"type": "string"},
                "deliver": {"type": "string", "description": "platform:chat_id"},
                "job_id": {"type": "string"},
            },
            "required": ["action"],
        },
    },
    _cronjob,
)
