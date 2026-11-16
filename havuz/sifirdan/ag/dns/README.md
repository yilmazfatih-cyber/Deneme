# dns — DNS iletisi, yetkili sunucu ve çözümleyici

"www.ornek.test" adresi nasıl IP'ye dönüşür? Bu klasör DNS'in tel biçimini (RFC 1035) sıfırdan kodlar/çözer
(ad sıkıştırma dahil), yerel bir bölge dosyasını yanıtlayan küçük bir **yetkili** sunucu (UDP + TCP) ve sahte
yanıtlara karşı denetimli bir uç çözümleyici içerir. Testler yalnız 127.0.0.1 üzerinde, dış ağsız koşar.

## 5 dakikada çalıştırma

```bash
python -m dns sun --kapi 8453                               # dns/ornek.zone bölgesini yayınlar
python -m dns sor www.ornek.test A --sunucu 127.0.0.1:8453  # → 192.0.2.10
python -m dns sor ornek.test MX --sunucu 127.0.0.1:8453     # → 10 posta.ornek.test
dig @127.0.0.1 -p 8453 blog.ornek.test                      # (dig kuruluysa) gerçek bir istemciyle
```

## Nasıl çalışır

```
çözümleyici                                  sunucu (DnsServer)
  Message(id=RASTGELE, RD, soru) ──UDP──▶    decode (sınırlı, işaretçiler yalnız geriye)
                                             QR=1 mi? → yanıt verme (yansıma döngüsü)
                                             bölge içinde mi? hayır → REFUSED
                                             kayıt? CNAME izle (≤ 8) → yanıt (AA) + glue
                                             yok → NXDOMAIN/NODATA + SOA (olumsuz önbellek)
  ◀──UDP── yanıt (≤ 512 bayt; büyükse TC=1)
  kimlik + QR + soru tutmuyor → YOK SAY, beklemeye devam
  TC=1 → aynı soru TCP ile (2 baytlık uzunluk öneki)
  TTL kadar önbellekte tut (saat dışarıdan verilir)
```

Ad sıkıştırma: `posta.ornek.test` yazılırken "ornek.test" daha önce 16. baytta yazılmışsa `\x05posta\xc0\x10`.

## Dosya haritası

| Dosya         | Sorumluluk                                                                    |
| ------------- | ----------------------------------------------------------------------------- |
| `message.py`  | `Message`, `Question`, `Record`, `Soa`; ad kodlama/çözme ve sıkıştırma; kayıt verileri |
| `zone.py`     | Bölge dosyası ayrıştırıcı (`$ORIGIN`, `$TTL`, göreli adlar, tırnaklı TXT, IDNA), `Zone` |
| `server.py`   | `answer` (yanıt kuralları), `DnsServer` (UDP + TCP), `handle_packet`          |
| `resolver.py` | `Resolver`: kimlik/soru doğrulama, yeniden deneme, TCP'ye düşme, TTL önbelleği |
| `ornek.zone`  | Örnek bölge (belgeleme adresleriyle: 192.0.2.0/24, 2001:db8::/32)              |

## Saldırı yüzeyi ve alınan önlem

| Saldırı / risk                                    | Önlem                                                       | Testi (`tests/dns/`)                              |
| ------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| Sıkıştırma işaretçisi döngüsü (sonsuz döngü/DoS)  | işaretçi yalnız geriye gösterebilir                         | `test_bozuk_iletiler_reddedilir`                  |
| Taşan/kesik ad, 255 baytı aşan ad, bozuk etiket   | her okumada sınır denetimi; yalnız `DnsFormatError`         | aynı + `test_rastgele_bayt_cozucuyu_cokertmez`    |
| Sahte yanıtla önbellek zehirleme                  | rastgele 16 bit kimlik; kimlik+QR+soru eşleşmesi; bağlı soket | `test_sahte_yanitlar_yok_sayilir`               |
| Açık özyinelemeli çözümleyici olarak kötüye kullanım | bölge dışına REFUSED; özyineleme yok                    | `test_bolge_disi_soru_reddedilir`                 |
| Yanıtlara yanıt (yansıma döngüsü)                 | QR=1 paketlere sessizlik                                    | `test_bozuk_paket_formerr_yanit_paketi_sessiz`    |
| UDP'de büyük yanıt                                | 512 bayt + TC; TCP'ye düşme                                 | `test_kesik_udp_yaniti_tcp_ile_tamamlanir`        |
| Bozuk bölge dosyası                               | satır numaralı açık hata; SOA zorunlu                       | `test_bolge_hatalari_satir_numarasiyla`           |

## Sınırlar

- EDNS(0), DNSSEC, IXFR/AXFR (bölge aktarımı), joker kayıtlar (`*.ornek.test`), alt bölge yetkilendirmesi
  (delegation) ve özyinelemeli çözümleme **yok**.
- Hız sınırı yok: sunucuyu internete açmayın (yansıtma/çoğaltma saldırılarında kullanılabilir).
- Bölge dosyası alt kümesi: parantezle çok satırlı kayıt, `$INCLUDE`, `$GENERATE`, `\` kaçışları desteklenmez.
- Çözümleyici yalnız IPv4 sunucu adresiyle çalışır; kaynak kapı her soruda işletim sisteminin seçtiği boş kapıdır.
- Etiketlerde yalnız yazdırılabilir ASCII (nokta hariç) kabul edilir; RFC'nin izin verdiği ikili etiketler reddedilir.

## Buradan nereye

- Yeni kayıt türü (ör. SRV, CAA): `message.py` (`TYPES`, kodla/çöz) + `zone.py` (`_parse_rdata`) + gidiş-dönüş testi.
- EDNS(0): ek bölüme OPT kaydı + UDP sınırını 512'den yükseltme.
