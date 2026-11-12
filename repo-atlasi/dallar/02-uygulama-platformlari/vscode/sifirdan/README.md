# Mini VS Code çekirdeği — sıfırdan

Bu klasör VS Code'un dört temel fikrini, ekran çizmeden, saf Node.js ile yeniden kurar:

1. **Metin arabelleği:** dosyayı tek string yerine "parça tablosu" olarak tutmak.
2. **Komut + bağlam + kısayol:** her eylemin bir komut olması, `when` ifadeleri ve akorlu kısayollar.
3. **Eklenti sunucusu:** eklentileri ayrı bir iş parçacığında çalıştırıp vekil (proxy) nesnelerle RPC.
4. **Katkı noktaları:** eklentinin `package.json` bildirimini kod çalıştırmadan okuyup paleti, kısayolları ve
   ayarları doldurmak; eklentiyi ancak gerektiğinde yüklemek.

Kod özgündür; VS Code'dan kopyalanmamıştır. Gerçek dosyalarla karşılaştırma için aşağıdaki eşleme tablosunu kullan.

## Gereksinimler

- Node.js 22 veya üstü (yalnızca yerleşik modüller: `node:worker_threads`, `node:module`, `node:test`).
- Paket kurulumu yok, internet gerekmez.

## Çalıştırma

```bash
cd repo-atlasi/dallar/02-uygulama-platformlari/vscode/sifirdan
node demo.js          # paleti yazdırır, ctrl+k ctrl+u akorunu basar, eklentiyi tembel yükler
node --test           # 25 test (model tabanlı 2000 adımlık rastgele test dahil)
```

Beklenen demo çıktısının özü:

```text
Komut paleti    :
  - Metin: Belgeyi Büyük Harfe Çevir  [ctrl+k ctrl+u]  (atlas.buyuk-harf)
Etkin mi?       : false
ctrl+k          : (ctrl+k) basıldı, ikinci tuş bekleniyor
ctrl+u          : çalıştı: metin.buyukHarf
Belge           : "İSTANBUL VE İZMİR\nIRMAK ILIK"
Etkin mi?       : true
Bozuk eklenti   : 'hatali.calis' komutu bulunamadı
```

## Dosyalar ve aşamalar

| Aşama | Dosya                                                    | Ne yapar                                                                     |
| ----- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1     | `asama1_parca_tablosu.js`                                | Ekle/sil, satır sayısı, satır içeriği, ofset ↔ (satır, sütun), anlık görüntü |
| 2     | `asama2_komutlar.js`                                     | Komut kaydı, `onCommand:` etkinleştirme, `when` ayrıştırıcısı, tuş çözümleme |
| 3     | `asama3_rpc.js`                                          | `$` ile başlayan yöntemleri uzak çağrıya çeviren vekil + istek/yanıt         |
| 3     | `asama3_eklenti_sunucusu.js`                             | Ana taraf: iş parçacığını başlatır, `MainThreadCommands`'ı yayımlar          |
| 3     | `asama3_eklenti_isci.js`                                 | Eklenti tarafı: `require('vscode')` yakalama, tembel `activate`              |
| 4     | `asama4_katki_noktalari.js`                              | Bildirim doğrulama, katkı noktası kaydı, örtük etkinleştirme olayları        |
| —     | `tezgah.js`, `demo.js`                                   | Hepsini birleştiren küçük "workbench" ve gösteri                             |
| —     | `ornek-eklentiler/buyuk-harf`, `ornek-eklentiler/hatali` | CommonJS örnek eklentiler (biri bilerek bozuk)                               |
| —     | `test/*.test.js`                                         | Aşama başına testler                                                         |

### Aşama 1 — Parça tablosu

Belge = parça listesi. Her parça "hangi arabellek, nereden başlıyor, kaç karakter, içinde kaç `\n` var" bilgisini
taşır. Özgün dosya salt okunur arabellekte kalır; yazılan her şey **yalnızca sona eklenen** değişiklik arabelleğine
gider. Silmek, parçaları kırpmaktır; hiçbir arabellek küçülmez. Bunun iki büyük sonucu var:

- Büyük dosyada ortaya bir harf eklemek dev bir string kopyalamaz.
- Anlık görüntü (`createSnapshot`) yalnızca parça listesini kopyalar; dosya kaydedilirken yazmaya devam edebilirsin.

Satır sorguları her parçadaki satır sonu sayısının önek toplamıyla yapılır. Gerçek VS Code aynı bilgiyi kırmızı-siyah
ağacın düğümlerinde (`size_left`, `lf_left`) tutar; böylece her düzenleme ve sorgu O(log n) olur. Bizim önek dizimiz
her düzenlemeden sonra O(parça sayısı) maliyetle yeniden kurulur. Bu farkı alıştırmalarda kapatacaksın.

**Test fikri:** `test/parca_tablosu.test.js` içindeki model tabanlı test, 2000 rastgele ekle/sil işlemini hem parça
tablosuna hem düz bir string'e uygular ve her adımda sonuçları karşılaştırır. Gerçek depoda da benzer rastgele testler
var: `src/vs/editor/test/common/model/pieceTreeTextBuffer/pieceTreeTextBuffer.test.ts`.

### Aşama 2 — Komutlar, bağlam anahtarları, kısayollar

- `CommandRegistry`: kimlik → işleyici. Aynı kimlik ikinci kez kaydedilirse öncekini gölgeler.
- `CommandService.executeCommand`: komut yoksa önce `onCommand:<id>` olayıyla eklentileri uyandırır, sonra çalıştırır.
- `parseWhen` / `evaluateWhen`: `a && (b || !c)`, `x == 'y'`, `ext =~ /\.md$/`, `n >= 2`, `dosya in liste`.
  Öncelik gerçek ayrıştırıcıyla aynı: `||` en zayıf, sonra `&&`, sonra `!`.
- `KeybindingResolver`: ilk akora göre aday listesi; **sondan başa** bakılır, böylece kullanıcının kısayolu
  varsayılanı ezer. `-komut` girdisi varsayılanı siler. İki akorlu kısayolda ilk tuş "devamı bekleniyor" döner.

### Aşama 3 — Eklenti sunucusu ve RPC

```text
ana iş parçacığı (arayüz)                     worker_threads (eklenti sunucusu)
──────────────────────────                    ───────────────────────────────────
MainThreadCommands  ◄──── $registerCommand ── vscode.commands.registerCommand
CommandService.executeCommand
  └ onCommand: olayı ──── $activateByEvent ─► require(extension.js) → activate()
  └ komut çağrısı ──── $executeContributedCommand ─► işleyici
MainThreadWindow    ◄──── $showMessage ────── vscode.window.showInformationMessage
```

- Vekil nesnede yalnızca `$` ile başlayan adlar uzak çağrıya dönüşür (gerçek `rpcProtocol.ts` ile aynı kural).
- Her eklenti kendi `vscode` nesnesini alır: `Module._load` sarılarak `require('vscode')` çağrısının hangi eklenti
  klasöründen geldiğine bakılır.
- Bir eklentinin `activate` hatası yalnızca o eklentiyi etkiler; diğerleri ve ana taraf çalışmaya devam eder.
- Eklenti sunucusu çökerse (`process.exit`) bekleyen çağrılar reddedilir, ana taraf bir hata mesajı gösterir.

### Aşama 4 — Katkı noktaları

`eklentileriTara` her eklentinin `package.json`'unu okur, doğrular ve **kod çalıştırmadan** şunları üretir:
komut paleti satırları (`commands`), kısayollar (`keybindings`), ayar varsayılanları (`configuration`) ve örtük
etkinleştirme olayları (`commands` katkısı otomatik olarak `onCommand:<id>` üretir).

## Eşleme tablosu

| Mini'deki parça                      | Gerçek depodaki karşılığı (dosya yolu)                                                                                                 | Fark                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ParcaTablosu`                       | `src/vs/editor/common/model/pieceTreeTextBuffer/pieceTreeBase.ts` (`PieceTreeBase`)                                                    | Gerçekte kırmızı-siyah ağaç (`rbTreeBase.ts`), 64 KB'lık özgün parçalar, CRLF onarımı, arama önbelleği |
| `satirBaslari`                       | Aynı dosyada `createLineStartsFast`                                                                                                    | Gerçek sürüm `Uint16Array`/`Uint32Array` kullanır ve `\r` ile `\r\n`'i de sayar                        |
| `createSnapshot`                     | `PieceTreeSnapshot` (aynı dosya)                                                                                                       | Gerçek görüntü parça parça okunur (akış), BOM ekler                                                    |
| `CommandRegistry`                    | `src/vs/platform/commands/common/commands.ts` (`CommandsRegistry`)                                                                     | Gerçekte işleyici ilk argüman olarak `ServicesAccessor` alır (bağımlılık enjeksiyonu)                  |
| `CommandService`                     | `src/vs/workbench/services/commands/common/commandService.ts`                                                                          | Gerçekte `*` etkinleştirmesi ve 30 sn'lik yarış da var                                                 |
| `ContextKeyService`                  | `src/vs/platform/contextkey/browser/contextKeyService.ts`                                                                              | Gerçekte bağlamlar DOM öğelerine bağlıdır ve değişiklik olayları yayınlar                              |
| `parseWhen` / `evaluateWhen`         | `src/vs/platform/contextkey/common/contextkey.ts` (`Parser`), `scanner.ts`                                                             | Gerçekte ifadeler sınıf hiyerarşisi, sadeleştirme ve "içerme" (implication) denetimi                   |
| `KeybindingResolver`                 | `src/vs/platform/keybinding/common/keybindingResolver.ts`                                                                              | Gerçekte klavye düzenine göre çözülmüş tuş kodları, `isBubble`, ayrıntılı günlük                       |
| `KeybindingDispatcher`               | `src/vs/platform/keybinding/common/abstractKeybindingService.ts`                                                                       | Gerçekte durum çubuğunda "akor bekleniyor" mesajı ve zaman aşımı                                       |
| `RpcProtocol`                        | `src/vs/workbench/services/extensions/common/rpcProtocol.ts`, `proxyIdentifier.ts`                                                     | Gerçekte ikili mesaj biçimi, iptal belirteçleri, `Acknowledged` mesajı, yanıt süresi izleme            |
| `ExtensionHost`                      | `src/vs/workbench/services/extensions/common/extensionHostManager.ts`, `.../electron-browser/localProcessExtensionHost.ts`             | Gerçekte ayrı süreç (Electron utility process) ve `MessagePort`; yeniden başlatma                      |
| `MainThreadCommands`                 | `src/vs/workbench/api/browser/mainThreadCommands.ts`                                                                                   | Gerçekte argümanlar ve URI'ler dönüştürülür (`revive`)                                                 |
| İşçi tarafı `ExtHostCommands`        | `src/vs/workbench/api/common/extHostCommands.ts`                                                                                       | Gerçekte argüman dönüştürücüleri ve API komutları                                                      |
| `apiAl` (eklenti başına API)         | `src/vs/workbench/api/common/extHost.api.impl.ts`                                                                                      | Gerçek API yüzlerce fonksiyon; sözleşmesi `src/vscode-dts/vscode.d.ts`                                 |
| `Module._load` sarmalayıcısı         | `src/vs/workbench/api/node/extHostExtensionService.ts`, `src/vs/workbench/api/common/extHostRequireInterceptor.ts`                     | Gerçekte ESM eklentileri için `module.registerHooks` da kullanılır                                     |
| `ExtensionPointRegistry`             | `src/vs/workbench/services/extensions/common/extensionsRegistry.ts`                                                                    | Gerçekte JSON şeması ile doğrulama ve `ExtensionPointUserDelta` (artımlı güncelleme)                   |
| `commands` / `keybindings` noktaları | `src/vs/workbench/services/actions/common/menusExtensionPoint.ts`, `src/vs/workbench/services/keybinding/browser/keybindingService.ts` | Gerçekte `menus`, `submenus`, ikonlar ve menü konumları                                                |
| `etkinlestirmeOlaylari`              | `src/vs/platform/extensionManagement/common/implicitActivationEvents.ts`                                                               | Gerçekte her katkı noktası kendi üreticisini kaydeder                                                  |
| `bildirimiDogrula`                   | `src/vs/platform/extensions/common/extensionValidator.ts`                                                                              | Gerçekte `engines.vscode` sürüm uyumu, yayıncı adı kuralları                                           |

## Gerçek ölçeğe giden yol

Önce **doğruluk ve performans**, sonra **izolasyon**, en son **ekosistem**:

1. Parça listesini dengeli ağaca çevir (önce treap, sonra kırmızı-siyah) ve satır sorgularını O(log n) yap.
2. Geri al/yinele yığını ekle (gerçek: `src/vs/editor/common/model/editStack.ts`).
3. RPC'ye iptal belirteci ve zaman aşımı ekle; ikili mesaj biçimine geç.
4. Eklenti sunucusunu iş parçacığı yerine ayrı süreç yap (`child_process.fork`), çökünce yeniden başlat.
5. Bildirimleri JSON şemasıyla doğrula, `menus` ve `views` noktalarını ekle.
6. Ancak bundan sonra arayüz: DOM tabanlı editör görünümü, sanal kaydırma, sözdizimi renklendirme.
