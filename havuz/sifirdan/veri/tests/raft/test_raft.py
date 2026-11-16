"""Raft: senaryolar (seçim, lider çökmesi, azınlık bölünmesi, tam yeniden başlama) ve kaos altında
güvenlik.

Güvenlik denetimleri benzetimin içinde her olayda koşar (raft/sim.py); bozulursa
SafetyViolationError fırlar.
"""

from __future__ import annotations

import pytest

import raft.node as node_module
from raft import LEADER, Cluster, SafetyViolationError
from raft.messages import AppendEntries, RequestVote, RequestVoteReply
from tests.raft.chaos import GENTLE, HARSH, Chaos, chaos_run
from tests.yardimci import seed_count


def _set(cluster: Cluster, key: str, value: str, seq: int) -> None:
    assert cluster.submit(("set", key, value, "test", seq))


def _leaders(cluster: Cluster) -> list[int]:
    return [i for i in cluster.alive if cluster.nodes[i].role == LEADER]


def test_election_and_replication() -> None:
    cluster = Cluster(5, seed=3)
    cluster.run(1000)
    assert len(_leaders(cluster)) == 1
    for seq in range(1, 11):
        _set(cluster, f"anahtar{seq}", f"değer{seq}", seq)
    cluster.run(300)
    assert all(len(cluster.machines[i].data) == 10 for i in cluster.ids)


def test_single_node_cluster_commits_alone() -> None:
    cluster = Cluster(1, seed=1)
    cluster.run(400)
    _set(cluster, "a", "1", 1)
    assert cluster.machines[0].data == {"a": "1"}


def test_leader_crash_elects_new_leader_and_old_one_catches_up() -> None:
    cluster = Cluster(5, seed=11)
    cluster.run(1000)
    old = cluster.leader()
    assert old is not None
    _set(cluster, "şehir", "İzmir", 1)
    cluster.run(200)
    old_term = cluster.nodes[old].term
    cluster.crash(old)
    cluster.run(1500)
    new = cluster.leader()
    assert new is not None and new != old and cluster.nodes[new].term > old_term
    _set(cluster, "şehir", "Ankara", 2)
    cluster.restart(old)
    cluster.run(1000)
    assert cluster.nodes[old].role != LEADER
    assert all(cluster.machines[i].data == {"şehir": "Ankara"} for i in cluster.ids)


def test_minority_leader_cannot_commit_and_its_entries_are_discarded() -> None:
    cluster = Cluster(5, seed=5)
    cluster.run(1000)
    old = cluster.leader()
    assert old is not None
    buddy = next(i for i in cluster.ids if i != old)
    majority = set(cluster.ids) - {old, buddy}
    cluster.partition({old, buddy}, majority)
    assert cluster.nodes[old].propose(("set", "kayıp", "azınlık", "test", 1)) is not None
    cluster.run(1500)
    assert all("kayıp" not in cluster.machines[i].data for i in cluster.ids)  # taahhüt yok
    new = cluster.leader()
    assert new in majority
    _set(cluster, "kalıcı", "çoğunluk", 2)
    cluster.run(300)
    cluster.heal()
    cluster.run(1500)
    for i in cluster.ids:
        assert cluster.machines[i].data == {"kalıcı": "çoğunluk"}
        assert all(
            entry.command != ("set", "kayıp", "azınlık", "test", 1)
            for entry in cluster.storage[i].log
        )


def test_full_restart_keeps_committed_data_and_terms() -> None:
    cluster = Cluster(3, seed=8)
    cluster.run(1000)
    for seq in range(1, 6):
        _set(cluster, f"k{seq}", str(seq), seq)
        cluster.run(100)
    terms = {i: cluster.storage[i].current_term for i in cluster.ids}
    for i in cluster.ids:
        cluster.crash(i)
    cluster.run(500)
    for i in cluster.ids:
        cluster.restart(i)  # yalnız Storage (disk) kaldı; durum makinesi günlükten yeniden kurulur
    cluster.run(1500)
    assert all(
        cluster.machines[i].data == {f"k{s}": str(s) for s in range(1, 6)} for i in cluster.ids
    )
    assert all(cluster.storage[i].current_term >= terms[i] for i in cluster.ids)


def test_safety_and_recovery_under_gentle_chaos() -> None:
    elections = requests = 0
    for seed in range(seed_count(10, 10)):
        cluster, clients = chaos_run(seed, GENTLE)
        cluster.check_logs()
        datas = [cluster.machines[i].data for i in cluster.ids]
        assert all(data == datas[0] for data in datas), f"tohum {seed}: kopyalar ayrı kaldı"
        assert datas[0] == clients.expected, f"tohum {seed}: onaylı istek kayıp/yinelenmiş"
        elections += len(cluster.leaders_by_term)
        requests += sum(clients.seq.values())
    assert requests > 10 * 20  # gerçekten iş yapıldı
    assert elections > 10 * 2  # kaos gerçekten yeni seçimler doğurdu


def test_safety_under_harsh_chaos() -> None:
    """Sık yeniden başlatma + seçim fırtınası: yalnız güvenlik (ihlal olursa SafetyViolationError
    fırlar)."""
    terms = 0
    for seed in range(seed_count(40, 40)):
        cluster, _ = chaos_run(seed, HARSH, recover=False)
        cluster.check_logs()
        terms += len(cluster.leaders_by_term)
    assert terms > 40 * 8  # ölçüm: tohum başına ~13 lider seçimi (gerçekten fırtına)


@pytest.mark.uzun
@pytest.mark.parametrize("block", range(10))
def test_safety_under_chaos_long(block: int) -> None:
    for seed in range(1000 + block * 20, 1000 + (block + 1) * 20):
        cluster, clients = chaos_run(seed, GENTLE)
        assert all(cluster.machines[i].data == clients.expected for i in cluster.ids)
    for seed in range(5000 + block * 100, 5000 + (block + 1) * 100):
        chaos_run(seed, HARSH, recover=False)


# ── Denetimin dişleri var mı? Bilerek bozulmuş Raft'lar YAKALANMALI. ──────────────────────────────


def _first_violation(chaos: Chaos, seeds: int) -> int:
    for seed in range(seeds):
        try:
            chaos_run(seed, chaos, recover=chaos is GENTLE)
        except SafetyViolationError:
            return seed
    raise AssertionError(f"{seeds} tohumda bozuk sürüm yakalanmadı")


def test_checker_catches_double_voting(monkeypatch: pytest.MonkeyPatch) -> None:
    """Oy verirken votedFor'u dikkate almayan düğüm aynı dönemde iki lider doğurur."""

    def careless_vote(self: node_module.RaftNode, src: int, message: RequestVote, now: int) -> None:
        grant = message.term == self.term and self._log_up_to_date(
            message.last_log_term, message.last_log_index
        )
        self.send(src, RequestVoteReply(self.term, grant))

    monkeypatch.setattr(node_module.RaftNode, "_on_request_vote", careless_vote)
    _first_violation(GENTLE, 30)


def test_checker_catches_vote_not_persisted(monkeypatch: pytest.MonkeyPatch) -> None:
    """votedFor diske yazılmasaydı: yeniden başlayan düğüm aynı dönemde ikinci kez oy verir."""
    original = Cluster.restart

    def forgetful_restart(self: Cluster, node_id: int) -> None:
        self.storage[node_id].voted_for = None
        original(self, node_id)

    monkeypatch.setattr(Cluster, "restart", forgetful_restart)
    _first_violation(HARSH, 200)


def test_checker_catches_blind_log_truncation(monkeypatch: pytest.MonkeyPatch) -> None:
    """İzleyici prev_index'ten sonrasını KOŞULSUZ silseydi, gecikmiş eski bir ileti taahhüt edilmiş
    girdileri silebilirdi."""
    original = node_module.RaftNode._on_append

    def blind(self: node_module.RaftNode, src: int, message: AppendEntries, now: int) -> None:
        if (
            message.term >= self.term
            and message.prev_index <= self.last_index()
            and self.term_at(message.prev_index) == message.prev_term
        ):
            del self.log[message.prev_index :]
        original(self, src, message, now)

    monkeypatch.setattr(node_module.RaftNode, "_on_append", blind)
    _first_violation(HARSH, 200)


@pytest.mark.uzun
def test_checker_catches_figure8_commit_rule(monkeypatch: pytest.MonkeyPatch) -> None:
    """Makalenin Şekil 8'i: eski dönem girdisini yalnız çoğunlukta diye taahhüt etmek güvensizdir.
    Boş (no-op) girdi de kapatılınca rastgele kaosta nadiren ama kesin yakalanır."""

    def unsafe_commit(self: node_module.RaftNode) -> None:
        for index in range(self.last_index(), self.commit_index, -1):
            if 1 + sum(m >= index for m in self.match_index.values()) >= self.majority():
                self.commit_index = index
                self._apply()
                return

    def no_noop(self: node_module.RaftNode, now: int) -> None:
        self.role = LEADER
        self.leader_id = self.id
        self.on_role(LEADER, self.term)
        self.next_index = {p: self.last_index() + 1 for p in self.peers}
        self.match_index = dict.fromkeys(self.peers, 0)
        self._broadcast_append(now)

    monkeypatch.setattr(node_module.RaftNode, "_advance_commit", unsafe_commit)
    monkeypatch.setattr(node_module.RaftNode, "_become_leader", no_noop)
    _first_violation(HARSH, 400)
