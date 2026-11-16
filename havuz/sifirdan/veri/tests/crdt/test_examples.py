"""Somut senaryolar: beklenen değerler elle yazılmıştır (yakınsama tek başına "doğru sonuç" demek
değildir)."""

from __future__ import annotations

import copy

import pytest

from crdt import RGA, GCounter, LWWMap, LWWRegister, ORSet, PNCounter, Replica


def test_counters_never_lose_concurrent_increments() -> None:
    a, b = PNCounter("a"), PNCounter("b")
    a.increment(5)
    b.increment(3)
    b.decrement(1)
    a.merge(copy.deepcopy(b))
    b.merge(copy.deepcopy(a))
    assert a.value() == b.value() == 7
    with pytest.raises(ValueError, match="PNCounter"):
        GCounter("a").increment(-1)


def test_field_lww_loses_an_update_but_counter_does_not() -> None:
    """Kardeş temel `havuz/uygulama` alan düzeyinde son-yazan-kazanır kullanır. Aynı alanı iki
    cihaz çevrimdışıyken "okunan + 1" diye artırırsa artışlardan biri kaybolur; sayaç CRDT'si
    kaybetmez."""
    phone, laptop = LWWRegister("telefon"), LWWRegister("dizustu")
    phone.set(10)
    laptop.merge(copy.deepcopy(phone))
    phone.set(int(str(phone.value())) + 1)  # 11
    laptop.set(int(str(laptop.value())) + 1)  # 11 — eşzamanlı
    phone.merge(copy.deepcopy(laptop))
    assert phone.value() == 11  # iki artış vardı, biri kayboldu
    left, right = PNCounter("telefon"), PNCounter("dizustu")
    left.increment(10)
    right.merge(copy.deepcopy(left))
    left.increment()
    right.increment()
    left.merge(copy.deepcopy(right))
    assert left.value() == 12


def test_lww_ties_are_broken_by_replica_name_everywhere() -> None:
    a, b = LWWRegister("a"), LWWRegister("b")
    a.set("a'nın değeri")  # damga (1, "a")
    b.set("b'nin değeri")  # damga (1, "b") → büyük
    a.merge(copy.deepcopy(b))
    b.merge(copy.deepcopy(a))
    assert a.value() == b.value() == "b'nin değeri"


def test_lww_map_delete_and_later_write() -> None:
    a, b = LWWMap("a"), LWWMap("b")
    a.set("ad", "Ayşe")
    b.merge(copy.deepcopy(a))
    b.delete("ad")
    a.merge(copy.deepcopy(b))
    assert a.value() == {} and a.get("ad") is None
    a.set("ad", "Ali")  # silmeden SONRA (damgası büyük) yazma kazanır
    b.merge(copy.deepcopy(a))
    assert b.value() == {"ad": "Ali"}


def test_orset_add_wins_over_concurrent_remove() -> None:
    a, b = ORSet("a"), ORSet("b")
    a.add("elma")
    b.merge(copy.deepcopy(a))
    b.remove("elma")  # b yalnız a'nın İLK eklemesini gördü
    a.add("elma")  # eşzamanlı yeniden ekleme: yeni etiket
    a.merge(copy.deepcopy(b))
    b.merge(copy.deepcopy(a))
    assert "elma" in a and "elma" in b
    b.remove("elma")  # şimdi bütün etiketleri görüyor
    a.merge(copy.deepcopy(b))
    assert a.value() == set() == b.value()


def test_rga_concurrent_inserts_at_same_place_order_by_id() -> None:
    a = RGA("a")
    a.insert_text(0, "Hi")  # H(1,a) i(2,a)
    b = RGA("b")
    b.merge(copy.deepcopy(a))
    a.insert(1, "!")  # (3, a), H'den sonra
    b.insert(1, "?")  # (3, b), H'den sonra
    a.merge(copy.deepcopy(b))
    b.merge(copy.deepcopy(a))
    assert a.text() == b.text() == "H?!i"  # (3,b) > (3,a) > (2,a)


def test_rga_typing_sessions_do_not_interleave_characters() -> None:
    a, b = RGA("a"), RGA("b")
    a.insert_text(0, "Merhaba")
    b.merge(copy.deepcopy(a))
    a.insert_text(7, " dünya")  # a sona yazıyor
    b.insert_text(7, " Ankara")  # b de sona yazıyor (eşzamanlı)
    a.merge(copy.deepcopy(b))
    b.merge(copy.deepcopy(a))
    assert a.text() == b.text()
    assert a.text() in ("Merhaba dünya Ankara", "Merhaba Ankara dünya")  # harf harf karışmaz


def test_rga_delete_and_concurrent_insert_after_deleted_char() -> None:
    a = RGA("a")
    a.insert_text(0, "abc")
    b = RGA("b")
    b.merge(copy.deepcopy(a))
    a.delete(1)  # "b" silindi
    b.insert(2, "X")  # "b"den sonra X — ref, a'da silinmiş karaktere işaret ediyor
    a.merge(copy.deepcopy(b))
    b.merge(copy.deepcopy(a))
    assert a.text() == b.text() == "aXc"


def test_op_based_rga_with_causal_delivery_buffers_out_of_order_messages() -> None:
    a, b = Replica("a", RGA("a")), Replica("b", RGA("b"))
    first = a.record(a.crdt.insert(0, "x"))
    second = a.record(a.crdt.insert(1, "y"))  # first'e başvurur
    b.receive(second)  # önce ikinci gelir: beklemeye alınır
    assert b.crdt.text() == "" and len(b.buffer) == 1
    b.receive(first)
    b.receive(first)  # yineleme yok sayılır
    assert b.crdt.text() == "xy" and not b.buffer and b.applied == 2
    with pytest.raises(ValueError, match="nedensel"):
        RGA("c").apply(second.op)  # nedensel katman olmadan doğrudan uygulamak hatadır
