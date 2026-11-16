"""Raft düğümü: olaylarla sürülen saf durum makinesi (saat ve ağ dışarıdan verilir → belirlenimci).

Girdiler: `tick(now)` (zamanlayıcılar), `receive(src, message, now)`, `propose(command)`.
Çıktılar: `send(dst, message)` geri çağrısı, `on_apply(index, entry)` (taahhüt edilen girdi
sırayla), `on_role(role, term)` (gözlemci: güvenlik denetimi için).

Kurallar (makaledeki Şekil 2):
- Daha büyük dönem gören herkes izleyici olur ve oyunu sıfırlar.
- Oy: dönem başına EN ÇOK bir oy; adayın günlüğü en az bizimki kadar güncel olmalı (son dönem,
  sonra boy).
- AppendEntries: prev_index/prev_term tutmazsa ret; tutarsa YALNIZ çatışan girdiden sonrasını kes,
  eksikleri ekle (eski/yinelenen ileti doğru girdileri silmesin).
- Lider, çoğunluğun sahip olduğu ve KENDİ dönemine ait en büyük dizini taahhüt eder (eski dönem
  girdileri dolaylı taahhüt edilir; "Şekil 8" hatasını önler). Lider olunca boş bir girdi ekler.

Genişletme: üyelik değişikliği (joint consensus) ve anlık görüntü burada yapılır; ikisi de güvenlik
testlerinin (tests/raft) yeni sürümlerini gerektirir.
"""

from __future__ import annotations

import random
from collections.abc import Callable
from dataclasses import dataclass

from .messages import (
    AppendEntries,
    AppendEntriesReply,
    Entry,
    Message,
    RequestVote,
    RequestVoteReply,
    Storage,
)

FOLLOWER, CANDIDATE, LEADER = "izleyici", "aday", "lider"


@dataclass(frozen=True)
class Timing:
    election_min: int = 150  # ms (sanal)
    election_max: int = 300
    heartbeat: int = 50
    max_batch: int = 32  # bir AppendEntries'te en çok girdi


DEFAULT_TIMING = Timing()


class RaftNode:
    def __init__(
        self,
        node_id: int,
        peers: list[int],
        storage: Storage,
        send: Callable[[int, Message], None],
        rng: random.Random,
        now: int,
        timing: Timing = DEFAULT_TIMING,
        on_apply: Callable[[int, Entry], None] | None = None,
        on_role: Callable[[str, int], None] | None = None,
    ) -> None:
        self.id = node_id
        self.peers = [p for p in peers if p != node_id]
        self.storage = storage
        self.send = send
        self.rng = rng
        self.timing = timing
        self.on_apply = on_apply or (lambda index, entry: None)
        self.on_role = on_role or (lambda role, term: None)
        self.role = FOLLOWER
        self.leader_id: int | None = None
        self.commit_index = 0
        self.last_applied = 0
        self.votes: set[int] = set()
        self.next_index: dict[int, int] = {}
        self.match_index: dict[int, int] = {}
        self.heartbeat_due = 0
        self.election_deadline = 0
        self._reset_election_timer(now)

    # ── Yardımcılar ─────────────────────────────────────────────────────────────────────────────

    @property
    def term(self) -> int:
        return self.storage.current_term

    @property
    def log(self) -> list[Entry]:
        return self.storage.log

    def last_index(self) -> int:
        return len(self.log)

    def term_at(self, index: int) -> int:
        return 0 if index == 0 else self.log[index - 1].term

    def majority(self) -> int:
        return (len(self.peers) + 1) // 2 + 1

    def _reset_election_timer(self, now: int) -> None:
        span = self.rng.randint(self.timing.election_min, self.timing.election_max)
        self.election_deadline = now + span

    def _step_down(self, term: int) -> None:
        if term > self.storage.current_term:
            self.storage.current_term = term
            self.storage.voted_for = None
        if self.role != FOLLOWER:
            self.role = FOLLOWER
            self.on_role(FOLLOWER, self.term)

    # ── Zamanlayıcılar ve seçim ─────────────────────────────────────────────────────────────────

    def tick(self, now: int) -> None:
        if self.role == LEADER:
            if now >= self.heartbeat_due:
                self._broadcast_append(now)
        elif now >= self.election_deadline:
            self._start_election(now)

    def _start_election(self, now: int) -> None:
        self.storage.current_term += 1
        self.storage.voted_for = self.id
        self.role = CANDIDATE
        self.leader_id = None
        self.votes = {self.id}
        self.on_role(CANDIDATE, self.term)
        self._reset_election_timer(now)
        request = RequestVote(
            self.term, self.id, self.last_index(), self.term_at(self.last_index())
        )
        for peer in self.peers:
            self.send(peer, request)
        if len(self.votes) >= self.majority():  # tek düğümlü küme
            self._become_leader(now)

    def _become_leader(self, now: int) -> None:
        self.role = LEADER
        self.leader_id = self.id
        self.on_role(LEADER, self.term)
        self.log.append(Entry(self.term, None))  # boş girdi: önceki dönemleri taahhüt ettirir
        self.next_index = {peer: self.last_index() for peer in self.peers}
        self.match_index = dict.fromkeys(self.peers, 0)
        self._advance_commit()
        self._broadcast_append(now)

    def _log_up_to_date(self, last_term: int, last_index: int) -> bool:
        mine = (self.term_at(self.last_index()), self.last_index())
        return (last_term, last_index) >= mine

    # ── İletiler ────────────────────────────────────────────────────────────────────────────────

    def receive(self, src: int, message: Message, now: int) -> None:
        if message.term > self.term:
            self._step_down(message.term)
            self.leader_id = None
        if isinstance(message, RequestVote):
            self._on_request_vote(src, message, now)
        elif isinstance(message, RequestVoteReply):
            self._on_vote_reply(src, message, now)
        elif isinstance(message, AppendEntries):
            self._on_append(src, message, now)
        else:
            self._on_append_reply(src, message, now)

    def _on_request_vote(self, src: int, message: RequestVote, now: int) -> None:
        grant = (
            message.term == self.term
            and self.storage.voted_for in (None, message.candidate)
            and self._log_up_to_date(message.last_log_term, message.last_log_index)
        )
        if grant:
            self.storage.voted_for = message.candidate  # yanıttan ÖNCE kalıcı
            self._reset_election_timer(now)
        self.send(src, RequestVoteReply(self.term, grant))

    def _on_vote_reply(self, src: int, message: RequestVoteReply, now: int) -> None:
        if self.role == CANDIDATE and message.term == self.term and message.granted:
            self.votes.add(src)
            if len(self.votes) >= self.majority():
                self._become_leader(now)

    def _on_append(self, src: int, message: AppendEntries, now: int) -> None:
        if message.term < self.term:
            self.send(src, AppendEntriesReply(self.term, False, 0))
            return
        if self.role != FOLLOWER:
            self._step_down(message.term)
        self.leader_id = message.leader
        self._reset_election_timer(now)
        if message.prev_index > self.last_index():
            self.send(src, AppendEntriesReply(self.term, False, self.last_index()))
            return
        if self.term_at(message.prev_index) != message.prev_term:
            # Çatışan dönemin İLK girdisini ipucu ver: lider bir turda bütün dönemi atlasın.
            conflict, first = self.term_at(message.prev_index), message.prev_index
            while first > 1 and self.term_at(first - 1) == conflict:
                first -= 1
            self.send(src, AppendEntriesReply(self.term, False, first - 1))
            return
        for offset, entry in enumerate(message.entries):
            index = message.prev_index + 1 + offset
            if index <= self.last_index():
                if self.term_at(index) == entry.term:
                    continue  # zaten var (yinelenen ya da eski ileti)
                del self.log[index - 1 :]  # çatışma: buradan sonrası geçersiz
            self.log.append(entry)
        match = message.prev_index + len(message.entries)
        if message.leader_commit > self.commit_index:
            self.commit_index = min(message.leader_commit, match)
            self._apply()
        self.send(src, AppendEntriesReply(self.term, True, match))

    def _on_append_reply(self, src: int, message: AppendEntriesReply, now: int) -> None:
        if self.role != LEADER or message.term != self.term:
            return
        if message.success:
            self.match_index[src] = max(self.match_index[src], message.match_index)
            self.next_index[src] = self.match_index[src] + 1
            self._advance_commit()
        else:
            self.next_index[src] = max(1, min(self.next_index[src] - 1, message.match_index + 1))
            self._send_append(src)

    # ── Çoğaltma ve taahhüt ─────────────────────────────────────────────────────────────────────

    def _send_append(self, peer: int) -> None:
        start = self.next_index[peer]
        entries = tuple(self.log[start - 1 : start - 1 + self.timing.max_batch])
        prev = start - 1
        self.send(
            peer,
            AppendEntries(self.term, self.id, prev, self.term_at(prev), entries, self.commit_index),
        )

    def _broadcast_append(self, now: int) -> None:
        for peer in self.peers:
            self._send_append(peer)
        self.heartbeat_due = now + self.timing.heartbeat

    def _advance_commit(self) -> None:
        for index in range(self.last_index(), self.commit_index, -1):
            if self.term_at(index) != self.term:
                break  # eski dönem girdisi sayarak taahhüt edilmez (Şekil 8)
            replicas = 1 + sum(match >= index for match in self.match_index.values())
            if replicas >= self.majority():
                self.commit_index = index
                self._apply()
                return

    def _apply(self) -> None:
        while self.last_applied < self.commit_index:
            self.last_applied += 1
            self.on_apply(self.last_applied, self.log[self.last_applied - 1])

    def propose(self, command: object) -> int | None:
        """Lider ise komutu günlüğe ekler ve dizinini döndürür; değilse None (istemci lideri
        bulsun)."""
        if self.role != LEADER:
            return None
        self.log.append(Entry(self.term, command))
        self._advance_commit()  # tek düğümlü küme hemen taahhüt eder
        return self.last_index()
