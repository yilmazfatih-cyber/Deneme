"""Aşama 3 — Yürütücü: iş kuyruğu + veri akışı (dataflow) + sqlite'ta düğüm yürütme kayıtları.

Gerçek karşılığı: autogpt_platform/backend/backend/executor/manager.py
(ExecutionProcessor._on_graph_execution, _enqueue_next_nodes) ve data/execution.py
(ExecutionQueue, upsert_execution_input, AgentExecutionStatus).

Algoritma (gerçek sistemle aynı fikir, tek iş parçacığında):
  1. Başlangıç düğümleri kuyruğa girer.
  2. Kuyruktan bir düğüm alınır, bloğu çalıştırılır; her (pin, değer) çıktısı kaydedilir.
  3. Bu pine bağlı her bağlantı için hedef düğümün "en eski EKSİK (INCOMPLETE) yürütmesine"
     değer eklenir; yoksa yeni bir EKSİK yürütme açılır (upsert_execution_input).
  4. Hedefin bağlı tüm pinleri dolduysa yürütme KUYRUKTA (QUEUED) olur ve kuyruğa girer.
     Dolmadıysa beklemeye devam eder. Hiç değer almayan düğüm için yürütme kaydı hiç açılmaz;
     bazı girişleri gelmiş ama dal girişi (ör. Koşul'un üretmediği pin) gelmemiş düğüm ise
     sonsuza dek EKSİK kalır — dallanma budur.
  5. Bloktan ya da kimlik çözücüsünden gelen her hata o düğümü FAILED yapar ve 'error' pinine
     yazılır (bağlanabilir); graf yarıda kalmaz, kuyruğun geri kalanı işlenir.
Topolojik sıralama yoktur: sıra, verinin akışından doğar. Bir öğe listesi N kez "item"
ürettiğinde aşağı akışta N ayrı yürütme açılır (fan-out).
"""

from __future__ import annotations

import enum
import json
import sqlite3
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable

from asama1_blok import Block, BlockError, BlockType
from asama2_graf import DICT_SPLIT, LIST_SPLIT, Graph, Node, base_pin, validate_graph


class ExecutionStatus(str, enum.Enum):
    INCOMPLETE = "INCOMPLETE"  # bazı bağlı girişler henüz gelmedi
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


SEMA = """
CREATE TABLE IF NOT EXISTS graph_executions (
    id TEXT PRIMARY KEY, graph_id TEXT NOT NULL, user_id TEXT NOT NULL,
    status TEXT NOT NULL, inputs TEXT NOT NULL, started_at REAL, ended_at REAL);
CREATE TABLE IF NOT EXISTS node_executions (
    id TEXT PRIMARY KEY, graph_exec_id TEXT NOT NULL, node_id TEXT NOT NULL,
    status TEXT NOT NULL, error TEXT, input_data TEXT, added_at REAL, ended_at REAL);
CREATE TABLE IF NOT EXISTS node_io (
    node_exec_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('input', 'output')),
    name TEXT NOT NULL, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_node_exec ON node_executions (graph_exec_id, node_id, status);
"""


class ExecutionStore:
    """Yürütme kayıtlarının tek sahibi (gerçekte Prisma + PostgreSQL)."""

    def __init__(self, yol: str = ":memory:"):
        self.db = sqlite3.connect(yol)
        self.db.executescript(SEMA)

    def create_graph_execution(self, graph_id: str, user_id: str, inputs: dict[str, Any]) -> str:
        gex = str(uuid.uuid4())
        self.db.execute(
            "INSERT INTO graph_executions VALUES (?, ?, ?, ?, ?, ?, NULL)",
            (gex, graph_id, user_id, ExecutionStatus.RUNNING.value, _js(inputs), time.time()),
        )
        return gex

    def set_graph_status(self, gex: str, durum: ExecutionStatus) -> None:
        self.db.execute(
            "UPDATE graph_executions SET status = ?, ended_at = ? WHERE id = ?", (durum.value, time.time(), gex)
        )
        self.db.commit()

    def create_node_execution(self, gex: str, node_id: str, durum: ExecutionStatus) -> str:
        nex = str(uuid.uuid4())
        self.db.execute(
            "INSERT INTO node_executions VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL)",
            (nex, gex, node_id, durum.value, time.time()),
        )
        return nex

    def add_io(self, nex: str, tur: str, ad: str, deger: Any) -> None:
        self.db.execute("INSERT INTO node_io VALUES (?, ?, ?, ?)", (nex, tur, ad, _js(deger)))

    def inputs_of(self, nex: str) -> dict[str, Any]:
        satirlar = self.db.execute(
            "SELECT name, value FROM node_io WHERE node_exec_id = ? AND kind = 'input' ORDER BY rowid", (nex,)
        )
        return {ad: json.loads(deger) for ad, deger in satirlar}

    def set_node_status(
        self, nex: str, durum: ExecutionStatus, hata: str | None = None, veri: dict | None = None
    ) -> None:
        """KUYRUKTA'ya geçerken birleşik giriş (varsayılanlar + bağlantılar) input_data'ya yazılır."""
        bitti = time.time() if durum in (ExecutionStatus.COMPLETED, ExecutionStatus.FAILED) else None
        self.db.execute(
            "UPDATE node_executions SET status = ?, error = ?, ended_at = ?,"
            " input_data = COALESCE(?, input_data) WHERE id = ?",
            (durum.value, hata, bitti, _js(veri) if veri is not None else None, nex),
        )

    def upsert_execution_input(self, gex: str, node_id: str, ad: str, deger: Any) -> tuple[str, dict[str, Any]]:
        """Değeri, bu pini henüz almamış en eski EKSİK yürütmeye ekle; yoksa yenisini aç."""
        satir = self.db.execute(
            """SELECT ne.id FROM node_executions ne
               WHERE ne.graph_exec_id = ? AND ne.node_id = ? AND ne.status = 'INCOMPLETE'
                 AND NOT EXISTS (SELECT 1 FROM node_io io
                                 WHERE io.node_exec_id = ne.id AND io.kind = 'input' AND io.name = ?)
               ORDER BY ne.rowid LIMIT 1""",
            (gex, node_id, ad),
        ).fetchone()
        nex = satir[0] if satir else self.create_node_execution(gex, node_id, ExecutionStatus.INCOMPLETE)
        self.add_io(nex, "input", ad, deger)
        return nex, self.inputs_of(nex)

    def latest_input(self, gex: str, node_id: str, ad: str) -> tuple[bool, Any]:
        """Statik bağlantılar için: bu düğüme bu pinden en son gelen değer."""
        satir = self.db.execute(
            """SELECT io.value FROM node_io io JOIN node_executions ne ON ne.id = io.node_exec_id
               WHERE ne.graph_exec_id = ? AND ne.node_id = ? AND io.kind = 'input' AND io.name = ?
               ORDER BY io.rowid DESC LIMIT 1""",
            (gex, node_id, ad),
        ).fetchone()
        return (True, json.loads(satir[0])) if satir else (False, None)

    def incomplete_executions(self, gex: str, node_id: str) -> list[str]:
        satirlar = self.db.execute(
            "SELECT id FROM node_executions"
            " WHERE graph_exec_id = ? AND node_id = ? AND status = 'INCOMPLETE' ORDER BY rowid",
            (gex, node_id),
        )
        return [s[0] for s in satirlar]

    def node_executions(self, gex: str) -> list[dict[str, Any]]:
        satirlar = self.db.execute(
            "SELECT id, node_id, status, error FROM node_executions WHERE graph_exec_id = ? ORDER BY rowid", (gex,)
        ).fetchall()
        return [{"id": i, "node_id": n, "status": s, "error": e} for i, n, s, e in satirlar]


def _js(deger: Any) -> str:
    return json.dumps(deger, ensure_ascii=False, default=str)


def merge_dynamic_pins(veri: dict[str, Any]) -> dict[str, Any]:
    """'values_#_ad' ve 'items_$_0' gibi dinamik pinleri kök alana katlar (gerçek: dynamic_fields.py)."""
    sonuc: dict[str, Any] = {}
    for ad, deger in veri.items():
        if DICT_SPLIT in ad:
            kok, anahtar = ad.split(DICT_SPLIT, 1)
            sozluk = dict(sonuc.get(kok) or veri.get(kok) or {})
            sozluk[anahtar] = deger
            sonuc[kok] = sozluk
        elif LIST_SPLIT in ad:
            kok, sira = ad.split(LIST_SPLIT, 1)
            liste = list(sonuc.get(kok) or veri.get(kok) or [])
            sira_i = int(sira)
            liste.extend([None] * (sira_i + 1 - len(liste)))
            liste[sira_i] = deger
            sonuc[kok] = liste
        elif ad not in sonuc:
            sonuc[ad] = deger
    return sonuc


def extract_output(cikti_pini: str, deger: Any, kaynak_adi: str) -> tuple[bool, Any]:
    """Bağlantı 'result_#_anahtar' gibi bir alt değer istiyorsa onu çıkar."""
    if kaynak_adi == cikti_pini:
        return True, deger
    if base_pin(kaynak_adi) != cikti_pini:
        return False, None
    try:
        if DICT_SPLIT in kaynak_adi:
            return True, deger[kaynak_adi.split(DICT_SPLIT, 1)[1]]
        return True, deger[int(kaynak_adi.split(LIST_SPLIT, 1)[1])]
    except (KeyError, IndexError, TypeError, ValueError):
        return False, None


@dataclass
class ExecutionContext:
    """Bloğa run(**kwargs) ile verilen bağlam (gerçekte de ExecutionContext adıyla)."""

    user_id: str
    graph_exec_id: str
    node_id: str
    node_exec_id: str
    services: dict[str, Any] = field(default_factory=dict)


@dataclass
class GraphRunResult:
    graph_exec_id: str
    status: ExecutionStatus
    outputs: dict[str, list[Any]]
    errors: dict[str, str]


# Aşama 4 bu imzayla kimlik bilgisi çözücüsü verir: (blok, giriş, user_id) → run() için ek kwargs
CredentialsResolver = Callable[[Block, dict[str, Any], str], dict[str, Any]]


class Executor:
    def __init__(
        self,
        store: ExecutionStore | None = None,
        credentials_resolver: CredentialsResolver | None = None,
        services: dict[str, Any] | None = None,
    ):
        self.store = store or ExecutionStore()
        self.credentials_resolver = credentials_resolver
        self.services = services or {}

    def run(self, graf: Graph, inputs: dict[str, Any] | None = None, user_id: str = "kullanici-1") -> GraphRunResult:
        inputs = inputs or {}
        validate_graph(graf, for_run=True, inputs=inputs)
        gex = self.store.create_graph_execution(graf.id, user_id, inputs)
        kuyruk: deque[tuple[str, str, dict[str, Any]]] = deque()  # (node_exec_id, node_id, giriş)
        for dugum in graf.starting_nodes():
            veri = dict(dugum.input_default)
            if dugum.block.block_type == BlockType.INPUT and veri.get("name") in inputs:
                veri["value"] = inputs[veri["name"]]
            nex = self.store.create_node_execution(gex, dugum.id, ExecutionStatus.QUEUED)
            self.store.set_node_status(nex, ExecutionStatus.QUEUED, veri=veri)
            kuyruk.append((nex, dugum.id, veri))

        sonuc = GraphRunResult(gex, ExecutionStatus.RUNNING, {}, {})
        try:
            while kuyruk:  # gerçek sistemde düğümler paralel koşar; burada FIFO ve deterministik
                nex, node_id, veri = kuyruk.popleft()
                kuyruk.extend(self._execute_node(graf, gex, graf.node(node_id), nex, veri, user_id, sonuc))
        except BaseException:
            # Düğüm dışı beklenmeyen bir hata (ya da Ctrl+C): graf kaydı RUNNING'de asılı kalmasın.
            self.store.set_graph_status(gex, ExecutionStatus.FAILED)
            raise

        sonuc.status = ExecutionStatus.FAILED if sonuc.errors else ExecutionStatus.COMPLETED
        self.store.set_graph_status(gex, sonuc.status)
        return sonuc

    def _execute_node(self, graf, gex, dugum: Node, nex, veri, user_id, sonuc: GraphRunResult):
        blok = dugum.block
        self.store.set_node_status(nex, ExecutionStatus.RUNNING)
        sonrakiler: list[tuple[str, str, dict[str, Any]]] = []
        try:
            ek = self.credentials_resolver(blok, veri, user_id) if self.credentials_resolver else {}
            baglam = ExecutionContext(user_id, gex, dugum.id, nex, self.services)
            for pin, deger in blok.execute(merge_dynamic_pins(veri), execution_context=baglam, **ek):
                self.store.add_io(nex, "output", pin, deger)
                if blok.block_type == BlockType.OUTPUT and pin == "output":
                    sonuc.outputs.setdefault(veri["name"], []).append(deger)
                sonrakiler += self._enqueue_next_nodes(graf, gex, dugum, pin, deger)
            self.store.set_node_status(nex, ExecutionStatus.COMPLETED)
        except (BlockError, PermissionError, LookupError) as hata:
            # Block.execute, run()'dan çıkan her istisnayı BlockError'a çevirir; PermissionError ve
            # LookupError kimlik çözücüsünden gelir. Gerçek _on_node_execution BaseException yakalar.
            mesaj = str(hata)
            self.store.add_io(nex, "output", "error", mesaj)
            self.store.set_node_status(nex, ExecutionStatus.FAILED, mesaj)
            sonuc.errors[dugum.id] = mesaj
            sonrakiler += self._enqueue_next_nodes(graf, gex, dugum, "error", mesaj)  # hata pini bağlanabilir
        self.store.db.commit()
        return sonrakiler

    def _enqueue_next_nodes(self, graf: Graph, gex: str, dugum: Node, pin: str, deger: Any):
        hazir: list[tuple[str, str, dict[str, Any]]] = []
        for bag in dugum.output_links:
            var_mi, alt_deger = extract_output(pin, deger, bag.source_name)
            if not var_mi:
                continue
            hedef = graf.node(bag.sink_id)
            nex, girisler = self.store.upsert_execution_input(gex, hedef.id, bag.sink_name, alt_deger)
            adaylar = [(nex, girisler)]
            if bag.is_static:  # statik değer, onu bekleyen tüm eksik yürütmeleri de tamamlar
                adaylar += [
                    (x, self.store.inputs_of(x)) for x in self.store.incomplete_executions(gex, hedef.id) if x != nex
                ]
            for aday_nex, aday_giris in adaylar:
                for statik in (b for b in hedef.input_links if b.is_static and b.sink_name not in aday_giris):
                    bulundu, son = self.store.latest_input(gex, hedef.id, statik.sink_name)
                    if bulundu:
                        self.store.add_io(aday_nex, "input", statik.sink_name, son)
                        aday_giris[statik.sink_name] = son
                bagli_pinler = {b.sink_name for b in hedef.input_links}
                if bagli_pinler - set(aday_giris):
                    continue  # hâlâ beklenen bağlı pin var → EKSİK kalır
                tam = {**hedef.input_default, **aday_giris}
                self.store.set_node_status(aday_nex, ExecutionStatus.QUEUED, veri=tam)
                hazir.append((aday_nex, hedef.id, tam))
        return hazir
