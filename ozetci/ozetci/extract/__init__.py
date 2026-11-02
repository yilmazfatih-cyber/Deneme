"""Dosyaları (PDF, .eml, .mbox, görüntü, düz metin) ortak :class:`Document` yapısına çevirir."""

from .base import Attachment, Document, Page
from .router import load, load_many

__all__ = ["Attachment", "Document", "Page", "load", "load_many"]
