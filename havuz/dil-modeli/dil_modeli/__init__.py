"""Sıfırdan dil modeli temeli.

Bu paket küçük bir dil modelinin bütün yaşam döngüsünü içerir: tokenizer eğitimi,
LLaMA uyumlu çözücü model, eğitim döngüsü, metin üretimi, sohbet ince ayarı (LoRA),
dışa aktarım (Hugging Face, tarayıcı) ve OpenAI uyumlu sunucu.

Kullanım: `python -m dil_modeli --help`.
Genişletme: yeni bir modül eklerken AGENTS.md içindeki "Harita" tablosuna da ekleyin.
"""

__version__ = "0.1.0"
