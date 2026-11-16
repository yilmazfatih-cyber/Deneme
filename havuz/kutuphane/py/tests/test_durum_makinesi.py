"""durum_makinesi modülünün testi."""

from __future__ import annotations

import json
from typing import Any

import pytest

from kutuphane.durum_makinesi import MachineError, TransitionError, create_machine


def _order_machine() -> Any:
    return create_machine(
        {
            "initial": "taslak",
            "states": {
                "taslak": {"on": {"GONDER": "onayda", "IPTAL": "iptal"}},
                "onayda": {"on": {"ONAYLA": "hazirlaniyor", "REDDET": "taslak"}},
                "hazirlaniyor": {
                    "on": {
                        "KARGOLA": [
                            {
                                "target": "kargoda",
                                "guard": lambda c, _e: c["adres"] and c["odendi"],
                            },
                            {"target": "onayda", "guard": lambda c, _e: not c["odendi"]},
                        ]
                    }
                },
                "kargoda": {"final": True},
                "iptal": {"final": True},
            },
        }
    )


def test_transitions_and_final_states() -> None:
    machine = _order_machine()
    state = machine.transition(machine.initial, "GONDER")
    state = machine.transition(state, "ONAYLA")
    assert state == "hazirlaniyor"
    assert machine.transition(state, "KARGOLA", {"adres": True, "odendi": True}) == "kargoda"
    assert machine.transition(state, "KARGOLA", {"adres": True, "odendi": False}) == "onayda"
    assert machine.is_final("kargoda")
    assert machine.next_events("taslak") == ["GONDER", "IPTAL"]
    assert len(machine.states()) == 5


def test_invalid_transition_message() -> None:
    machine = _order_machine()
    with pytest.raises(TransitionError, match="GONDER, IPTAL"):
        machine.transition("taslak", "KARGOLA")
    assert not machine.can("hazirlaniyor", "KARGOLA", {"adres": False, "odendi": True})
    with pytest.raises(TransitionError, match=r"\(yok\)"):
        machine.transition("kargoda", "GONDER")


def test_definition_errors_and_json() -> None:
    with pytest.raises(MachineError):
        create_machine({"initial": "yok", "states": {"a": {}}})
    with pytest.raises(MachineError, match="böyle bir durum yok"):
        create_machine({"initial": "a", "states": {"a": {"on": {"GIT": "b"}}}})
    with pytest.raises(MachineError, match="son durum"):
        create_machine({"initial": "a", "states": {"a": {"final": True, "on": {"X": "a"}}}})
    from_json = create_machine(
        json.loads('{"initial":"a","states":{"a":{"on":{"GIT":"b"}},"b":{}}}')
    )
    assert from_json.transition("a", "GIT") == "b"


def test_mermaid() -> None:
    text = _order_machine().to_mermaid()
    assert text.splitlines()[0] == "stateDiagram-v2"
    assert "[*] --> taslak" in text
    assert "hazirlaniyor --> kargoda: KARGOLA [koşullu]" in text
    assert "kargoda --> [*]" in text
