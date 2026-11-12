"""Aşama 2 — Grafik modu: bir Python fonksiyonunu izleyip (tracing) grafiğe çevirmek.

Gerçek karşılıkları:
  - tf.function:            tensorflow/python/eager/polymorphic_function/polymorphic_function.py
  - izleme + önbellek:      tensorflow/python/eager/polymorphic_function/tracing_compilation.py
  - FuncGraph:              tensorflow/python/framework/func_graph.py
  - grafik optimizasyonu:   tensorflow/core/grappler/optimizers/ (constant_folding.cc, model_pruner.cc)
  - grafik yürütücü:        tensorflow/core/common_runtime/executor.cc
"""

from __future__ import annotations

import contextlib

import numpy as np

from . import core


class Node:
    __slots__ = ("id", "graph", "opdef", "inputs", "attrs", "output")

    def __init__(self, id_, graph, opdef, inputs, attrs):
        self.id, self.graph, self.opdef, self.inputs, self.attrs = id_, graph, opdef, inputs, attrs
        self.output = None


class Graph:
    """Düğümler eklenme sırasıyla tutulur: bu sıra hem topolojik sıra hem de program sırasıdır.

    Program sırası önemlidir: değişken okuma/yazma gibi durumlu op'ların sırası korunur.
    TF bunu tf.function içinde otomatik kontrol bağımlılıklarıyla sağlar (framework/auto_control_deps.py).
    """

    def __init__(self, name="graph"):
        self.name = name
        self.nodes: list[Node] = []
        self.inputs: list[core.Tensor] = []
        self.outputs: list[core.Tensor] = []
        self._captures: dict[int, core.Tensor] = {}
        self._next_id = 0

    def add_node(self, opdef, inputs, attrs, shape):
        node = Node(self._next_id, self, opdef, [t.node for t in inputs], dict(attrs))
        self._next_id += 1
        self.nodes.append(node)
        if shape is not None:
            node.output = core.Tensor(shape=shape, node=node)
        return node.output

    def capture(self, t):
        """Dışarıdan gelen somut (eager) tensörü grafiğe Const düğümü olarak gömer.

        TF de küçük eager tensörleri (en çok 128 öğe) Const olarak gömer; büyükleri ve kaynakları
        Placeholder ek girdisi yapar (tensorflow/core/function/capture/capture_container.py). Her iki
        durumda yakalamayı etkin teyplere "captured_value" kimlik işlemi olarak kaydeder; mini de
        aynısını yapar, böylece fonksiyonun içindeki teyp dış tensöre göre gradyan alabilir.
        """
        if t.is_symbolic:
            if t.node.graph is not self:
                raise RuntimeError("Başka bir grafiğin sembolik tensörü kullanıldı.")
            return t
        if t.id not in self._captures:
            self._captures[t.id] = self.add_node(core.get_op("Const"), [], {"value": t.numpy()}, t.shape)
        captured = self._captures[t.id]
        for tape in list(core._tape_stack):  # yalnızca izlenen fonksiyonun içinde açılmış teypler
            tape._record_capture(t, captured)
        return captured

    def placeholder(self, shape, name):
        attrs = {"index": len(self.inputs), "name": name, "shape": tuple(shape)}
        t = self.add_node(core.get_op("Placeholder"), [], attrs, shape)
        self.inputs.append(t)
        return t

    @contextlib.contextmanager
    def as_default(self):
        core._graph_stack.append(self)
        saved_tapes = core._tape_stack[:]
        core._tape_stack.clear()  # dıştaki teypler sembolik op'ları kaydetmesin
        try:
            yield self
        finally:
            core._graph_stack.pop()
            core._tape_stack[:] = saved_tapes

    def as_text(self):
        lines = []
        for n in self.nodes:
            args = ", ".join(f"%{i.id}" for i in n.inputs)
            extra = {k: v for k, v in n.attrs.items() if k not in ("value", "var", "slot")}
            if n.opdef.name == "Const":
                extra = {"değer": np.array2string(np.asarray(n.attrs["value"]), precision=3)}
            if "var" in n.attrs:
                extra["var"] = n.attrs["var"].name
            lhs = f"%{n.id} = " if n.output is not None else "     "
            lines.append(f"{lhs}{n.opdef.name}({args}) {extra if extra else ''}".rstrip())
        lines.append("çıktılar: " + ", ".join(f"%{o.node.id}" for o in self.outputs))
        return "\n".join(lines)


# ---------------------------------------------------------------- optimizasyon geçişleri


def constant_fold(graph) -> int:
    """Tüm girdileri Const olan durumsuz düğümleri derleme anında hesaplar (Grappler ConstantFolding)."""
    folded = 0
    const = core.get_op("Const")
    for n in graph.nodes:  # topolojik sıra: zincirler tek geçişte katlanır
        if n.opdef.stateful or not n.inputs or n.opdef.name in ("Const", "Placeholder"):
            continue
        if all(i.opdef.name == "Const" for i in n.inputs):
            value = n.opdef.forward(*[i.attrs["value"] for i in n.inputs], **n.attrs)
            n.opdef, n.inputs, n.attrs = const, [], {"value": np.asarray(value)}
            folded += 1
    return folded


def prune(graph) -> int:
    """Çıktılara veya yan etkili düğümlere ulaşmayan düğümleri siler (Grappler ModelPruner)."""
    live = set()
    stack = [o.node for o in graph.outputs] + [n for n in graph.nodes if n.opdef.side_effect]
    while stack:
        n = stack.pop()
        if n.id in live:
            continue
        live.add(n.id)
        stack.extend(n.inputs)
    before = len(graph.nodes)
    graph.nodes = [n for n in graph.nodes if n.id in live or n.opdef.name == "Placeholder"]
    return before - len(graph.nodes)


# ---------------------------------------------------------------- yürütme


class ConcreteFunction:
    """Tek bir girdi imzası için izlenmiş grafik (TF: ConcreteFunction / AtomicFunction)."""

    def __init__(self, graph, structure, stats):
        self.graph, self._structure, self.stats = graph, structure, stats

    def __call__(self, *tensor_args):
        values = {}
        for n in self.graph.nodes:
            if n.opdef.name == "Placeholder":
                arg = np.asarray(core.convert_to_tensor(tensor_args[n.attrs["index"]]).numpy(), dtype=core.DTYPE)
                if arg.shape != n.attrs["shape"]:
                    raise ValueError(f"Girdi şekli {arg.shape}, beklenen {n.attrs['shape']}")
                values[n.id] = arg
            else:
                values[n.id] = n.opdef.forward(*[values[i.id] for i in n.inputs], **n.attrs)
        outs = [core.Tensor(values[o.node.id]) for o in self.graph.outputs]
        if self._structure == "none":
            return None
        if self._structure == "single":
            return outs[0]
        return tuple(outs)


def _is_tensor_like(a):
    return isinstance(a, (core.Tensor, np.ndarray))


class Function:
    """tf.function karşılığı: girdi imzası başına bir kez izler, sonra grafiği çalıştırır."""

    def __init__(self, fn, optimize=True):
        self._fn = fn
        self._optimize = optimize
        self._cache: dict[tuple, ConcreteFunction] = {}
        self.trace_count = 0

    def _signature(self, args):
        # Tensörler şekilleriyle, Python değerleri kendileriyle anahtara girer: yeni bir Python
        # sayısı yeni izleme demektir (TF'deki "retracing" uyarısının sebebi).
        sig = []
        for a in args:
            if _is_tensor_like(a):
                sig.append(("tensor", tuple(a.shape)))
            elif isinstance(a, core.Variable):
                sig.append(("var", id(a)))
            else:
                sig.append(("py", a))
        return tuple(sig)

    def get_concrete_function(self, *args):
        key = self._signature(args)
        if key not in self._cache:
            self._cache[key] = self._trace(args, key)
        return self._cache[key]

    def __call__(self, *args):
        cf = self.get_concrete_function(*args)
        return cf(*[a for a in args if _is_tensor_like(a)])

    def _trace(self, args, key):
        self.trace_count += 1
        graph = Graph(getattr(self._fn, "__name__", "fn"))
        with graph.as_default():
            sym_args = [
                graph.placeholder(sig[1], f"arg{i}") if sig[0] == "tensor" else a
                for i, (a, sig) in enumerate(zip(args, key))
            ]
            result = self._fn(*sym_args)
            if result is None:
                structure, flat = "none", []
            elif isinstance(result, (tuple, list)):
                structure, flat = "tuple", list(result)
            else:
                structure, flat = "single", [result]
            graph.outputs = [graph.capture(core.convert_to_tensor(r)) for r in flat]
        stats = {"düğüm_önce": len(graph.nodes), "katlanan": 0, "budanan": 0}
        if self._optimize:
            stats["katlanan"] = constant_fold(graph)
            stats["budanan"] = prune(graph)
        stats["düğüm_sonra"] = len(graph.nodes)
        return ConcreteFunction(graph, structure, stats)


def function(fn=None, *, optimize=True):
    """Dekoratör: @minitf.function veya @minitf.function(optimize=False)."""
    if fn is None:
        return lambda f: Function(f, optimize=optimize)
    return Function(fn, optimize=optimize)
