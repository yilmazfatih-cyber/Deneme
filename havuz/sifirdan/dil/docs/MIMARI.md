# Mimari

Dokuz mini sistem birbirinden bağımsızdır; tek bağımlılık `sanal_makine → yorumlayici`'dır.

```
                       ┌───────────────────────── yorumlayici ─────────────────────────┐
 .tohum kaynak ──► lexer ──► parser/pratt ──► AST ──► resolver ──┬──► interp (ağaç yürür) ──► çıktı
                                                                  │       │
                                                                  │       └─ ops · values · natives (ORTAK anlam)
                                                                  │                ▲
                       ┌──────────────── sanal_makine ───────────┼────────────────┼──┐
                       │                                          └──► compiler ──► FunctionProto ──► vm ──► çıktı
                       │  random_programs ──► farksal test: interp çıktısı/hatası == vm çıktısı/hatası
                       └────────────────────────────────────────────────────────────────┘

 regex:            desen ──► parser ──► AST ──► compiler ──► NFA programı ──► pikevm ──► Match   (↔ re)
 json_ayristirici: metin ──► parser (özyinelemeli) ─┐   scanner (ortak tarama + hata iletileri)
                   parçalar ──► stream (yığın)   ───┴─► değer / olaylar;  writer: değer ──► metin (↔ json)
 sablon:           şablon ──► lexer ──► compiler + expr (kapanımlar) ──► render(ctx) ──► HTML (kaçışlı)
 markdown:         metin ──► blocks ──► blok ağacı ──► render ──► HTML;  inline + delimiters + safety + slug
 hesap:            ifade ──► lexer ──► shunting (RPN) ──► evaluate (Quantity + units) ──► sonuç
 fark:             a, b ──► myers (LCS) ──► opcodes ──► unified / patch / words / merge3        (↔ difflib)
 test_cercevesi:   yollar ──► discovery (+ rewrite: assert) ──► runner (+ fixtures) ──► report
```

## Ortak desenler

- **Boru hattı dosyalara bölünür** (`lexer` → `parser` → … ), her dosya ~300 satırın altında,
  Türkçe başlık yorumu ve "Genişletme:" satırıyla.
- **Hata = konum + beklenen + bulunan + ipucu.** Her sistemin kendi hata sınıfı vardır
  (`TohumError`, `RegexError`, `JsonError`, `TemplateError`, `CalcError`, `PatchError`) ve çoğu
  kaynak satırını şapkayla (`^`) gösteren bir `render` yöntemi taşır.
- **Kayıt tabloları** (yerleşik işlevler, süzgeçler, birimler, komutlar) tek bir sözlüktür ve
  `YENİ … BURAYA` yorumu taşır; otomatik keşif yoktur.
- **Sınırlar** (adım, derinlik, boyut) sistemin kendi içindedir; testleri `tests/<sistem>/` altında.
- **Farksal testler** bağımsız bir doğruya karşı yapılır (bkz. README "Ortak ilkeler").
