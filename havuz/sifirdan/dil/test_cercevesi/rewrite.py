"""assert yeniden yazımı: başarısız `assert a == b`'de iki tarafın DEĞERİNİ gösterebilmek için.

pytest'in yaptığının küçük hâli: test dosyası okunur, `ast` ile ayrıştırılır; işlev gövdelerindeki
her `assert` şu biçime çevrilir:  `assert (_tc_sol := a) == (_tc_sag := b), _tc_mesaj(...)`
Değerler bir kez hesaplanır (yan etki iki kez olmaz); ileti yalnız hata anında kurulur.
Sonra modül derlenip çalıştırılır. exec/compile bu dizinde YALNIZ burada kullanılır ve yalnız
kullanıcının kendi test dosyalarına uygulanır (tests/test_kurallar.py bunu denetler).
Genişletme: `and`/`or` zincirlerinde her parçayı göstermek için `visit_Assert`'e dal ekleyin.
"""

from __future__ import annotations

import ast
import difflib
import hashlib
import sys
import types
from pathlib import Path

SYMBOLS = {
    ast.Eq: "==", ast.NotEq: "!=", ast.Lt: "<", ast.LtE: "<=", ast.Gt: ">", ast.GtE: ">=",
    ast.Is: "is", ast.IsNot: "is not", ast.In: "in", ast.NotIn: "not in",
}  # fmt: skip


def short(value: object, limit: int = 200) -> str:
    text = repr(value)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def compare_message(op: str, left: object, right: object, source: str, extra: object) -> str:
    lines = [
        f"Beklenti tutmadı: {source}",
        f"  sol taraf: {short(left)}",
        f"  sağ taraf: {short(right)}",
    ]
    if op == "==":
        lines += explain_difference(left, right)
    if extra is not None:
        lines.append(f"  açıklama: {extra}")
    return "\n".join(lines)


def explain_difference(left: object, right: object) -> list[str]:
    if isinstance(left, str) and isinstance(right, str):
        if "\n" in left or "\n" in right:
            diff = difflib.ndiff(left.splitlines(), right.splitlines())
            return ["  satır farkı (- sol, + sağ):", *(f"    {d}" for d in diff if d[:1] in "-+")]
        for i, (a, b) in enumerate(zip(left, right, strict=False)):
            if a != b:
                return [f"  ilk fark: konum {i} ({a!r} ≠ {b!r})"]
        return [f"  uzunluklar farklı: {len(left)} ≠ {len(right)}"]
    if isinstance(left, (list, tuple)) and isinstance(right, (list, tuple)):
        for i, (a, b) in enumerate(zip(left, right, strict=False)):
            if a != b:
                return [f"  ilk farklı öğe: dizin {i} ({short(a, 60)} ≠ {short(b, 60)})"]
        return [f"  uzunluklar farklı: {len(left)} ≠ {len(right)}"]
    if isinstance(left, dict) and isinstance(right, dict):
        out = []
        missing, extra = right.keys() - left.keys(), left.keys() - right.keys()
        if missing:
            out.append(f"  solda olmayan anahtarlar: {sorted(map(repr, missing))}")
        if extra:
            out.append(f"  sağda olmayan anahtarlar: {sorted(map(repr, extra))}")
        changed = [k for k in left.keys() & right.keys() if left[k] != right[k]]
        if changed:
            out.append(f"  değeri farklı anahtarlar: {sorted(map(repr, changed))}")
        return out
    return []


def value_message(value: object, source: str, extra: object) -> str:
    lines = [f"Beklenti tutmadı: {source}", f"  değer: {short(value)}"]
    if extra is not None:
        lines.append(f"  açıklama: {extra}")
    return "\n".join(lines)


class AssertRewriter(ast.NodeTransformer):
    def __init__(self, source: str) -> None:
        self.source = source
        self.in_function = 0
        self.counter = 0

    def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.AST:
        self.in_function += 1
        self.generic_visit(node)
        self.in_function -= 1
        return node

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> ast.AST:
        self.in_function += 1
        self.generic_visit(node)
        self.in_function -= 1
        return node

    def visit_ClassDef(self, node: ast.ClassDef) -> ast.AST:
        saved, self.in_function = self.in_function, 0  # sınıf gövdesinde := kullanılamaz
        self.generic_visit(node)
        self.in_function = saved
        return node

    def name(self, stem: str) -> str:
        self.counter += 1
        return f"_tc_{stem}_{self.counter}"

    def visit_Assert(self, node: ast.Assert) -> ast.AST:
        if not self.in_function:
            return node
        text = ast.get_source_segment(self.source, node.test) or "<ifade>"
        extra = node.msg if node.msg is not None else ast.Constant(None)
        test = node.test
        if isinstance(test, ast.Compare) and len(test.ops) == 1 and type(test.ops[0]) in SYMBOLS:
            left, right = self.name("sol"), self.name("sag")
            new_test: ast.expr = ast.Compare(
                left=ast.NamedExpr(target=ast.Name(left, ast.Store()), value=test.left),
                ops=test.ops,
                comparators=[
                    ast.NamedExpr(target=ast.Name(right, ast.Store()), value=test.comparators[0])
                ],
            )
            message = ast.Call(
                func=ast.Name("_tc_compare_message", ast.Load()),
                args=[
                    ast.Constant(SYMBOLS[type(test.ops[0])]),
                    ast.Name(left, ast.Load()),
                    ast.Name(right, ast.Load()),
                    ast.Constant(text),
                    extra,
                ],
                keywords=[],
            )
        else:
            value = self.name("deger")
            new_test = ast.NamedExpr(target=ast.Name(value, ast.Store()), value=test)
            message = ast.Call(
                func=ast.Name("_tc_value_message", ast.Load()),
                args=[ast.Name(value, ast.Load()), ast.Constant(text), extra],
                keywords=[],
            )
        return ast.copy_location(ast.Assert(test=new_test, msg=message), node)


def load_module(path: Path) -> types.ModuleType:
    """Test dosyasını assert'leri yeniden yazarak yükler (benzersiz modül adıyla)."""
    source = path.read_text(encoding="utf-8")
    tree = AssertRewriter(source).visit(ast.parse(source, filename=str(path)))
    ast.fix_missing_locations(tree)
    digest = hashlib.sha256(str(path.resolve()).encode()).hexdigest()[:10]
    name = f"tc_{path.stem}_{digest}"
    module = types.ModuleType(name)
    module.__file__ = str(path)
    module.__dict__["_tc_compare_message"] = compare_message
    module.__dict__["_tc_value_message"] = value_message
    sys.modules[name] = module  # dataclass gibi araçlar modülü sys.modules'ta arar
    try:
        exec(compile(tree, str(path), "exec"), module.__dict__)
    except BaseException:
        sys.modules.pop(name, None)
        raise
    return module
