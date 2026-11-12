# minitf — TensorFlow'un çekirdeğini sıfırdan yazmak

Bu klasör, TensorFlow'un üç temel fikrini numpy üzerinde küçük ve okunabilir biçimde yeniden kurar:

1. **Eager yürütme + GradientTape:** op'lar hemen çalışır; izlenen tensörlere dokunan her op bir "teybe"
   kaydedilir ve `gradient()` bu kaydı tersten oynatarak ters mod otomatik türev alır.
2. **Grafik modu (`tf.function` benzeri):** bir Python fonksiyonu sembolik tensörlerle bir kez _izlenir_
   (tracing), bir grafiğe dönüşür, optimize edilir (sabit katlama + ölü düğüm budama) ve sonra grafik
   yürütücüyle çalıştırılır. Girdi imzası değişince yeniden izlenir.
3. **Keras benzeri katman:** `Dense`, `Sequential`, MSE kaybı, SGD ve Adam (kaynaşık "Apply" op'larıyla),
   sentetik veride eğitim döngüsü. Eğitim adımının tamamı (ileri geçiş, teyp, gradyan, güncelleme) tek bir
   grafiğe izlenebilir.

Amaç özellik eşitliği değil, **mekanizmayı** görmektir. Gerçek TensorFlow'da aynı fikirler C++ çalışma
zamanı, binlerce çekirdek, Grappler/MLIR derleyici geçişleri ve XLA ile ölçeklenir.

## Gereksinimler

- Python 3.11+ ve numpy (başka bağımlılık yok, internet gerekmez).

## Çalıştırma

```bash
cd repo-atlasi/dallar/05-yapay-zeka-altyapisi/tensorflow/sifirdan
python3 ornek.py
```

Örnek çıktı (kısaltılmış):

```text
== Aşama 2: izleme (tracing) + optimizasyon ==
%0 = Placeholder() {'index': 0, 'name': 'arg0', 'shape': (3,)}
%3 = Const() {'değer': '6.'}
%5 = Mul(%0, %3)
%6 = Sum(%5) {'axis': None, 'keepdims': False}
çıktılar: %6
istatistik: {'düğüm_önce': 7, 'katlanan': 1, 'budanan': 3, 'düğüm_sonra': 4} | sonuç: 18.0
```

## Test

`sifirdan` klasörünün içinden (yukarıdaki `cd` ile):

```bash
python3 -m unittest discover -s . -t .
```

36 test: gradyanı olan her op'un (aritmetik, aktivasyonlar, `MatMul`, indirgemeler, `Transpose`, `Reshape`,
`BroadcastTo`, `SumToShape`) teyp gradyanı **sonlu farklarla** (merkezî fark, float64) karşılaştırılır; ikinci
türev iç içe teyple, kalıcı teyple ve `ReluGrad` üzerinden sınanır; izlenen grafiğin eager ile aynı sonucu verdiği,
imza başına bir kez izlendiği, sabit katlama/budamanın sonucu değiştirmediği, fonksiyonun içindeki teybin dış
tensörü izleyebildiği, sembolik tensörün `bool`'a çevrilemediği ve derlenmiş eğitim adımının eager adımla
**bit düzeyinde aynı** kayıpları ürettiği (`assert_array_equal`) doğrulanır.

## Aşamalar

| Aşama | Dosya             | Ne öğretir                                                                                          |
| ----- | ----------------- | --------------------------------------------------------------------------------------------------- |
| 1a    | `minitf/core.py`  | Op kaydı (ileri hesap + şekil fonksiyonu + gradyan), `execute()` tek giriş noktası, `Variable`      |
| 1b    | `minitf/tape.py`  | `GradientTape`: kayıt kuralı, ters sırada geri yayılım, birikim, kalıcı teyp, iç içe teyp           |
| 2     | `minitf/graph.py` | İzleme, `Placeholder`/`Const`, imza önbelleği, sabit katlama, budama, yan etkili düğümler, yürütücü |
| 3     | `minitf/keras.py` | Tembel `build`, Glorot başlatma, `SGD`/`Adam`, `make_train_step(compiled=True)`, `fit`              |

Önerilen okuma sırası: `core.py` → `tape.py` → `tests/test_tape.py` → `graph.py` → `tests/test_graph.py`
→ `keras.py` → `ornek.py`.

## Mini'deki parça ↔ gerçek depo

| Mini'deki parça                        | Gerçek depodaki karşılığı (dosya yolu)                                                                                                                                                                                                                                                                                                                                                                         | Fark                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `register_op("Add", shape_fn=...)`     | `tensorflow/core/ops/math_ops.cc` (`REGISTER_OP("AddV2")...SetShapeFn`)                                                                                                                                                                                                                                                                                                                                        | Gerçekte op imzası C++'ta, tip kısıtları ve öznitelikleriyle tanımlanır; Python sarmalayıcıları (`gen_math_ops`) derlemede üretilir.                                                                                                                               |
| ileri hesap (`lambda x, y: x + y`)     | `tensorflow/core/kernels/cwise_op_add_1.cc` (`REGISTER6(BinaryOp, CPU, "AddV2", ...)`)                                                                                                                                                                                                                                                                                                                         | Gerçekte cihaz × veri tipi başına ayrı çekirdek (CPU/GPU, Eigen/CUDA).                                                                                                                                                                                             |
| `register_gradient("Mul")`             | `tensorflow/python/ops/math_grad.py` (`@ops.RegisterGradient("Mul")`)                                                                                                                                                                                                                                                                                                                                          | Aynı fikir; gerçek sürüm yayınlama, karmaşık sayı, atlanabilir girdiler gibi ayrıntıları ele alır.                                                                                                                                                                 |
| `SumToShape` op'u                      | `math_grad.py` → `SmartBroadcastGradientArgs`, `BroadcastGradientArgs` op'u                                                                                                                                                                                                                                                                                                                                    | Mini tek op'ta topluyor.                                                                                                                                                                                                                                           |
| `execute()` (eager dal)                | Derlemede üretilen `gen_*_ops.py` (üreteç `tensorflow/python/framework/python_op_gen.cc`, `if tld.is_eager:`) → hızlı yol `TFE_Py_FastPathExecute` (`tensorflow/python/eager/pywrap_tfe_src.cc`) → `TFE_Execute` (`tensorflow/c/eager/c_api.cc`) → `EagerExecute` (`core/common_runtime/eager/execute.cc`); `tensorflow/python/eager/execute.py` yalnızca `*_eager_fallback` yolunda ve fonksiyon çağrılarında | Gerçekte çekirdek önbelleği, cihaz yerleşimi, asenkron yürütme var.                                                                                                                                                                                                |
| `GradientTape`                         | `tensorflow/python/eager/backprop.py`, `tape.py`, `imperative_grad.py`, C++: `tensorflow/c/eager/tape.h`                                                                                                                                                                                                                                                                                                       | Gerçek teyp C++'tadır; kullanım sayacı + hazır kuyruğu ile ilerler, `jacobian`/`batch_jacobian` ve ileri mod (`ForwardAccumulator`) da var.                                                                                                                        |
| `Function` / `function()`              | `tensorflow/python/eager/polymorphic_function/polymorphic_function.py`, `tracing_compilation.py`                                                                                                                                                                                                                                                                                                               | Gerçekte AutoGraph Python `if/for`'u grafik akışına çevirir (`autograph_util.py`); imza "TraceType" sistemiyle genelleştirilir.                                                                                                                                    |
| `Graph`, `Placeholder`, `capture`      | `tensorflow/python/framework/func_graph.py` (`FuncGraph`), `framework/ops.py` (`Graph`), `tensorflow/core/function/capture/capture_container.py`                                                                                                                                                                                                                                                               | TF küçük eager tensörleri (en çok 128 öğe) Const olarak gömer, büyükleri ve kaynakları Placeholder ek girdisi yapar; mini hepsini Const olarak gömer. İkisi de yakalamayı etkin teyplere kimlik işlemi olarak yazar (TF: `captured_value`, mini: `CapturedValue`). |
| `constant_fold`, `prune`               | `tensorflow/core/grappler/optimizers/constant_folding.cc`, `model_pruner.cc`, sırayı `meta_optimizer.cc` belirler                                                                                                                                                                                                                                                                                              | Grappler onlarca geçiş çalıştırır (aritmetik, yerleşim, bellek, yeniden eşleme); ayrıca MLIR tabanlı TFG geçişleri var.                                                                                                                                            |
| program sırası = yan etki sırası       | `tensorflow/python/framework/auto_control_deps.py`                                                                                                                                                                                                                                                                                                                                                             | TF durumlu op'lar arasına otomatik kontrol bağımlılıkları ekler; mini düğümleri ekleme sırasıyla yürütür.                                                                                                                                                          |
| `ConcreteFunction.__call__` (yürütücü) | `atomic_function.py` (`AtomicFunction.call_flat`) → eager çağrıda `context.call_function` → `execute.execute` → `EagerExecute` → `core/common_runtime/eager/kernel_and_device.cc` (`KernelAndDeviceFunc`) → `process_function_library_runtime.cc` → `executor.cc`; fonksiyon başka bir grafiğin içinden çağrılınca `make_call_op_in_graph` bir `(Stateful)PartitionedCall` op'u ekler                          | Gerçek yürütücü düğümleri paralel, cihazlara bölünmüş (partitioned) olarak çalıştırır. Mini iç içe `function` çağrısını desteklemez.                                                                                                                               |
| `ApplyGradientDescent`, `ApplyAdam`    | `tensorflow/core/ops/training_ops.cc` (`ResourceApplyGradientDescent`, `ResourceApplyAdam`), `core/kernels/training_ops.cc`                                                                                                                                                                                                                                                                                    | Aynı fikir: güncelleme tek bir durumlu, kaynaşık çekirdek. TF'de bunları `tf.compat.v1.train` optimize edicileri kullanır; Keras 3 güncellemeyi `assign_add`/`assign_sub` gibi ayrı op'larla yazar.                                                                |
| `Dense`, `Sequential`, `fit`           | Güncel Keras: ayrı depo (keras-team/keras). TF içindeki `tensorflow/python/keras/` eski ve "silinmek üzere" (oradaki README).                                                                                                                                                                                                                                                                                  | Mini'de geri çağrı, metrik, doğrulama, dağıtık eğitim yok.                                                                                                                                                                                                         |

## Bilerek dışarıda bırakılanlar

- Veri tipleri (yalnızca float64), cihazlar (GPU/TPU), asenkron yürütme, dağıtık strateji.
- AutoGraph (Python kontrol akışını grafik op'larına çevirme). Python değerli bir koşul (`if k > 0:`, `k` bir
  Python sayısı) izlemede bir kez çalışır ve seçilen dal grafiğe gömülür. Tensör koşulu (`if x:`) ise AutoGraph'sız
  TF'de `OperatorNotAllowedInGraphError` verir; mini de sembolik tensörü `bool`'a çevirmeyi reddeder
  (`Tensor.__bool__`, `RuntimeError`).
- Dışarıdaki teybin `function` çağrısını türevlemesi. TF bunu bir gradyan kaydıyla değil, teyp izlerken çağrıyı
  teybe tek bir işlem olarak yazarak yapar: `concrete_function.py` içinde `_select_forward_and_backward_functions`
  ileri/geri fonksiyonları üretir, `forward_backward.record` → `record.record_operation` geri fonksiyonu teybe yazar.
  Mini'de izleme sırasında dıştaki teypler susturulur; derlenmiş çağrı onlara hiç kaydedilmez.
- İç içe `function` çağrısı (TF'de iç fonksiyon `(Stateful)PartitionedCall` op'u olarak grafiğe girer).
- XLA derlemesi (`jit_compile=True`), SavedModel, `tf.data`.
