from conftest import EchoGenerator

from ozetci.summarize import ExtractiveSummarizer, LLMSummarizer
from ozetci.summarize.output_parse import parse_summary, strip_thinking
from ozetci.summarize.prompts import build_messages

LONG_TR = (
    "Şirket 2024 yılında 12 milyon TL ciro yaptı. Satışlar bir önceki yıla göre yüzde 18 arttı. "
    "Yönetim kurulu yeni fabrika yatırımını onayladı. Yatırımın 2026 başında tamamlanması bekleniyor. "
    "Çalışan sayısı 240'a çıktı. Lütfen bütçe raporunu 10 Nisan'a kadar gönderin. "
    "Pazarlama ekibi yeni kampanya için hazırlık yapıyor. Hava bugün güzeldi."
)


def test_parse_structured_output():
    raw = "<think>düşünüyorum</think>\nÖZET: Fatura ödemesi isteniyor.\nMADDELER:\n- Tutar 1.250 TL\n- Son tarih 15 Mart\nEYLEMLER:\n- Dekontu ilet"
    s = parse_summary(raw, "tr", "x")
    assert s.text == "Fatura ödemesi isteniyor."
    assert s.bullets == ["Tutar 1.250 TL", "Son tarih 15 Mart"]
    assert s.actions == ["Dekontu ilet"]
    assert not s.notes


def test_parse_tolerates_markdown_and_none():
    raw = "**SUMMARY:** Payment reminder.\n**POINTS:**\n1. Amount 1,250 TL\n**ACTIONS:**\n- None"
    s = parse_summary(raw, "en")
    assert s.text == "Payment reminder." and s.bullets == ["Amount 1,250 TL"] and s.actions == []


def test_parse_unformatted_falls_back():
    s = parse_summary("Sadece düz bir paragraf.", "tr")
    assert s.text == "Sadece düz bir paragraf." and s.notes


def test_strip_unclosed_think():
    assert strip_thinking("<think>yarım kaldı") == ""


def test_build_messages_language_and_kind():
    m = build_messages("metin", "email", "tr", title="Konu")
    assert m[0]["role"] == "system" and "e-postayı özetle" in m[1]["content"] and "Başlık: Konu" in m[1]["content"]
    m_en = build_messages("text", "document", "en")
    assert "Summarize the document" in m_en[1]["content"] and "TEXT:" in m_en[1]["content"]


def test_extractive_summary_turkish():
    s = ExtractiveSummarizer(max_sentences=3).summarize(LONG_TR)
    assert s.language == "tr" and s.backend == "extractive"
    assert len(s.text) > 0 and "Hava bugün güzeldi" not in s.text
    assert any("10 Nisan" in a for a in s.actions)


def test_llm_single_pass():
    gen = EchoGenerator()
    s = LLMSummarizer(gen, max_chars=5000).summarize(LONG_TR, kind="document")
    assert s.chunks == 1 and s.text == "Bu bir deneme özetidir." and s.actions == ["Faturayı 15 Mart'a kadar öde"]
    assert len(gen.prompts) == 1 and LONG_TR in gen.prompts[0][1]["content"]


def test_llm_map_reduce_on_long_text():
    gen = EchoGenerator()
    text = "\n\n".join(f"Bölüm {i}. " + LONG_TR for i in range(6))
    s = LLMSummarizer(gen, max_chars=900).summarize(text, kind="document")
    assert s.chunks > 1
    # son çağrı birleştirme istemi
    assert "bölüm özetleri" in gen.prompts[-1][1]["content"]
    assert len(gen.prompts) == s.chunks + 1 or len(gen.prompts) > s.chunks
    assert s.text == "Bu bir deneme özetidir."


def test_unverified_numbers_note():
    gen = EchoGenerator(reply="ÖZET: Tutar 9.999 TL ve 2024 yılı.\nMADDELER:\n- 12 milyon TL\nEYLEMLER:\n- Yok")
    s = LLMSummarizer(gen, max_chars=5000).summarize(LONG_TR, kind="document")
    assert any("9.999" in n for n in s.notes)
    assert not any("12" in n.split(":")[-1] for n in s.notes if n.startswith("metinde"))


def test_parse_header_requires_colon_or_line_end():
    raw = "Özetle, bu belge bütçeyi anlatıyor.\nÖZET\nBütçe onaylandı.\nYapılacaklar:\n- Raporu gönder\n- Eylem yok (belirtilmemiş)"
    s = parse_summary(raw, "tr")
    assert s.text == "Bütçe onaylandı." or s.text.endswith("Bütçe onaylandı.")
    assert s.actions == ["Raporu gönder"]


def test_parse_bullets_under_summary_header():
    raw = "ÖZET:\n- Fatura 1.250 TL\n- Son tarih 15 Mart"
    s = parse_summary(raw, "tr")
    assert s.bullets == ["Fatura 1.250 TL", "Son tarih 15 Mart"] and s.text


def test_language_turkish_with_english_disclaimer():
    from ozetci.textutil import detect_language

    tr = "Merhaba, toplantı için bütçe raporunu ekte gönderiyorum; lütfen inceleyin ve görüşlerinizi iletin. "
    en = ("This e-mail and any attachments are confidential and intended solely for the use of the individual to whom it is addressed. "
          "If you are not the intended recipient, please notify the sender and delete this message from your system. ") * 2
    assert detect_language(tr + en) == "tr"


def test_extractive_handles_unpunctuated_ocr_lines():
    text = "FATURA NO 2025-031\nTutar 1.250 TL\nSon ödeme 15 Mart 2025\nMüşteri Ayşe Yılmaz\nAdres İstanbul"
    s = ExtractiveSummarizer(max_sentences=2).summarize(text)
    assert len(s.text) < len(text) and "1.250" in s.text or "2025" in s.text


def test_gguf_template_rendering_matches_hf_style():
    from ozetci.summarize.gguf_backend import LlamaCppGenerator

    tpl = ("{%- for message in messages %}{{ '<|im_start|>' + message.role + '\\n' + message.content + '<|im_end|>\\n' }}{%- endfor %}"
           "{%- if add_generation_prompt %}{{ '<|im_start|>assistant\\n' }}{%- if enable_thinking is defined and enable_thinking is false %}{{ '<think>\\n\\n</think>\\n\\n' }}{%- endif %}{%- endif %}")
    gen = LlamaCppGenerator.__new__(LlamaCppGenerator)
    gen._is_qwen3 = True
    gen._jinja = LlamaCppGenerator._build_template(tpl)
    out = gen._render([{"role": "user", "content": "Merhaba"}])
    assert out.endswith("<|im_start|>assistant\n<think>\n\n</think>\n\n") and "<|im_start|>user\nMerhaba<|im_end|>" in out


def test_gguf_template_is_sandboxed():
    from ozetci.summarize.gguf_backend import LlamaCppGenerator

    evil = "{{ ''.__class__.__mro__[1].__subclasses__() }}"
    gen = LlamaCppGenerator.__new__(LlamaCppGenerator)
    gen._is_qwen3 = False
    gen._jinja = LlamaCppGenerator._build_template(evil)
    assert gen._render([{"role": "user", "content": "x"}]) is None  # SecurityError -> yedek yola düşer


def test_parse_drops_preamble_before_first_header():
    s = parse_summary("İşte istediğiniz özet:\nÖZET: Bütçe onaylandı.\nMADDELER:\n- Bir", "tr")
    assert s.text == "Bütçe onaylandı." and s.bullets == ["Bir"]


def test_extractive_catches_second_person_requests():
    text = "Merhaba Mehmet,\nMart ayı faturası ekte. Ödeme dekontunu bana iletir misin? Lütfen ödeyiniz.\nİyi çalışmalar."
    s = ExtractiveSummarizer(max_sentences=1).summarize(text, kind="email")
    assert any("iletir misin" in a for a in s.actions) and any("Lütfen ödeyiniz" in a for a in s.actions)
