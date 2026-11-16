"""Minik rastgele modeller: ağdan hiçbir şey indirmeden bütün hattı saniyeler içinde koşturur.

Kim kullanır: `cpu-deneme` hazır ayarı (`taban = "minik-rastgele"`) ve çevrimdışı testler.
Tokenizer verilen metinlerden o anda eğitilir; model ağırlıkları tohumlu rastgeledir. Bu modeller
**hiçbir şey öğrenmez**; amaç yalnız hattın (veri → eğitim → değerlendirme → dışa aktarım)
kırılmadığını görmektir.

- Sohbet: ChatML şablonlu bayt düzeyi BPE tokenizer + 2 katmanlı Llama mimarisi.
- Kodlayıcı: WordPiece tokenizer + 2 katmanlı BERT (sınıflandırma, gömme, varlık tanıma).

Genişletme: başka bir mimariyle denemek için `create_tiny_encoder` işlevini kopyalayıp yapılandırma
sınıfını değiştirin.
"""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Any

# ChatML: SmolLM2, Qwen ve birçok küçük sohbet modelinin kullandığı biçim.
CHATML_TEMPLATE = (
    "{% for message in messages %}"
    "{{ '<|im_start|>' + message['role'] + '\n' + message['content'] + '<|im_end|>' + '\n' }}"
    "{% endfor %}"
    "{% if add_generation_prompt %}{{ '<|im_start|>assistant\n' }}{% endif %}"
)
CHAT_SPECIALS = ["<|endoftext|>", "<|im_start|>", "<|im_end|>"]
ENCODER_SPECIALS = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"]


def train_chat_tokenizer(texts: Iterable[str], vocab_size: int = 384) -> Any:
    """Bayt düzeyi BPE tokenizer eğitir ve ChatML şablonunu takar."""
    from tokenizers import Tokenizer, decoders, models, pre_tokenizers, trainers
    from transformers import PreTrainedTokenizerFast

    tokenizer = Tokenizer(models.BPE())
    tokenizer.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    tokenizer.decoder = decoders.ByteLevel()
    trainer = trainers.BpeTrainer(
        vocab_size=vocab_size,
        special_tokens=CHAT_SPECIALS,
        initial_alphabet=pre_tokenizers.ByteLevel.alphabet(),
        show_progress=False,
    )
    tokenizer.train_from_iterator(list(texts), trainer)
    fast = PreTrainedTokenizerFast(
        tokenizer_object=tokenizer,
        eos_token="<|im_end|>",
        pad_token="<|endoftext|>",
        unk_token="<|endoftext|>",
        additional_special_tokens=["<|im_start|>"],
    )
    fast.chat_template = CHATML_TEMPLATE
    return fast


def train_encoder_tokenizer(texts: Iterable[str], vocab_size: int = 384) -> Any:
    """BERT tarzı WordPiece tokenizer eğitir ([CLS] metin [SEP]). Harf büyüklüğüne dokunmaz."""
    from tokenizers import Tokenizer, decoders, models, normalizers, pre_tokenizers, processors, trainers
    from transformers import PreTrainedTokenizerFast

    tokenizer = Tokenizer(models.WordPiece(unk_token="[UNK]"))
    tokenizer.normalizer = normalizers.NFC()
    tokenizer.pre_tokenizer = pre_tokenizers.BertPreTokenizer()
    tokenizer.decoder = decoders.WordPiece()
    trainer = trainers.WordPieceTrainer(
        vocab_size=vocab_size, special_tokens=ENCODER_SPECIALS, show_progress=False
    )
    tokenizer.train_from_iterator(list(texts), trainer)
    cls_id, sep_id = tokenizer.token_to_id("[CLS]"), tokenizer.token_to_id("[SEP]")
    tokenizer.post_processor = processors.TemplateProcessing(
        single="[CLS] $A [SEP]",
        pair="[CLS] $A [SEP] $B:1 [SEP]:1",
        special_tokens=[("[CLS]", cls_id), ("[SEP]", sep_id)],
    )
    return PreTrainedTokenizerFast(
        tokenizer_object=tokenizer,
        pad_token="[PAD]",
        unk_token="[UNK]",
        cls_token="[CLS]",
        sep_token="[SEP]",
        mask_token="[MASK]",
        model_max_length=512,
    )


def create_tiny_chat_model(texts: Iterable[str], out_dir: Path, seed: int = 0) -> Path:
    """Minik bir nedensel dil modelini ve tokenizer'ını `out_dir` içine kaydeder."""
    import torch
    from transformers import LlamaConfig, LlamaForCausalLM

    tokenizer = train_chat_tokenizer(texts)
    config = LlamaConfig(
        vocab_size=len(tokenizer),
        hidden_size=64,
        intermediate_size=128,
        num_hidden_layers=2,
        num_attention_heads=4,
        num_key_value_heads=2,
        max_position_embeddings=1024,
        pad_token_id=tokenizer.pad_token_id,
        eos_token_id=tokenizer.eos_token_id,
        bos_token_id=None,
    )
    torch.manual_seed(seed)
    model = LlamaForCausalLM(config)
    out_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out_dir)
    tokenizer.save_pretrained(out_dir)
    return out_dir


def create_tiny_encoder(texts: Iterable[str], out_dir: Path, seed: int = 0) -> Path:
    """Minik bir BERT kodlayıcısını (başlıksız) ve tokenizer'ını `out_dir` içine kaydeder."""
    import torch
    from transformers import BertConfig, BertModel

    tokenizer = train_encoder_tokenizer(texts)
    config = BertConfig(
        vocab_size=len(tokenizer),
        hidden_size=64,
        num_hidden_layers=2,
        num_attention_heads=4,
        intermediate_size=128,
        max_position_embeddings=512,
        pad_token_id=tokenizer.pad_token_id,
    )
    torch.manual_seed(seed)
    model = BertModel(config)
    out_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out_dir)
    tokenizer.save_pretrained(out_dir)
    return out_dir
