"""Ağırlık gerektirmeyen çıkarımsal yedek.

Model ağırlıkları yoksa (ilk kurulum, internetsiz test) metnin en bilgilendirici cümleleri
seçilir. Kelime sıklığı + konum + rakam/ad işaretleriyle puanlanır; cümleler özgün sırada
döndürülür, hiçbir şey "uydurulmaz".
"""

from __future__ import annotations

import math
import re
from collections import Counter

from ..chunking import split_sentences
from ..textutil import detect_language, stopwords, tr_lower, truncate_words
from .base import Summary

_ACTION_RE_TR = re.compile(
    r"\blütfen\b|\brica (ederim|ederiz|olunur)\b|\bgerek(iyor|mektedir|li|ir)\b|\bbekl(iyoruz|iyorum|enmektedir)\b|"
    r"\bson (tarih|gün|ödeme)\b|\ben geç\b|\btarihine kadar\b|"
    r"(gönder|ilet|öde|onayla|imzala|doldur|teslim et|katıl|yanıtla|bildir|hatırlat|incele|kontrol et|paylaş)"
    r"(in|iniz|yin|yiniz|melisiniz|malısınız|ebilir misiniz|abilir misiniz|er misiniz|ır mısınız|ir misiniz|meniz|manız|"
    r"ebilir misin|abilir misin|er misin|ır mısın|ir misin|meni|manı)\b|"
    r"\b(gönder|ilet|öde|onayla|imzala|doldur|bildir|yanıtla|hatırlat|incele|paylaş)[.!]?$|"
    r"\b(misiniz|mısınız|müsünüz|musunuz|misin|mısın|müsün|musun)\b|\bödenmesi\b|\bzorunlu(dur)?\b"
)
_ACTION_RE_EN = re.compile(
    r"\bplease\b|\bneeds? to\b|\bdeadline\b|\bdue (on|by|date)\b|\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday|end of|eod|cob|\d)|"
    r"\bmust\b|\bshould\b|\bcould you\b|\bcan you\b|\bkindly\b|\baction required\b|\brequired\b|\bremind(er)?\b|\bno later than\b"
)
_LABEL_LINE_RE = re.compile(r"^\[(Ek|Diğer ekler|Attachment|İleti)[^\]]*\]\s*$")
_SALUTATION_RE = re.compile(r"^(merhaba|selam|sayın|sevgili|değerli|iyi günler|günaydın|hi|hello|dear|good (morning|afternoon))\b[^.!?]{0,60}$")
_WORD_RE = re.compile(r"[^\W\d_]{2,}")
_NUMBER_RE = re.compile(r"\d")


class ExtractiveSummarizer:
    name = "extractive"

    def __init__(self, max_sentences: int = 4, max_bullets: int = 5, max_actions: int = 4) -> None:
        self.max_sentences = max_sentences
        self.max_bullets = max_bullets
        self.max_actions = max_actions

    def summarize(self, text: str, kind: str = "document", language: str = "auto", title: str | None = None) -> Summary:
        lang = detect_language(text) if language == "auto" else language
        if lang == "unknown":
            lang = "tr"
        body = _drop_header_lines(text) if kind in ("email", "mbox") else text
        kept = [ln for ln in body.split("\n") if not _LABEL_LINE_RE.match(ln.strip())]
        no_salut = [ln for ln in kept if not _SALUTATION_RE.match(tr_lower(ln.strip()))]
        body = "\n".join(no_salut if any(ln.strip() for ln in no_salut) else kept)  # selamlama süzgeci belgeyi boşaltmasın
        if not body.strip():
            return Summary(text="", language=lang, backend=self.name, notes=["belgeden metin çıkarılamadı"])
        all_sentences = [re.sub(r"\s+", " ", s) for s in split_sentences(body.replace("\n", " "))]
        all_sentences = _dedupe([s for s in all_sentences if not _SALUTATION_RE.match(tr_lower(s))])
        sentences = [s for s in all_sentences if len(s.split()) >= 3]
        lines = [ln.strip() for ln in body.split("\n") if len(ln.split()) >= 2]
        if len(sentences) <= 1 and len(lines) >= 3:
            # noktalaması olmayan OCR/tablo/form metni: satırları birim kabul et
            sentences = lines
        if not sentences:
            return Summary(text=truncate_words(body.strip(), 80), language=lang, backend=self.name, notes=["metin çok kısa; olduğu gibi verildi"])

        scores = self._score(sentences, lang)
        ranked = sorted(range(len(sentences)), key=lambda i: scores[i], reverse=True)
        top = sorted(ranked[: self.max_sentences])
        summary_text = truncate_words(" ".join(sentences[i] for i in top), 120)
        # Eylemler önce seçilir (e-postada en değerli bilgi); maddeler özet ve eylemleri yinelemez
        action_re = _ACTION_RE_EN if lang == "en" else _ACTION_RE_TR
        # "Lütfen ödeyiniz." gibi iki kelimelik emirler de eylem sayılır
        actions = [s for s in all_sentences if len(s.split()) >= 2 and action_re.search(tr_lower(s))][: self.max_actions]
        used = {sentences[i] for i in top} | set(actions)
        bullets = [sentences[i] for i in sorted(ranked[self.max_sentences :]) if sentences[i] not in used][: self.max_bullets]
        return Summary(text=summary_text, bullets=bullets, actions=actions, language=lang, backend=self.name,
                       notes=["çıkarımsal yedek: model ağırlığı kullanılmadı"])

    def _score(self, sentences: list[str], lang: str) -> list[float]:
        stop = stopwords(lang)
        freq: Counter = Counter()
        tokenized = []
        for s in sentences:
            words = [w for w in _WORD_RE.findall(tr_lower(s)) if w not in stop]
            tokenized.append(words)
            freq.update(set(words))
        n = len(sentences)
        scores = []
        for i, words in enumerate(tokenized):
            if not words:
                scores.append(0.0)
                continue
            tf = sum(math.log1p(freq[w]) for w in words) / math.sqrt(len(words))
            position = 1.0 + 0.6 * (1 - i / max(n - 1, 1))  # baştaki cümleler biraz avantajlı
            numeric = 1.15 if _NUMBER_RE.search(sentences[i]) else 1.0
            length_penalty = 0.6 if len(words) > 45 else 1.0
            scores.append(tf * position * numeric * length_penalty)
        return scores


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out = []
    for it in items:
        key = tr_lower(it).strip(" .")
        if key not in seen:
            seen.add(key)
            out.append(it)
    return out


def _drop_header_lines(text: str) -> str:
    lines = text.split("\n")
    body = [ln for ln in lines if not re.match(r"^(Kimden|Kime|Bilgi|Tarih|Konu|From|To|Cc|Date|Subject)\s*:", ln)]
    return "\n".join(body)
