"""yz — küçük dil modelleriyle güvenilir uygulama temeli.

Alt paketler (her biri tek bir işi yapar):
    saglayici      modele bağlanma (OpenAI uyumlu, Anthropic, Sahte)
    yapili         Pydantic şemasından yapılı çıktı (katmanlı strateji + onarım)
    arac, ajan     araç tanımı ve araç kullanan ajan döngüsü
    rag            belgeye soru sorma (parçalama, gömme, BM25, karma arama)
    istem          istem şablonları, az-örnek seçimi, bağlam bütçesi, bellek
    degerlendirme  görev kümesiyle ölçme ve model karşılaştırma
    guvenlik       kişisel veri maskeleme, çıktı süzgeçleri, araç izinleri
    mcp            Model Context Protocol sunucusu ve köprüsü
    sunucu, web    sohbet sunucusu ve tek dosyalık arayüz

Genişletme: yeni bir alt paket eklemek yerine var olan kayıt dosyalarına ekleyin
(AGENTS.md "Tarifler" bölümü).
"""

__version__ = "0.1.0"
