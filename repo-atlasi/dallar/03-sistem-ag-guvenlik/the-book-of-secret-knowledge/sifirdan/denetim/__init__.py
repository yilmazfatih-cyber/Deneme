"""denetim — kendi sunucunu denetlemek için sıfırdan yazılmış küçük bir araç seti.

Savunma amaçlıdır: yalnız sahibi olduğun ya da denetleme yetkin olan
sistemlerin yapılandırma dosyalarını, soket tablolarını, sertifikalarını ve
günlüklerini okur. Hiçbir modül ağda tarama yapmaz.

    sshd         — sshd_config zayıf ayar denetimi
    soketler     — /proc/net/tcp{,6} ayrıştırma, dışa açık hassas servisler
    sertifika    — X.509 (DER/ASN.1) ayrıştırma, TLS sertifika süresi
    kaba_kuvvet  — auth.log'da kaba kuvvet / parola püskürtme tespiti
"""
