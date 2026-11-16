"""Paketin tüm hata sınıfları.

Kural: kullanıcıya dönük her hata iletisi Türkçedir, suçlamaz ve ne yapılacağını söyler.
Kim kullanır: bütün alt paketler buradan içe aktarır; başka yerde hata sınıfı tanımlanmaz.
Genişletme: yeni bir hata türü gerekiyorsa `YzHatasi`'ndan türetip bu dosyaya ekleyin.
"""

from __future__ import annotations


class YzHatasi(Exception):
    """Paketin bütün hatalarının tabanı."""


class AyarHatasi(YzHatasi):
    """Yapılandırma (ortam değişkeni, yz.yaml, komut satırı) eksik ya da hatalı."""


class EksikBagimlilikHatasi(YzHatasi):
    """İsteğe bağlı bir paket kurulu değil; ileti kurulum komutunu içerir."""


class SaglayiciHatasi(YzHatasi):
    """Model sunucusuyla konuşurken oluşan hata.

    `yeniden_denenebilir` True ise aynı istek biraz sonra başarılı olabilir (429, 5xx, bağlantı).
    """

    def __init__(
        self,
        ileti: str,
        *,
        durum_kodu: int | None = None,
        yeniden_denenebilir: bool = False,
        govde: str | None = None,
        bekleme_sn: float | None = None,
    ) -> None:
        super().__init__(ileti)
        self.durum_kodu = durum_kodu
        self.yeniden_denenebilir = yeniden_denenebilir
        self.govde = govde
        self.bekleme_sn = bekleme_sn


class BaglantiHatasi(SaglayiciHatasi):
    """Sunucuya ulaşılamadı (kapalı, yanlış adres, ağ yok)."""


class ZamanAsimiHatasi(SaglayiciHatasi):
    """Sunucu belirlenen sürede yanıt vermedi."""


class DesteklenmiyorHatasi(SaglayiciHatasi):
    """İstenen özellik (araç çağrısı, JSON şeması, gömme…) bu sağlayıcıda yok."""


class YapiliCiktiHatasi(YzHatasi):
    """Model çıktısı hiçbir katmanda şemaya uydurulamadı."""


class AracHatasi(YzHatasi):
    """Araç tanımı hatalı (imza, belge dizgisi, ad çakışması)."""


class GuvenlikHatasi(YzHatasi):
    """Güvenlik kuralı ihlali (korumalı klasör dışı yol, yasak SQL, izinsiz araç…)."""


class VeriHatasi(YzHatasi):
    """Girdi dosyası (JSONL, YAML, belge) okunamadı ya da şemaya uymuyor."""


def ekstra_gerekli(paket: str, ekstra: str) -> EksikBagimlilikHatasi:
    """İsteğe bağlı paket eksikken fırlatılacak hatayı üretir (kurulum komutuyla birlikte)."""
    return EksikBagimlilikHatasi(
        f"`{paket}` paketi kurulu değil. Kurmak için bu klasörde şunu çalıştırın:\n"
        f'    uv pip install --python .venv/bin/python -e ".[{ekstra}]"\n'
        f'(uv yoksa: .venv/bin/pip install -e ".[{ekstra}]")'
    )
