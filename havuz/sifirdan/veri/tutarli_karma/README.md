# tutarli_karma — tutarlı karma ile parçalama ve yeniden dengeleme

Veriyi N sunucuya bölmenin en kolay yolu `karma(anahtar) % N`'dir; ama bir sunucu eklenince ya da
çıkınca anahtarların **neredeyse hepsi** yer değiştirir (ölçüm: 10 → 11 sunucuda %90,7). Tutarlı karma
yalnız gerekeni taşır (≈ 1/N). Bu klasör üç yöntemi ve bir parçalı depo benzetimini içerir. Yalnız
standart kitaplık.

```python
from tutarli_karma import HashRing, ShardedStore, jump_hash, rendezvous_owner

ring = HashRing({"a": 1.0, "b": 1.0, "c": 2.0})  # c'nin kapasitesi iki kat
ring.owner("kullanici:42")  # birincil sahip
ring.owners("kullanici:42", 2)  # 2 kopya için iki FARKLI düğüm
store = ShardedStore(HashRing(["a", "b", "c"]), replicas=2)
store.put("kullanici:42", "Ayşe")
store.join("d")  # yalnız d'ye geçmesi gereken kopyalar taşınır
store.leave("a")  # a'nın verisi önce yeni sahiplerine kopyalanır, sonra silinir
```

## Nasıl çalışır

```
                 0 ──────────────── 2^64 (halka; sonu başa bağlı)
 düğüm noktaları:   a#0   c#1  b#0      a#1   c#0  b#1   c#2 ...      (düğüm başına vnodes · ağırlık nokta)
 anahtar:               k ──► saat yönünde ilk nokta: c#1 → sahip c
 yeni düğüm d:  d#0 noktası k ile c#1 arasına düşerse k artık d'nin; başka hiçbir anahtar etkilenmez
```

| Yöntem | Fikir | Ekleme/çıkarmada taşınan | Artı / eksi |
| --- | --- | --- | --- |
| `HashRing` | düğümler halkada çok noktada (sanal düğüm); anahtar saat yönündeki ilk noktanın | ≈ 1/(N+1), yalnız yeni düğüme | ağırlık ve kopya (`owners`) kolay; bellek: noktalar |
| `rendezvous_owner` (HRW) | her (düğüm, anahtar) için karma; en büyüğü kazanır | ≈ 1/(N+1), yalnız yeni düğüme | dağılım kendiliğinden düzgün; anahtar başına O(N) |
| `jump_hash` (Lamping & Veach) | 0..N-1 kovaya "atlayarak" karar | ≈ 1/(N+1), yalnız yeni kovaya | bellek sıfır; ama yalnız SONDAN kova ekle/çıkar |
| `modulo_owner` | `karma % N` | ≈ hepsi | yalnız karşılaştırma için |

- **Karma** `blake2b`'nin ilk 8 baytı: Python'un `hash()`'i süreç başına rastgeledir, dağıtık sistemde
  kullanılamaz.
- **Sanal düğüm:** düğüm başına 160 nokta (varsayılan). Az nokta yük dengesizliği yapar.
- **Yeniden dengeleme** (`rebalance.py`): üyelik değişince her anahtarın olması gereken yer (`placement`)
  ile durduğu yer karşılaştırılır → taşıma planı; önce kopyalanır, sonra eski yerden silinir (ara anda
  veri hep en az bir yerde).

## Dosya haritası

| Dosya             | Sorumluluk                                                     |
| ----------------- | -------------------------------------------------------------- |
| `ring.py`         | `HashRing` (sanal düğüm, ağırlık, kopya sahipleri), `stable_hash` |
| `alternatives.py` | `rendezvous_owner`, `jump_hash`, `modulo_owner`                |
| `rebalance.py`    | `ShardedStore`: yerleştirme, taşıma planı, katılma/ayrılma      |

## Güvenceler (testle kanıtlanan)

- **En az taşıma:** 20.000 anahtar, 10 → 11 düğüm: taşınan oran ideal 1/11 civarında (ölçüm %9,8) ve
  taşınan her anahtar YENİ düğüme gider; düğüm çıkınca yalnız onun anahtarları yer değiştirir. Rendezvous
  için de aynısı. `modulo` %80'den fazlasını taşır.
- **Yük dengesi:** 10 düğüm, 160 sanal nokta: en yüklü düğüm ortalamanın 1,3 katından az (ölçüm 1,2);
  ağırlık 2 olan düğüm ~2 kat anahtar alır.
- **Doğruluk:** sahip, kaba kuvvet "saat yönünde ilk nokta, yoksa başa dön" hesabıyla birebir aynı (başa
  dönme durumu dahil); ekleme sırası sonucu değiştirmez.
- **Jump hash başvuru vektörleri:** makalenin C++ kodundan ve Guava'dan üretilmiş değerler
  (github.com/dgryski/go-jump, MIT) birebir tutar; kova eklenince anahtar ya yerinde kalır ya yeni kovaya
  gider (Hypothesis).
- **Parçalı depo:** rastgele katılma/ayrılma dizilerinde (2 kopya) hiçbir anahtar kaybolmaz, her anahtar
  tam olması gereken düğümlerde durur; son düğüm ayrılamaz.
- **Testin dişleri:** 5 bilerek bozulmuş sürüm (başa dönmeme, ağırlığı yok sayma, önce silip sonra
  kopyalama, yanlış jump sabiti, aynı düğüme iki kopya) yakalandı.

## Sağlamadıkları (dürüst sınırlar)

- **Gerçek ağ ve eşzamanlılık yok:** taşıma tek adımda, benzetimde yapılır; taşınırken gelen yazmalar,
  taşıma sırasında çökme, üyelik bilgisinin düğümlere yayılması (gossip) modellenmez.
- **Üyelik kararı dışarıdadır:** kimin kümede olduğuna kim karar verir? (Uzlaşma gerekir: bkz. `raft`.)
- `HashRing.add/remove` noktaları listeye tek tek ekler (O(V·N)); çok büyük kümeler için sıralı yapı gerekir.
- Sınırlı yük (bounded loads) ve sıcak anahtar (hot key) koruması yok.

## Buradan nereye

1. **Sınırlı yük:** kapasitesi dolan düğümü atlayıp saat yönünde sonrakine geçmek (Mirrokni ve ark.).
2. **Taşıma sırasında yazma:** anahtar taşınırken yazmayı hem eski hem yeni sahibe göndermek; benzetimle sınamak.
3. **Ağırlıklı rendezvous:** puanı `-ağırlık / ln(u)` yapmak.
4. **Üyelik için Raft:** küme üyeliğini `raft` üstündeki anahtar-değer servisinde tutmak.
5. **Maglev karması:** sabit boyutlu arama tablosu ile O(1) sahip bulma (Google Maglev).
6. **Gerçek parçalı servis:** her düğümde bir `onbellek_sunucu`, istemci tarafında `HashRing`.
