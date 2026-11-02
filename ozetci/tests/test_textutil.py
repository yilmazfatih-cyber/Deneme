from ozetci.textutil import alpha_ratio, clean_text, detect_language, reflow, tr_lower, tr_upper


def test_turkish_case():
    assert tr_upper("istanbul ılık") == "İSTANBUL ILIK"
    assert tr_lower("İSTANBUL ILIK") == "istanbul ılık"
    assert tr_upper("ığdır") == "IĞDIR"


def test_clean_text_ligatures_and_controls():
    assert clean_text("ﬁnans\x00  raporu\r\n\r\n\r\n\r\nson") == "finans raporu\n\nson"


def test_reflow_joins_lines_and_hyphens():
    src = "Bu bir dene-\nme metnidir ve satır\nsonları birleşir.\n\nYeni paragraf."
    assert reflow(src) == "Bu bir deneme metnidir ve satır sonları birleşir.\n\nYeni paragraf."


def test_reflow_keeps_short_form_lines():
    src = "FATURA NO 2025-031\nTutar: 1.250 TL\nSon ödeme: 15 Mart 2025"
    assert reflow(src) == src
    prose = "Bu satır otuz karakterden uzun olduğu için\nbir sonrakiyle birleşir."
    assert reflow(prose) == "Bu satır otuz karakterden uzun olduğu için bir sonrakiyle birleşir."


def test_reflow_keeps_list_items():
    src = "Gündem:\n- birinci madde\n- ikinci madde"
    assert reflow(src) == "Gündem:\n- birinci madde\n- ikinci madde"


def test_detect_language():
    assert detect_language("Bu belge için toplantı ve bütçe bilgileri aşağıdadır.") == "tr"
    assert detect_language("The meeting is scheduled for Monday and the budget is approved.") == "en"
    assert detect_language("") == "unknown"


def test_alpha_ratio():
    assert alpha_ratio("abc 123") == 0.5
    assert alpha_ratio("") == 0.0


def test_reflow_keeps_field_lines_and_tables():
    src = "Bu satır otuz karakterden uzun olduğu için normalde birleşir\nMüşteri: Ayşe Yılmaz\n| a | b |\n| 1 | 2 |"
    assert reflow(src) == src


def test_hyphen_prefix_kept():
    assert reflow("Lütfen e-\nposta ile bildirin ve 2-\n3 gün bekleyin.") == "Lütfen e-posta ile bildirin ve 2-3 gün bekleyin."


def test_language_english_with_turkish_name_signature():
    assert detect_language("Hi team, the report is attached and the budget is approved for the next quarter. Best, Ayşe Çelik") == "en"
