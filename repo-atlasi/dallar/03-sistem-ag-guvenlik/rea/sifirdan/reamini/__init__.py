"""reamini — kendi ikili dosyaların için MCP tarzı (JSON-RPC, stdio) tersine mühendislik sunucusu.

    elf     — ELF32/ELF64 ayrıştırıcı: başlık, bölümler, bölütler, semboller,
              dizgiler, onaltılık döküm, sertleştirme denetimi
    araclar — araç kataloğu: ad, açıklama, JSON Schema, işleyici, kök izin listesi
    sunucu  — JSON-RPC 2.0 (satır sonuyla ayrılmış) üzerinden MCP yaşam döngüsü
    istemci — sunucuyu alt süreç olarak başlatan küçük MCP istemcisi

Yalnızca okur; hedef ikiliyi asla çalıştırmaz.
"""
