"""dnsmini — sıfırdan yetkili (authoritative) DNS sunucusu ve kayıt kuruluşu modeli.

Modüller:
    tel     — DNS mesajlarının tel biçimi (RFC 1035 §4), ad sıkıştırma
    bolge   — bölge dosyası (zone file) ayrıştırıcı, RFC 1035 §5 alt kümesi
    yanit   — yetkili yanıt algoritması (RFC 1034 §4.3.2 sadeleştirilmiş)
    sunucu  — UDP + TCP dinleyici, yanıt hızı sınırlama
    istemci — küçük bir "dig": sorgu gönderir, TC gelirse TCP'ye geçer
    sicil   — alt alan adı kayıt kuruluşu: kurallar, delegasyon, kötüye kullanım
"""
