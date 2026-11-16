"""Raft iletileri ve kalıcı durum (Ongaro & Ousterhout 2014, Şekil 2'deki adlarla).

Kalıcı durum (`Storage`): currentTerm, votedFor, log. Bir düğüm çöküp yeniden başlayınca YALNIZ
bunlar kalır; commitIndex, lastApplied, lider tabloları gibi uçucu durum sıfırlanır. Günlük 1'den
sayılır: `log[0]` 1. girdidir; 0. "girdi"nin dönemi 0 kabul edilir.

Genişletme: anlık görüntü (snapshot) için `Storage`'a `snapshot_index`, `snapshot_term`, `snapshot`
alanları ve InstallSnapshot iletisi ekleyin; günlük dizinleri o noktadan kaydırılmalıdır.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Entry:
    term: int
    command: object  # None = lider olunca eklenen boş (no-op) girdi


@dataclass
class Storage:
    current_term: int = 0
    voted_for: int | None = None
    log: list[Entry] = field(default_factory=list)


@dataclass(frozen=True)
class RequestVote:
    term: int
    candidate: int
    last_log_index: int
    last_log_term: int


@dataclass(frozen=True)
class RequestVoteReply:
    term: int
    granted: bool


@dataclass(frozen=True)
class AppendEntries:
    term: int
    leader: int
    prev_index: int
    prev_term: int
    entries: tuple[Entry, ...]
    leader_commit: int


@dataclass(frozen=True)
class AppendEntriesReply:
    term: int
    success: bool
    match_index: int  # başarıda: eşleşen son dizin; başarısızlıkta: liderin geri çekileceği ipucu


Message = RequestVote | RequestVoteReply | AppendEntries | AppendEntriesReply
