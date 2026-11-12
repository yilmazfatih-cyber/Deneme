"""Aşama 1 — GradientTape: ters mod otomatik türev (reverse-mode autodiff).

Gerçek karşılıkları:
  - Python yüzü: tensorflow/python/eager/backprop.py (class GradientTape)
  - Teyp yığını:  tensorflow/python/eager/tape.py
  - Geri yayılım: tensorflow/python/eager/imperative_grad.py -> C++ tensorflow/c/eager/tape.h
"""

from __future__ import annotations

import functools

from . import core


class _Entry:
    __slots__ = ("opdef", "inputs", "attrs", "out")

    def __init__(self, opdef, inputs, attrs, out):
        self.opdef, self.inputs, self.attrs, self.out = opdef, inputs, attrs, out


class GradientTape:
    """İzlenen tensörlere dokunan her op'u sırasıyla kaydeder; gradient() bu kaydı tersten oynatır."""

    def __init__(self, persistent=False, watch_accessed_variables=True):
        self.persistent = persistent
        self._watch_accessed = watch_accessed_variables
        self._entries: list[_Entry] = []
        self._watched_ids: set[int] = set()
        self._watched_vars: set[int] = set()
        self._var_reads: dict[int, list[int]] = {}  # id(değişken) -> o değişkenin okunduğu tensör id'leri
        self._used = False

    def __enter__(self):
        core._tape_stack.append(self)
        return self

    def __exit__(self, *exc):
        if self in core._tape_stack:  # kalıcı olmayan teyp gradient() içinde zaten çıkmış olabilir
            core._tape_stack.remove(self)
        return False

    def watch(self, x):
        if isinstance(x, core.Variable):
            self._watched_vars.add(id(x))
        else:
            self._watched_ids.add(x.id)

    def _record(self, opdef, inputs, attrs, out):
        """TF'deki 'ShouldRecord': girdilerden biri izleniyorsa op kayda girer, çıktısı da izlenir."""
        if opdef.name == "ReadVariable":
            var = attrs["var"]
            if (var.trainable and self._watch_accessed) or id(var) in self._watched_vars:
                self._watched_ids.add(out.id)
                self._var_reads.setdefault(id(var), []).append(out.id)
            return
        if any(t.id in self._watched_ids for t in inputs):
            self._entries.append(_Entry(opdef, inputs, attrs, out))
            self._watched_ids.add(out.id)

    def _record_capture(self, src, captured):
        """İzleme sırasında grafiğe gömülen dış tensörü (src) gömülü kopyasına (captured) bağlar.

        TF her yakalamayı etkin teyplere "captured_value" kimlik işlemi olarak kaydeder
        (tensorflow/python/framework/tensor.py, _record_tape); böylece fonksiyonun içindeki bir
        teyp dıştaki tensöre göre gradyan alabilir. Aynı bağ iki kez yazılmaz: gradyan çift sayılmasın.
        """
        if src.id in self._watched_ids and captured.id not in self._watched_ids:
            self._entries.append(_Entry(core.get_op("CapturedValue"), [src], {}, captured))
            self._watched_ids.add(captured.id)

    def gradient(self, target, sources):
        """d(toplam target)/d(source). Bağlantısız kaynak için None döner (TF: UnconnectedGradients.NONE)."""
        if self._used and not self.persistent:
            raise RuntimeError("Kalıcı olmayan (persistent=False) teyp yalnızca bir kez gradient() çağırabilir.")
        self._used = True
        single = not isinstance(sources, (list, tuple))
        sources = [sources] if single else list(sources)
        # Bağlamın içinde gradient() çağrılırsa TF (backprop.py) kalıcı olmayan teybi kalıcı olarak
        # durdurur (_pop_tape); kalıcı teyp ise kayda devam eder, böylece aynı teyple yüksek mertebe
        # türev alınabilir. Dıştaki teypler her durumda kaydetmeye devam eder (iç içe teyple ikinci türev).
        if not self.persistent and self in core._tape_stack:
            core._tape_stack.remove(self)
        grads = {target.id: core.ones_like(target)}
        # Kayıt sırası topolojik sıradır; tersten yürüyünce bir çıktının tüm tüketicileri
        # önceden işlenmiş olur, yani gradyanı tamamlanmıştır. (TF'nin C++ teybi bunu kullanım
        # sayaçları + hazır op listesiyle yapar: tape.h, ComputeGradient, op_stack; sonuç aynıdır.)
        # Liste kopyası üzerinde dönüyoruz: kayda devam eden kalıcı teyp bu sırada yeni kayıtlar ekleyebilir.
        for entry in reversed(list(self._entries)):
            g = grads.get(entry.out.id)
            if g is None:
                continue
            if entry.opdef.grad_fn is None:
                raise LookupError(f"'{entry.opdef.name}' op'u için kayıtlı gradyan yok.")
            in_grads = entry.opdef.grad_fn(entry.inputs, entry.out, g, **entry.attrs)
            for inp, ig in zip(entry.inputs, in_grads):
                if ig is None:
                    continue
                prev = grads.get(inp.id)
                grads[inp.id] = ig if prev is None else core.add(prev, ig)
        result = []
        for s in sources:
            if isinstance(s, core.Variable):
                parts = [grads[i] for i in self._var_reads.get(id(s), []) if i in grads]
                result.append(functools.reduce(core.add, parts) if parts else None)
            else:
                result.append(grads.get(s.id))
        return result[0] if single else result
