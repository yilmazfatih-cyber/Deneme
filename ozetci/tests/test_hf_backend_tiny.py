"""Ağ gerektirmeyen uçtan uca üretim testi: rastgele ağırlıklı minik bir Qwen3 ve
küçük bir BPE tokenizer yerelde oluşturulur, HFGenerator sohbet şablonu + üretim yolu çalıştırılır.
Çıktı anlamsızdır; amaç kod yolunun (şablon, enable_thinking, decode) kırılmadığını görmektir."""

import pytest

torch = pytest.importorskip("torch")
transformers = pytest.importorskip("transformers")

QWEN_LIKE_TEMPLATE = (
    "{%- for message in messages %}{{ '<|im_start|>' + message.role + '\\n' + message.content + '<|im_end|>\\n' }}{%- endfor %}"
    "{%- if add_generation_prompt %}{{ '<|im_start|>assistant\\n' }}{%- if enable_thinking is defined and enable_thinking is false %}{{ '<think>\\n\\n</think>\\n\\n' }}{%- endif %}{%- endif %}"
)


@pytest.mark.slow
def test_tiny_qwen3_generation(tmp_path):
    from tokenizers import Tokenizer, decoders, models, pre_tokenizers, trainers
    from transformers import PreTrainedTokenizerFast, Qwen3Config, Qwen3ForCausalLM

    tok = Tokenizer(models.BPE(unk_token="<unk>"))
    tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    tok.decoder = decoders.ByteLevel()
    trainer = trainers.BpeTrainer(vocab_size=600, special_tokens=["<unk>", "<|im_start|>", "<|im_end|>", "<|endoftext|>", "<think>", "</think>"])
    corpus = ["Merhaba dünya. Bu bir özet denemesidir. ÖZET: MADDELER: EYLEMLER: fatura ödeme tarih toplantı"] * 50
    tok.train_from_iterator(corpus, trainer)
    hf_tok = PreTrainedTokenizerFast(tokenizer_object=tok, unk_token="<unk>", eos_token="<|im_end|>", pad_token="<|endoftext|>")
    hf_tok.chat_template = QWEN_LIKE_TEMPLATE
    model_dir = tmp_path / "tiny-qwen3"
    hf_tok.save_pretrained(model_dir)

    cfg = Qwen3Config(vocab_size=len(hf_tok), hidden_size=64, intermediate_size=128, num_hidden_layers=2,
                      num_attention_heads=4, num_key_value_heads=2, head_dim=16, max_position_embeddings=512,
                      eos_token_id=hf_tok.eos_token_id, pad_token_id=hf_tok.pad_token_id, tie_word_embeddings=True)
    Qwen3ForCausalLM(cfg).save_pretrained(model_dir)

    from ozetci.summarize.hf_backend import HFGenerator
    from ozetci.summarize.llm import LLMSummarizer

    gen = HFGenerator(str(model_dir), device="cpu", n_ctx=512, local_files_only=True)
    assert gen._is_qwen3
    out = gen.generate([{"role": "user", "content": "Merhaba"}], max_new_tokens=8)
    assert isinstance(out, str)

    ids = gen._encode([{"role": "user", "content": "Merhaba"}])["input_ids"][0].tolist()
    think_id, end_id = hf_tok.convert_tokens_to_ids("<think>"), hf_tok.convert_tokens_to_ids("</think>")
    assert think_id in ids and end_id in ids and ids.index(end_id) > ids.index(think_id)  # düşünme kapalı (boş <think> bloğu)

    s = LLMSummarizer(gen, max_chars=200, max_new_tokens=8).summarize("Merhaba dünya. " * 40, kind="document", language="tr")
    assert s.chunks > 1 and s.backend.startswith("llm:hf:")
