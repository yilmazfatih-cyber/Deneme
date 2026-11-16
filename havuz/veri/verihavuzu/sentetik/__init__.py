"""Sentetik (sahte ama tutarlı) veri üreteçleri.

ÖNEMLİ: Üretilen kişiler, şirketler, kimlik/vergi numaraları, IBAN'lar, telefonlar ve adresler
UYDURMADIR. Numaraların yalnız sağlama haneleri geçerlidir; rastgele seçildikleri için gerçek bir
numarayla tesadüfen çakışabilirler — hiçbir zaman birini tanımlamak, aramak ya da ödeme yapmak
için kullanmayın. E-postalar ayrılmış alan adlarına (``.example``, ``.test``) gider.
Her üreteç ``(adet, tohum)`` alır; aynı girdi her zaman aynı çıktıyı üretir.
Üreteç listesi ve komut satırı adları: ``registry.py``. Genişletme: AGENTS.md →
"Yeni sentetik varlık ekle".
"""
