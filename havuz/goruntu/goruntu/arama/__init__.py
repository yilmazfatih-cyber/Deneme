"""Görüntü gömme ve arama: benzer görüntüler, metinle arama, sıfır atışlı sınıflandırma, recall@k.

Modüller:
- `embedders.py` : gömme modelleri — CLIP / SigLIP 2 (transformers) ve modelsiz renk-doku histogramı.
- `index.py`     : normalize vektörlerle numpy kaba kuvvet dizin + diske kaydetme/yükleme.
- `zero_shot.py` : etiket istemleriyle sıfır atışlı sınıflandırma.
- `evaluate.py`  : recall@k (görüntü→görüntü ve metin→görüntü).
Torch yalnız transformers modeli kullanılınca yüklenir; histogram gömmesi yalnız numpy + pillow ister.

Genişletme: yeni bir gömme modeli ailesi için `embedders.py` içine `Embedder` arayüzünü sağlayan
bir sınıf yazın ve `make_embedder` içine dal ekleyin.
"""
