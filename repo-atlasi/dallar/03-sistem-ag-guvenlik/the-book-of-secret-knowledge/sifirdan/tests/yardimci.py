"""Testlerin ortak yardımcıları."""

import os

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def ornek(ad):
    with open(os.path.join(KOK, "ornekler", ad), encoding="utf-8") as f:
        return f.read()


def kurallar(bulgular):
    return sorted(b.kural for b in bulgular)
