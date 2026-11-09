"""Hisse → sektör eşlemesi (bilgi/sema.SEKTORLER + BIST 100'ün diğer hisseleri) ve ana sektör grupları.
Belirsiz eşlemeler 'diger' bırakılır; sektör ajanı profilleri bu kodları kullanır."""

from __future__ import annotations

from ..bilgi.sema import SEKTORLER

EK = {
    "CCOLA": "gida", "AEFES": "gida", "TABGD": "gida", "EKGYO": "gyo", "RGYAS": "gyo", "ALARK": "holding", "AYGAZ": "enerji_dagitim",
    "AKSA": "kimya", "KORDS": "kimya", "CVKMD": "madencilik", "ISMEN": "araci_kurum", "TSKB": "banka", "ALBRK": "banka", "OTKAR": "otomotiv",
    "TTRAK": "otomotiv", "KARSN": "otomotiv", "EGEEN": "otomotiv", "GLRMK": "holding_insaat", "ISDMR": "demir_celik", "CWENE": "enerji_ekipman",
    "ANHYT": "sigorta", "CANTE": "enerji_uretim", "TRENJ": "enerji_uretim", "AKFYE": "enerji_uretim", "GWIND": "enerji_uretim", "BTCIM": "cimento",
    "AKCNS": "cimento", "AGHOL": "holding", "ECILC": "holding", "ECZYT": "holding", "BINHO": "holding", "GRSEL": "ulasim",
    "TRALT": "madencilik_altin", "TRMET": "madencilik",
}  # fmt: skip
SEKTOR = {**SEKTORLER, **EK}

ANA = {
    "banka": "finans", "kamu_banka": "finans", "sigorta": "finans", "araci_kurum": "finans",
    "holding": "holding", "holding_insaat": "holding",
    "enerji_uretim": "enerji", "enerji_dagitim": "enerji", "enerji_ekipman": "enerji", "rafineri_petrokimya": "enerji",
    "kimya": "sanayi", "kimya_gubre": "sanayi", "kimya_tarim": "sanayi", "demir_celik": "sanayi", "cimento": "sanayi", "cam": "sanayi",
    "otomotiv": "sanayi", "dayanikli_tuketim": "sanayi",
    "perakende": "tuketim", "gida": "tuketim",
    "havacilik": "ulasim", "havalimani": "ulasim", "ulasim": "ulasim",
    "telekom": "teknoloji_savunma", "savunma": "teknoloji_savunma",
    "gyo": "gyo", "madencilik": "madencilik", "madencilik_altin": "madencilik",
}  # fmt: skip


def sektor(hisse: str) -> str:
    return SEKTOR.get(hisse.upper(), "diger")


def ana_sektor(hisse: str) -> str:
    return ANA.get(sektor(hisse), "diger")
