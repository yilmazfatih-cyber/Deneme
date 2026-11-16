"""Örnek uygulama: kayıt/giriş + not defteri. Çalıştırma: `python -m web_catisi.ornek --kapi 8452`.

Genişletme: yeni özellik eklerken `uygulama.py` başlığındaki güvenlik kararlarını koruyun.
"""

from web_catisi.ornek.modeller import Kullanici, Not
from web_catisi.ornek.uygulama import create_app

__all__ = ["Kullanici", "Not", "create_app"]
