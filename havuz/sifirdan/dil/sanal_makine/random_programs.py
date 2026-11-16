"""Farksal test için rastgele Tohum ifadesi ve programı üreteci (tohumlu, belirlenimci).

`random_expression`: her türden değer ve her işleçle karışık ifade (çoğu çalışma hatası verir —
iki arka ucun AYNI hatayı vermesi de sınanır). `random_program`: kapsamı doğru, her zaman biten
programlar: iç içe bloklar, döngüler, kır/devam, işlevler, kapanımlar (döngü değişkenini yakalayan
dahil), listeler. Özyineleme üretilmez (işlev yalnız kendinden önce tanımlananları çağırır).
Kullanan: tests/sanal_makine/test_sanal_makine_farksal.py.
Genişletme: yeni bir dil özelliği eklediğinizde buraya onu üreten bir dal ekleyin; farksal test
iki arka ucun yeni özellikte de aynı davrandığını kendiliğinden denetler.
"""

from __future__ import annotations

import random

STRINGS = ['"a"', '"ğü"', '""', '"İı"', '"12"']
INFIX = ["+", "-", "*", "/", "%", "**", "==", "!=", "<", "<=", ">", ">=", "ve", "veya"]


def random_atom(rng: random.Random) -> str:
    kind = rng.randrange(6)
    if kind == 0:
        return str(rng.choice([0, 1, 2, 3, 7, 10, 255]))
    if kind == 1:
        return rng.choice(["0.5", "2.25", "1.0", "3.5e2"])
    if kind == 2:
        return rng.choice(STRINGS)
    if kind == 3:
        return rng.choice(["doğru", "yanlış", "yok"])
    if kind == 4:
        return rng.choice(["[]", "[1, 2]", '["x"]'])
    return rng.choice(["{}", '{"a": 1}'])


def random_expression(rng: random.Random, depth: int = 3) -> str:
    """Her türü ve her işleci karıştıran ifade; çoğu zaman bilerek hatalıdır."""
    if depth <= 0 or rng.random() < 0.2:
        return random_atom(rng)

    def sub() -> str:
        return random_expression(rng, depth - 1)

    kind = rng.randrange(8)
    if kind <= 1:
        return f"({sub()} {rng.choice(INFIX)} {sub()})"
    if kind == 2:
        return f"({rng.choice(['-', 'değil '])}{sub()})"
    if kind == 3:
        return f"[{sub()}, {sub()}]"
    if kind == 4:
        return f'{{"k": {sub()}, {sub()}: 1}}'
    if kind == 5:
        return f"{sub()}[{sub()}]"
    if kind == 6:
        fn = rng.choice(["uzunluk", "metin", "tür", "mutlak", "taban", "sırala", "sayı", "dolaş"])
        return f"{fn}({sub()})"
    return f"işlev(x) {{ döndür x {rng.choice(INFIX)} {sub()} }}({sub()})"


class ProgramGenerator:
    """Kapsamı izleyerek yalnız görünür adları kullanan program üretir."""

    def __init__(self, rng: random.Random) -> None:
        self.rng = rng
        self.scopes: list[dict[str, str]] = [{}]  # ad -> tür: num, list, func2, closure
        self.counter = 0
        self.loop_depth = 0
        self.fn_depth = 0
        self.lines: list[str] = []

    # --- yardımcılar ---------------------------------------------------------
    def fresh(self, prefix: str) -> str:
        self.counter += 1
        return f"{prefix}{self.counter}"

    def visible(self, kind: str) -> list[str]:
        return [n for scope in self.scopes for n, k in scope.items() if k == kind]

    def declare(self, name: str, kind: str) -> None:
        self.scopes[-1][name] = kind

    def emit(self, indent: int, text: str) -> None:
        self.lines.append("    " * indent + text)

    # --- ifadeler ------------------------------------------------------------
    def num(self, depth: int = 2) -> str:
        rng = self.rng
        if depth <= 0 or rng.random() < 0.35:
            names = self.visible("num")
            if names and rng.random() < 0.7:
                return rng.choice(names)
            return str(rng.randint(0, 9))
        kind = rng.randrange(6)
        lists, funcs, closures = (
            self.visible("list"),
            self.visible("func2"),
            self.visible("closure"),
        )
        if kind == 1 and lists:
            name = rng.choice(lists)
            return f"uzunluk({name})" if rng.random() < 0.5 else f"{name}[{rng.randint(-2, 2)}]"
        if kind == 2 and funcs:
            return f"{rng.choice(funcs)}({self.num(depth - 1)}, {self.num(depth - 1)})"
        if kind == 3 and closures:
            return f"{rng.choice(closures)}()"
        if kind == 4:
            return f"({self.num(depth - 1)} {rng.choice(['%', '/'])} {rng.randint(1, 4)})"
        if kind == 5:
            return f"taban({self.num(depth - 1)} / {rng.randint(1, 3)})"
        op = rng.choice(["+", "-", "*"])
        return f"({self.num(depth - 1)} {op} {self.num(depth - 1)})"

    def cond(self, depth: int = 2) -> str:
        rng = self.rng
        kind = rng.randrange(5)
        if depth > 0 and kind == 0:
            return f"değil ({self.cond(depth - 1)})"
        if depth > 0 and kind == 1:
            word = rng.choice(["ve", "veya"])
            return f"({self.cond(depth - 1)} {word} {self.cond(depth - 1)})"
        lists = self.visible("list")
        if kind == 2 and lists:
            return f"içerir({rng.choice(lists)}, {self.num(1)})"
        op = rng.choice(["<", "<=", ">", ">=", "==", "!="])
        return f"{self.num(1)} {op} {self.num(1)}"

    # --- deyimler ------------------------------------------------------------
    def block(self, indent: int, budget: int) -> None:
        self.scopes.append({})
        for _ in range(self.rng.randint(1, 3)):
            self.statement(indent, budget - 1)
        self.scopes.pop()

    def statement(self, indent: int, budget: int) -> None:
        kinds = ["decl", "print", "assign", "list", "call"]
        if budget > 0:
            kinds += ["if", "for", "while", "func", "closure", "capture"]
        if self.loop_depth:
            kinds += ["jump"]
        if self.fn_depth:
            kinds += ["return"]
        handlers = {
            "decl": self.st_decl,
            "print": self.st_print,
            "assign": self.st_assign,
            "list": self.st_list,
            "if": self.st_if,
            "for": self.st_for,
            "while": self.st_while,
            "func": self.st_func,
            "closure": self.st_closure,
            "capture": self.st_capture,
            "jump": self.st_jump,
            "call": self.st_call,
            "return": self.st_return,
        }
        handlers[self.rng.choice(kinds)](indent, budget)

    def st_decl(self, indent: int, budget: int) -> None:
        name = self.fresh("v")
        self.emit(indent, f"değişken {name} = {self.num()}")
        self.declare(name, "num")

    def st_print(self, indent: int, budget: int) -> None:
        self.emit(indent, f"yazdır({self.num()}, {self.cond(1)})")

    def st_call(self, indent: int, budget: int) -> None:
        funcs, closures = self.visible("func2"), self.visible("closure")
        if funcs and (not closures or self.rng.random() < 0.6):
            self.emit(indent, f"yazdır({self.rng.choice(funcs)}({self.num(1)}, {self.num(1)}))")
        elif closures:
            self.emit(indent, f"yazdır({self.rng.choice(closures)}())")
        else:
            self.st_print(indent, budget)

    def st_assign(self, indent: int, budget: int) -> None:
        names = self.visible("num")
        if not names:
            self.st_decl(indent, budget)
            return
        op = self.rng.choice(["=", "+=", "-=", "*="])
        self.emit(indent, f"{self.rng.choice(names)} {op} {self.num()}")

    def st_list(self, indent: int, budget: int) -> None:
        lists = self.visible("list")
        if not lists or self.rng.random() < 0.3:
            name = self.fresh("l")
            self.emit(indent, f"değişken {name} = [{self.num(1)}, {self.num(1)}]")
            self.declare(name, "list")
            return
        name = self.rng.choice(lists)
        kind = self.rng.randrange(3)
        if kind == 0:
            self.emit(indent, f"ekle({name}, {self.num(1)})")
        elif kind == 1:
            op = self.rng.choice(["=", "+="])
            self.emit(indent, f"{name}[{self.rng.randint(-2, 3)}] {op} {self.num(1)}")
        else:
            self.emit(indent, f"yazdır({name})")

    def st_if(self, indent: int, budget: int) -> None:
        self.emit(indent, f"eğer {self.cond()} {{")
        self.block(indent + 1, budget)
        if self.rng.random() < 0.5:
            self.emit(indent, "} değilse {")
            self.block(indent + 1, budget)
        self.emit(indent, "}")

    def st_for(self, indent: int, budget: int) -> None:
        var = self.fresh("i")
        self.emit(indent, f"için {var} içinde aralık({self.rng.randint(0, 4)}) {{")
        self.scopes.append({var: "num"})
        self.loop_depth += 1
        self.block(indent + 1, budget)
        self.loop_depth -= 1
        self.scopes.pop()
        self.emit(indent, "}")

    def st_while(self, indent: int, budget: int) -> None:
        counter = self.fresh("c")
        self.emit(indent, f"değişken {counter} = 0")
        self.declare(
            counter, "counter"
        )  # "num" değil: rastgele atama sayacı bozup döngüyü sonsuz yapmasın
        self.emit(indent, f"iken {counter} < {self.rng.randint(1, 4)} {{")
        self.emit(indent + 1, f"{counter} += 1")
        self.loop_depth += 1
        self.block(indent + 1, budget)
        self.loop_depth -= 1
        self.emit(indent, "}")

    def st_jump(self, indent: int, budget: int) -> None:
        word = self.rng.choice(["kır", "devam"])
        self.emit(indent, f"eğer {self.cond(1)} {{ {word} }}")

    def st_return(self, indent: int, budget: int) -> None:
        self.emit(indent, f"eğer {self.cond(1)} {{ döndür {self.num(1)} }}")

    def st_func(self, indent: int, budget: int) -> None:
        name, a, b = self.fresh("f"), self.fresh("p"), self.fresh("p")
        self.emit(indent, f"işlev {name}({a}, {b}) {{")
        saved_loop, self.loop_depth = self.loop_depth, 0
        self.fn_depth += 1
        self.scopes.append({a: "num", b: "num"})
        self.block(indent + 1, budget)
        self.emit(indent + 1, f"döndür {self.num()}")
        self.scopes.pop()
        self.fn_depth -= 1
        self.loop_depth = saved_loop
        self.emit(indent, "}")
        self.declare(name, "func2")

    def st_closure(self, indent: int, budget: int) -> None:
        maker, state, made = self.fresh("mk"), self.fresh("s"), self.fresh("k")
        self.emit(indent, f"işlev {maker}() {{")
        self.emit(indent + 1, f"değişken {state} = {self.num(1)}")
        self.emit(indent + 1, f"döndür işlev() {{ {state} += 1; döndür {state} }}")
        self.emit(indent, "}")
        self.emit(indent, f"değişken {made} = {maker}()")
        self.declare(made, "closure")

    def st_capture(self, indent: int, budget: int) -> None:
        funcs, var, cell, g = self.fresh("fs"), self.fresh("i"), self.fresh("w"), self.fresh("g")
        self.emit(indent, f"değişken {funcs} = []")
        self.emit(indent, f"için {var} içinde aralık({self.rng.randint(2, 4)}) {{")
        self.emit(indent + 1, f"değişken {cell} = {var} * {self.rng.randint(1, 5)}")
        self.emit(indent + 1, f"ekle({funcs}, işlev() {{ {cell} += 1; döndür {cell} + {var} }})")
        if self.rng.random() < 0.5:
            word = self.rng.choice(["kır", "devam"])
            self.emit(indent + 1, f"eğer {var} == {self.rng.randint(0, 2)} {{ {word} }}")
        self.emit(indent, "}")
        self.emit(indent, f"için {g} içinde {funcs} {{ yazdır({g}(), {g}()) }}")


def random_program(rng: random.Random, statements: int = 8, budget: int = 3) -> str:
    """Tek bir rastgele program (kaynak metin) üretir."""
    gen = ProgramGenerator(rng)
    for _ in range(statements):
        gen.statement(0, budget)
    return "\n".join(gen.lines) + "\n"
