"""KVKK Kalkanı tanıyıcıları.

Üç katman:
1. Türkiye'ye özgü kural tanıyıcıları (TCKN, VKN, IBAN, telefon, plaka, e-posta, bağlamsal doğum tarihi) —
   regex + sağlama algoritması. Presidio kuruluysa `PatternRecognizer` alt sınıfları olarak çalışır; kurulu
   değilse aynı mantık saf Python `fallback_scan` ile çalışır. **Maskeleme hiçbir zaman devre dışı kalmaz.**
2. GLiNER (multi-PII): kişi adı, adres, kurum, doğum tarihi, sağlık bilgisi. Paket ya da model yoksa atlanır,
   meta'da "ner: devre dışı" yazar.
3. Çakışma çözümü: yüksek skor, sonra uzun eşleşme kazanır.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass

from ..runtimes.lazy import LazyModel
from .tckn import is_valid_tckn, is_valid_tr_iban, is_valid_vkn

log = logging.getLogger("aiplatform.kvkk")

DEFAULT_THRESHOLD = 0.5


@dataclass
class Finding:
    entity_type: str
    start: int
    end: int
    score: float
    text: str
    source: str = "kural"

    def public(self, include_text: bool = False) -> dict:
        d = asdict(self)
        if not include_text:
            d.pop("text")
        return d


# ----------------------------------------------------------------------------- kural tanımları

_PLATE_LETTERS = "ABCDEFGHIJKLMNOPRSTUVYZ"  # Q, W, X ve Türkçe karakterler plakada yok


def _valid_plate(text: str) -> bool:
    m = re.fullmatch(rf"(\d{{2}})\s?([{_PLATE_LETTERS}]{{1,3}})\s?(\d{{2,5}})", text.strip())
    if not m:
        return False
    il, harf, rakam = int(m.group(1)), m.group(2), m.group(3)
    if not 1 <= il <= 81:
        return False
    allowed = {1: (4, 5), 2: (3, 4), 3: (2, 3)}[len(harf)]
    return len(rakam) in allowed


def _valid_phone(text: str) -> bool:
    digits = re.sub(r"\D", "", text)
    if digits.startswith("0090"):
        digits = digits[4:]
    elif digits.startswith("90") and text.strip().startswith("+"):
        digits = digits[2:]
    elif digits.startswith("0"):
        digits = digits[1:]
    return len(digits) == 10 and digits[0] in "2345"


@dataclass(frozen=True)
class RuleSpec:
    entity_type: str
    pattern: str
    valid_score: float
    invalid_score: float | None  # None: doğrulanamayan eşleşme hiç raporlanmaz
    validator: Callable[[str], bool] | None = None
    flags: int = 0


RULES: list[RuleSpec] = [
    RuleSpec("TR_TCKN", r"\b[1-9]\d{10}\b", 0.95, 0.1, is_valid_tckn),
    RuleSpec("TR_VKN", r"\b\d{10}\b", 0.9, None, is_valid_vkn),
    RuleSpec(
        "TR_IBAN",
        r"\bTR\d{2}(?:[ \-]?\d{4}){5}[ \-]?\d{2}\b",
        0.95,
        0.3,
        is_valid_tr_iban,
        re.IGNORECASE,
    ),
    RuleSpec(
        "TR_PHONE",
        r"(?<![\d+])(?:\+90|0090|0)[ \-]?\(?[2-5]\d{2}\)?[ \-]?\d{3}[ \-]?\d{2}[ \-]?\d{2}(?!\d)",
        0.8,
        None,
        _valid_phone,
    ),
    RuleSpec(
        "TR_PLATE",
        rf"\b(?:0[1-9]|[1-7]\d|8[01])\s?[{_PLATE_LETTERS}]{{1,3}}\s?\d{{2,5}}\b",
        0.6,
        None,
        _valid_plate,
    ),
    RuleSpec(
        "EMAIL_ADDRESS",
        r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b",
        0.9,
        None,
        None,
    ),
]

_MONTHS = "ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik"
_DATE_RE = re.compile(
    rf"\b(?:\d{{1,2}}[./\-]\d{{1,2}}[./\-](?:19|20)\d{{2}}|\d{{1,2}}\s+(?:{_MONTHS})\s+(?:19|20)\d{{2}}|(?:19|20)\d{{2}}-\d{{2}}-\d{{2}})\b",
    re.IGNORECASE,
)
_DOB_CONTEXT = re.compile(r"(doğum|dogum|d\.\s?t\.|doğ\.|date of birth|birth|dob)", re.IGNORECASE)


def _scan_dob(text: str) -> list[Finding]:
    out = []
    for m in _DATE_RE.finditer(text):
        window = text[max(0, m.start() - 40) : m.start()]
        if _DOB_CONTEXT.search(window):
            out.append(Finding("DATE_OF_BIRTH", m.start(), m.end(), 0.85, m.group(0), "kural"))
    return out


def fallback_scan(text: str, entities: Iterable[str] | None = None) -> list[Finding]:
    """Saf Python kural taraması (Presidio olmadan). Çakışmaları çözülmemiş ham sonuç döner."""
    wanted = set(entities) if entities else None
    out: list[Finding] = []
    for rule in RULES:
        if wanted and rule.entity_type not in wanted:
            continue
        for m in re.finditer(rule.pattern, text, rule.flags):
            value = m.group(0)
            if rule.validator is None or rule.validator(value):
                score = rule.valid_score
            elif rule.invalid_score is not None:
                score = rule.invalid_score
            else:
                continue
            out.append(Finding(rule.entity_type, m.start(), m.end(), score, value, "kural"))
    if not wanted or "DATE_OF_BIRTH" in wanted:
        out.extend(_scan_dob(text))
    return out


# ----------------------------------------------------------------------------- Presidio (varsa)

PRESIDIO_AVAILABLE = False
try:  # pragma: no cover - presidio bu ortamda kurulu değil
    from presidio_analyzer import EntityRecognizer, Pattern, PatternRecognizer, RecognizerResult
    from presidio_analyzer.predefined_recognizers import EmailRecognizer

    class _ChecksumPatternRecognizer(PatternRecognizer):
        """Regex eşleşmesini sağlama algoritmasıyla puanlar (geçerli → yüksek, değil → düşük/atla)."""

        rule: RuleSpec

        def __init__(self, rule: RuleSpec):
            self.rule = rule
            super().__init__(
                supported_entity=rule.entity_type,
                patterns=[Pattern(name=rule.entity_type.lower(), regex=rule.pattern, score=rule.valid_score)],
                supported_language="tr",
                global_regex_flags=re.DOTALL | re.MULTILINE | rule.flags,
            )

        def validate_result(self, pattern_text: str):  # Presidio'nun skorlamasını devre dışı bırakır
            return None

        def analyze(self, text, entities, nlp_artifacts=None, regex_flags=None):
            results = super().analyze(text, entities, nlp_artifacts, regex_flags)
            kept = []
            for r in results:
                value = text[r.start : r.end]
                if self.rule.validator is None or self.rule.validator(value):
                    r.score = self.rule.valid_score
                elif self.rule.invalid_score is not None:
                    r.score = self.rule.invalid_score
                else:
                    continue
                kept.append(r)
            return kept

    class TcknRecognizer(_ChecksumPatternRecognizer):
        def __init__(self):
            super().__init__(RULES[0])

    class VknRecognizer(_ChecksumPatternRecognizer):
        def __init__(self):
            super().__init__(RULES[1])

    class TrIbanRecognizer(_ChecksumPatternRecognizer):
        def __init__(self):
            super().__init__(RULES[2])

    class TrPhoneRecognizer(_ChecksumPatternRecognizer):
        def __init__(self):
            super().__init__(RULES[3])

    class TrPlateRecognizer(_ChecksumPatternRecognizer):
        def __init__(self):
            super().__init__(RULES[4])

    class DateOfBirthRecognizer(EntityRecognizer):
        """Tarih kalıbı + yakın bağlamda 'doğum' kelimesi."""

        def __init__(self):
            super().__init__(
                supported_entities=["DATE_OF_BIRTH"], supported_language="tr", name="DateOfBirthTR"
            )

        def load(self) -> None:
            pass

        def analyze(self, text, entities, nlp_artifacts=None):
            return [RecognizerResult(f.entity_type, f.start, f.end, f.score) for f in _scan_dob(text)]

    def _build_presidio() -> list:
        return [
            TcknRecognizer(),
            VknRecognizer(),
            TrIbanRecognizer(),
            TrPhoneRecognizer(),
            TrPlateRecognizer(),
            EmailRecognizer(supported_language="tr"),
            DateOfBirthRecognizer(),
        ]

    _PRESIDIO = LazyModel(_build_presidio, "presidio")
    PRESIDIO_AVAILABLE = True
except ImportError:
    _PRESIDIO = None


def presidio_scan(text: str, entities: Iterable[str] | None = None) -> list[Finding] | None:
    """Presidio ile tarar; kurulu değilse veya hata verirse None (çağıran fallback'e düşer)."""
    if not PRESIDIO_AVAILABLE or _PRESIDIO is None:
        return None
    try:  # pragma: no cover - presidio bu ortamda kurulu değil
        wanted = list(entities) if entities else None
        out: list[Finding] = []
        for rec in _PRESIDIO.get():
            ents = [e for e in rec.supported_entities if not wanted or e in wanted]
            if not ents:
                continue
            for r in rec.analyze(text, ents, None):
                out.append(
                    Finding(r.entity_type, r.start, r.end, float(r.score), text[r.start : r.end], "presidio")
                )
        return out
    except Exception as e:  # pragma: no cover
        log.warning("Presidio taraması başarısız, yerleşik kurallara dönülüyor: %s", e)
        return None


# ----------------------------------------------------------------------------- GLiNER (varsa)

# GLiNER etiketi → platform varlık tipi
GLINER_LABELS: dict[str, str] = {
    "person": "PERSON",
    "address": "ADDRESS",
    "organization": "ORGANIZATION",
    "date of birth": "DATE_OF_BIRTH",
    "medical condition": "HEALTH",
}
GLINER_MODEL_ID = "gliner-multi-pii-v1"


def _gliner_path():
    from ..config import get_settings

    return get_settings().models_dir / GLINER_MODEL_ID / "default"


def _load_gliner():
    from gliner import GLiNER  # ImportError → NER devre dışı

    path = _gliner_path()
    if not path.exists():
        raise FileNotFoundError(f"GLiNER modeli kurulu değil: {path}")
    return GLiNER.from_pretrained(str(path), local_files_only=True)


_GLINER = LazyModel(_load_gliner, "gliner")
_GLINER_DISABLED_REASON: str | None = None


def ner_available() -> bool:
    import importlib.util

    return importlib.util.find_spec("gliner") is not None and _gliner_path().exists()


def ner_scan(
    text: str, entities: Iterable[str] | None = None, threshold: float = DEFAULT_THRESHOLD
) -> list[Finding] | None:
    """GLiNER taraması; devre dışıysa None."""
    global _GLINER_DISABLED_REASON
    if not ner_available():
        _GLINER_DISABLED_REASON = "gliner paketi veya modeli kurulu değil"
        return None
    wanted = set(entities) if entities else None
    labels = [lbl for lbl, et in GLINER_LABELS.items() if not wanted or et in wanted]
    if not labels:
        return []
    try:  # pragma: no cover - gliner bu ortamda kurulu değil
        model = _GLINER.get()
        preds = model.predict_entities(text, labels, threshold=threshold)
    except Exception as e:  # pragma: no cover
        _GLINER_DISABLED_REASON = str(e)
        log.warning("GLiNER çalışmadı, NER atlanıyor: %s", e)
        return None
    return [  # pragma: no cover
        Finding(
            GLINER_LABELS.get(p["label"], p["label"].upper()),
            int(p["start"]),
            int(p["end"]),
            float(p.get("score", 0.5)),
            text[int(p["start"]) : int(p["end"])],
            "gliner",
        )
        for p in preds
    ]


# ----------------------------------------------------------------------------- birleşik tarama


def resolve_overlaps(findings: list[Finding]) -> list[Finding]:
    ordered = sorted(findings, key=lambda f: (-f.score, -(f.end - f.start), f.start))
    taken: list[Finding] = []
    for f in ordered:
        if all(f.end <= t.start or f.start >= t.end for t in taken):
            taken.append(f)
    return sorted(taken, key=lambda f: f.start)


def scan_text(
    text: str,
    entities: Iterable[str] | None = None,
    threshold: float = DEFAULT_THRESHOLD,
    use_ner: bool = True,
) -> tuple[list[Finding], dict]:
    """Tüm katmanları çalıştırır. Dönüş: (eşik üstü, çakışması çözülmüş bulgular, meta)."""
    if not text:
        return [], {"engine": "presidio" if PRESIDIO_AVAILABLE else "yerleşik", "ner": "devre dışı"}
    rules = presidio_scan(text, entities)
    engine = "presidio"
    if rules is None:
        rules = fallback_scan(text, entities)
        engine = "yerleşik"
    found = list(rules)
    ner_state = "devre dışı"
    if use_ner:
        ner = ner_scan(text, entities, threshold)
        if ner is not None:
            found.extend(ner)
            ner_state = "etkin"
    found = [f for f in found if f.score >= threshold]
    meta = {"engine": engine, "ner": ner_state}
    if ner_state == "devre dışı" and _GLINER_DISABLED_REASON:
        meta["ner_reason"] = _GLINER_DISABLED_REASON
    return resolve_overlaps(found), meta


__all__ = [
    "DEFAULT_THRESHOLD",
    "GLINER_LABELS",
    "PRESIDIO_AVAILABLE",
    "RULES",
    "Finding",
    "fallback_scan",
    "ner_available",
    "ner_scan",
    "presidio_scan",
    "resolve_overlaps",
    "scan_text",
]
