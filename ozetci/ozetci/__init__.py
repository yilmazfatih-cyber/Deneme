"""ozetci — 1B altı açık modellerle PDF, e-posta ve görüntü okuyup özetleyen küçük araç.

Üç katman:
  * ``ozetci.extract``   — PDF / .eml / .mbox / görüntü dosyalarını metne çevirir (gerekirse OCR ile).
  * ``ozetci.ocr``       — 1B altı görsel-dil modeliyle (SmolDocling / Granite-Docling) sayfa görüntüsünü metne çevirir.
  * ``ozetci.summarize`` — 1B altı dil modeliyle (Qwen3-0.6B) metni özetler; ağırlık yoksa çıkarımsal yedek.

Giriş noktası: :class:`ozetci.pipeline.Ozetci` ve komut satırı ``ozetci``.
"""

from .pipeline import Ozetci  # noqa: F401
from .summarize.base import Summary  # noqa: F401
from .extract.base import Document  # noqa: F401

__version__ = "0.1.0"
__all__ = ["Ozetci", "Summary", "Document", "__version__"]
