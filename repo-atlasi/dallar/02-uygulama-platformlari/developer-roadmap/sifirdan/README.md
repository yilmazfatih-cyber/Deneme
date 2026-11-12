# Mini roadmap.sh — yol haritası çizici, konu metinleri ve ilerleme

roadmap.sh'nin bu depodan görünen mimarisi şudur: yol haritasının **grafı** (düğümler + kenarlar) sitenin
veritabanında, her konunun **metni** depoda `roadmaps/<slug>/content/<etiket-slug>@<düğüm-id>.md` dosyasında durur;
düğüm kimliği ikisini bağlar. Bu klasör aynı fikri dört aşamada, saf fonksiyonlarla kurar (disk işi yalnızca
`olustur.js`'te):

1. **Model:** yol haritası belgesini doğrula, konu düğümlerini bul, dosya adını üret, disk ile belge arasındaki farkı
   çıkar (yeniden adlandır / sil / eksik).
2. **Çizim:** belgeden SVG ve tek dosyalık HTML sayfası üret (konumsuz düğümler için katmanlı yerleşim).
3. **Konu metni:** dosyayı ayrıştır, katkı kurallarına göre doğrula, geri yaz, güvenli HTML'e çevir.
4. **İlerleme:** "bitti / öğreniyorum / atladım" durumları için saf indirgeyici, özet, sıradaki konular,
   serileştirme ve iki cihazın ilerlemesini birleştirme.

Örnek yol haritası (`ornek/kabuk.json`, "Terminal ve Kabuk") ve 11 konu metni Türkçe ve özgündür. roadmap.sh içeriği
kişisel kullanım dışında yeniden yayımlanamaz (deponun `license` dosyası); bu yüzden onların JSON'unu ya da metinlerini
kullanmadık. Kod da özgündür.

## Gereksinimler

- Node.js 22 veya üstü, yalnızca yerleşik modüller. Paket kurulumu ve internet gerekmez.

## Çalıştırma

```bash
cd repo-atlasi/dallar/02-uygulama-platformlari/developer-roadmap/sifirdan
node olustur.js        # ornek/ → cikti/index.html (cikti/ git tarafından yok sayılır)
node --test            # 15 test
```

`cikti/index.html` dosyasını tarayıcıda aç: bir konuya tıklayınca metni görünür, Shift+tıklama durumu değiştirir
(bitti → öğreniyorum → atladım → boş); durum tarayıcının `localStorage`'ında saklanır.

## Aşamalar

| Aşama | Dosya                | İçerik                                                                                                       | Test                         |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 1     | `asama1_model.js`    | `slugify` (gerçek kuralın davranışı), `slugifyTr`, `dogrula`, `konuDugumleri`, `konuDosyaAdi`, `icerikFarki` | `test/model_cizim.test.js`   |
| 2     | `asama2_cizim.js`    | `kacis`, `otomatikYerlesim`, `svgCiz`, `htmlSayfasi`                                                         | `test/model_cizim.test.js`   |
| 3     | `asama3_konu.js`     | `konuAyristir`, `konuDogrula` (8 bağlantı, tür sırası, https, yasak alan), `konuYaz`, `konuHtml`             | `test/konu_ilerleme.test.js` |
| 4     | `asama4_ilerleme.js` | `ilerlemeUygula` (saf indirgeyici), `ozet`, `siradakiler`, `serilestir`/`geriYukle`, `birlestir`             | `test/konu_ilerleme.test.js` |
| —     | `olustur.js`         | Statik site üretici: doğrula → içerik farkı → konu kuralları → HTML                                          | `test/model_cizim.test.js`   |

Öğretici ayrıntılar:

- **Türkçe slug tuzağı.** Gerçek `slugify` küçültüp `[a-z0-9_- ]` dışını atar: "Metin Araçları" → `metin-aralar`,
  "Süreçler ve İşler" → `sreler-ve-iler`. İçerik İngilizce olduğu için onlarda sorun yok; Türkçe bir yol haritasında
  dosya adları bozulur. `slugifyTr` önce harfleri ASCII karşılığına çevirir. Testte eski adlarla yeni adlar arasındaki
  "göç" de `icerikFarki` ile gösteriliyor.
- **Silme işareti.** İlerlemede bir durumu temizlemek kaydı silmez, `durum: null` + zaman bırakır; aksi hâlde iki cihaz
  birleştirilirken silinen durum diğer cihazdan geri gelirdi.
- **Kaçış her yerde.** Etiketler ve konu metinleri SVG/HTML'e kaçırılarak girer; konu HTML'inde yalnızca `http(s)`
  bağlantıları açılır (`javascript:` düz metin kalır).

## Eşleme tablosu

| Mini'deki parça                      | Gerçek depodaki karşılığı (dosya yolu)                                                                            | Fark                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Belge tipi (`YolHaritasi`)           | `scripts/lib/official-roadmap.ts` (`OfficialRoadmapDocument`)                                                     | Gerçekte `draft` düğümleri, SEO, `questions` (Tiptap JSON), `relatedRoadmaps`, `dimensions`, `type: skill \| role \| best-practice`   |
| `slugify`                            | `scripts/lib/slugger.ts`                                                                                          | Aynı davranış, kendi yazımımız                                                                                                        |
| `konuDosyaAdi`                       | `scripts/sync-content-to-repo.ts` (`${slugify(label)}@${nodeId}.md`)                                              | Biz varsayılan olarak `slugifyTr` kullanıyoruz                                                                                        |
| `konuDugumleri` / `KONU_TURLERI`     | `scripts/cleanup-orphaned-content.ts` (`['topic', 'subtopic']`)                                                   | Aynı kural                                                                                                                            |
| `icerikFarki`                        | `scripts/cleanup-orphaned-content.ts`                                                                             | Gerçekte veritabanından belge çekilir, işlemler uygulanır ve PR açıklaması (`.cleanup-summary.md`) yazılır                            |
| `konuAyristir`                       | `scripts/sync-repo-to-database.ts`                                                                                | Gerçekte markdown → HTML (markdown-it) → yalnızca bağlantı içeren listeyi ayırma (node-html-parser) → markdown (turndown)             |
| `konuYaz`, `baglantiMetniKacir`      | `scripts/lib/official-roadmap-topic.ts` (`prepareOfficialRoadmapTopicContent`, `escapeMarkdownLinkText`)          | Gerçek başlık İngilizce: "Visit the following resources to learn more:"                                                               |
| `KAYNAK_SIRASI`, `konuDogrula`       | `scripts/lib/official-roadmap-topic.ts` (tür listesi), `contributing.md` (8 bağlantı, sıra, GeeksforGeeks yasağı) | Gerçekte bu kuralları gözden geçiren bakımcılar uygular; otomatik denetim yok. https zorunluluğu ve tekrar denetimi mini'nin eklemesi |
| `svgCiz`, `htmlSayfasi`, `ilerleme*` | Bu depoda yok: site ve ilerleme sistemi başka yerde                                                               | Sitenin gerçek çizim ve ilerleme kodu incelenemedi (doğrulanmadı)                                                                     |
| `olustur.js`                         | `.github/workflows/sync-repo-to-database.yml` (içerik → site)                                                     | Gerçekte içerik bir API'ye gönderilir; site kodu bu depoda yok, sitenin nasıl yayımlandığı doğrulanmadı                               |

## Gerçek ölçeğe giden yol

1. Düzenleyici: düğüm sürükle-bırak, kenar çizme, hizalama (gerçekte draw.roadmap.sh); belgeyi JSON olarak kaydet.
2. Sunucu: belgeyi ve konuları veritabanında tut, içerik deposuyla iki yönlü senkron (bu deponun `scripts/` klasörü).
3. Kullanıcı hesabı: ilerlemeyi sunucuda sakla, cihazlar arası birleştirme, paylaşılabilir ilerleme sayfası.
4. Ölçek: 97 yol haritası, 11.000'den fazla konu dosyası; CDN önbelleği ve önbellek temizleme iş akışları.
5. Topluluk: yalnızca içerik PR'ları, düğüm değişiklikleri için konu (issue) akışı, otomatik etiketleme.
