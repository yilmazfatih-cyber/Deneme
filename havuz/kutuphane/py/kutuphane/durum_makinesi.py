"""durum_makinesi — sonlu durum makinesi: hangi durumdan hangi olayla nereye gidileceği TEK bir tanımda durur;
geçersiz geçiş açık hata verir. Koşullu geçiş (guard), son durum, Mermaid diyagramı.

Kullanım:
    siparis = create_machine({
        "initial": "taslak",
        "states": {
            "taslak": {"on": {"GONDER": "onayda"}},
            "onayda": {"on": {"ONAYLA": "hazirlaniyor", "REDDET": "taslak"}},
            "hazirlaniyor": {"on": {"KARGOLA": {"target": "kargoda", "guard": lambda c, e: c["adres_var"]}}},
            "kargoda": {"final": True},
        },
    })
    durum = siparis.transition(siparis.initial, "GONDER")      # "onayda"
    siparis.can(durum, "KARGOLA")                              # False

Sınırlar: İç içe/paralel durum, eylem (action) ve zamanlayıcı yoktur; durumu saklamak çağıranın işidir (makine
saf işlevdir). Guard'lı seçeneklerde ilk tutan kazanır. Tanım JSON'dan da okunabilir (guard'sız).

Genişletme: Yeni bir özellik (ör. giriş/çıkış kancası) durum sözlüğüne anahtar olarak eklenir, kurucu denetimine ve
`transition`'a işlenir; TypeScript eşine (ts/src/durum_makinesi.ts) aynı ad ve davranışla eklenir.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

__all__ = ["Machine", "MachineError", "TransitionError", "create_machine"]

Guard = Callable[[Any, str], bool]


class MachineError(ValueError):
    """Tanım hatalı (olmayan duruma geçiş, başlangıç durumu yok…)."""


class TransitionError(ValueError):
    """Bu durumda bu olay geçersiz ya da koşulu tutmadı."""


@dataclass(frozen=True)
class _Option:
    target: str
    guard: Guard | None


def _options(value: Any) -> list[_Option]:
    items = value if isinstance(value, list | tuple) else [value]
    result: list[_Option] = []
    for item in items:
        if isinstance(item, str):
            result.append(_Option(item, None))
        elif isinstance(item, Mapping) and isinstance(item.get("target"), str):
            result.append(_Option(item["target"], item.get("guard")))
        else:
            raise MachineError(f"Geçiş hedefi metin ya da {{'target': ...}} olmalı: {item!r}.")
    return result


class Machine:
    """Tanımı denetlenmiş durum makinesi. Kendi durumunu tutmaz; `transition` yeni durumu döndürür."""

    def __init__(self, definition: Mapping[str, Any]) -> None:
        states = definition.get("states")
        if not isinstance(states, Mapping) or not states:
            raise MachineError('Tanımda "states" sözlüğü olmalı.')
        names = list(states)
        initial = definition.get("initial")
        if initial not in states:
            raise MachineError(
                f'Başlangıç durumu "{initial}" tanımlı değil. Tanımlı: {", ".join(names)}.'
            )
        for state, node in states.items():
            on = node.get("on") or {}
            if node.get("final") and on:
                raise MachineError(f'"{state}" son durum (final); ondan geçiş tanımlanamaz.')
            for event, value in on.items():
                for option in _options(value):
                    if option.target not in states:
                        raise MachineError(
                            f'"{state}" + {event} → "{option.target}": böyle bir durum yok.'
                        )
        self.initial: str = str(initial)
        self._states: Mapping[str, Any] = states

    def states(self) -> list[str]:
        """Tanımlı bütün durumlar."""
        return list(self._states)

    def is_final(self, state: str) -> bool:
        return bool(self._states.get(state, {}).get("final"))

    def next_events(self, state: str) -> list[str]:
        """Bu durumda tanımlı olaylar (guard'a bakmadan)."""
        return list((self._states.get(state, {}).get("on") or {}).keys())

    def _resolve(self, state: str, event: str, context: Any) -> str | None:
        node = self._states.get(state)
        if node is None:
            raise TransitionError(f'Bilinmeyen durum: "{state}".')
        value = (node.get("on") or {}).get(event)
        if value is None:
            return None
        for option in _options(value):
            if option.guard is None or option.guard(context, event):
                return option.target
        return None

    def can(self, state: str, event: str, context: Any = None) -> bool:
        """Olay uygulanabilir mi?"""
        return self._resolve(state, event, context) is not None

    def transition(self, state: str, event: str, context: Any = None) -> str:
        """Yeni durumu döndürür; geçiş yoksa ya da koşul tutmadıysa TransitionError fırlatır."""
        target = self._resolve(state, event, context)
        if target is None:
            allowed = ", ".join(self.next_events(state)) or "(yok)"
            raise TransitionError(
                f'"{state}" durumunda "{event}" uygulanamaz. Bu durumda geçerli olaylar: {allowed}.'
            )
        return target

    def to_mermaid(self) -> str:
        """Mermaid durum diyagramı metni (belgelere yapıştırmak için)."""
        lines = ["stateDiagram-v2", f"  [*] --> {self.initial}"]
        for state, node in self._states.items():
            for event, value in (node.get("on") or {}).items():
                for option in _options(value):
                    suffix = " [koşullu]" if option.guard else ""
                    lines.append(f"  {state} --> {option.target}: {event}{suffix}")
            if node.get("final"):
                lines.append(f"  {state} --> [*]")
        return "\n".join(lines)


def create_machine(definition: Mapping[str, Any]) -> Machine:
    """Tanımı denetleyip makine kurar (tanım hatalıysa MachineError)."""
    return Machine(definition)
