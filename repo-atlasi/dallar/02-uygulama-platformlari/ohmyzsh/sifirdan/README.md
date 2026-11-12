# mini-omz — Oh My Zsh'nin çekirdeği, sıfırdan

Oh My Zsh'nin 300'den fazla eklentisi ve 140'tan fazla teması var ama çekirdeği şaşırtıcı derecede küçük:
347 satırlık bir yükleyici (`oh-my-zsh.sh`), `lib/` altındaki ortak dosyalar ve bir güncelleme denetçisi.
Bu klasör aynı mimariyi zsh ile yeniden kurar:

1. **Yükleyici:** `lib/*.zsh` → `plugins` dizisindeki eklentiler → `custom/*.zsh` → tema; her adımda `custom/`
   ile geçersiz kılma.
2. **Eklenti:** fonksiyon + takma adlar + `_ad` dosyasında tamamlama (`fpath` + `compinit`).
3. **Tema:** git dalını ve kirliliğini gösteren istem (`prompt_subst`, `%F{…}`, `%(?.…)`).
4. **Kancalar:** `precmd`/`preexec` ile terminal başlığı ve uzun süren komutun süresi.
5. **Güncelleme denetimi:** sıklık, kilit, `disabled/reminder/auto` modları.

Kod özgündür; Oh My Zsh'den kopyalanmamıştır. Dosya ve değişken adları gerçeğe benzetildi ki karşılaştırma kolay olsun.

## Gereksinimler

- zsh 5.x (bu ortamda `apt-get install -y zsh` ile kuruldu: zsh 5.9) ve git.
- Testler bash ile yazıldı ve her senaryoda `zsh -f` (kullanıcı ayarlarını okumayan zsh) açar.
  zsh yoksa `test.sh` "ATLANDI" yazıp 0 ile çıkar.

## Çalıştırma

```bash
cd repo-atlasi/dallar/02-uygulama-platformlari/ohmyzsh/sifirdan
bash test.sh                        # 40 doğrulama, geçici HOME içinde, ağ kullanmadan

# Kendi kabuğunda denemek için (gerçek ~/.zshrc'ne dokunmadan):
export ZDOTDIR="$(mktemp -d)"
sed "s|\$HOME/.mini-omz|$PWD/mini-omz|" mini-omz/templates/zshrc.ornek > "$ZDOTDIR/.zshrc"
zsh                                 # istem: "> sifirdan git:(…) "; selam <TAB> tamamlamayı dene
```

## Dosyalar

```text
sifirdan/
├── test.sh                           Bash test koşucusu (40 doğrulama)
└── mini-omz/
    ├── mini-omz.sh                   Yükleyici (gerçek: oh-my-zsh.sh)
    ├── lib/git.zsh                   git_prompt_info, parse_git_dirty, git_current_branch
    ├── lib/gorunum.zsh               prompt_subst, ls renkleri
    ├── lib/tarihce.zsh               geçmiş ayarları
    ├── lib/kancalar.zsh              precmd/preexec: başlık + komut süresi
    ├── lib/komut.zsh                 mini_omz eklentiler | temalar | guncelle
    ├── plugins/selam/                selam.plugin.zsh + _selam (tamamlama)
    ├── plugins/git-kisa/             git takma adları, git_ana_dal
    ├── themes/sade.zsh-theme         İstem teması
    ├── tools/guncelleme-kontrol.zsh  Güncelleme denetimi + mini_omz_guncelle
    ├── custom/ornek.zsh              Kullanıcı geçersiz kılma örneği
    └── templates/zshrc.ornek         Örnek ~/.zshrc
```

## Aşamalar

| Aşama                  | Ne yaparsın                                                                                               | Test edilen davranış                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1. Yükleyici           | Dizinleri bul, `lib/*.zsh(N)` döngüsü, `_mini_kaynak` ile custom önceliği                                 | Eklenti fonksiyonu ve takma adları tanımlı; eksik eklenti/tema uyarısı; bash ile kaynaklanınca nazik ret |
| 2. Eklenti + tamamlama | `plugins/<ad>/<ad>.plugin.zsh`, `plugins/<ad>/_<ad>`, eklenti dizinini `compinit`'ten önce `fpath`'e ekle | `$_comps[selam]` = `_selam`                                                                              |
| 3. Tema                | `PROMPT` tek tırnakla, `$(git_prompt_info)`, `ZSH_THEME_GIT_PROMPT_*` değişkenleri                        | Temiz/kirli depo, depo dışı, başarısız komut sonrası kırmızı ok, `%` içeren dal adı                      |
| 4. Kancalar            | `add-zsh-hook precmd/preexec`, `EPOCHREALTIME`                                                            | 3 sn'lik komutta `RPROMPT` "3s", kısa komutta boş                                                        |
| 5. Güncelleme          | Damga dosyası, sıklık, `mkdir` kilidi, `git ls-remote`, `merge-base --is-ancestor`                        | İlk açılış, sıklık dolmadan, kilitli, disabled, reminder, auto, zaten güncel, üst depo koruması          |

Testte öğrenilen bir tuzak: **takma adlar komut satırı ayrıştırılırken açılır.** `zsh -c "…"` tüm metni baştan
ayrıştırdığı için yüklemeden sonra tanımlanan bir takma ad aynı betikte çalışmaz; testte `eval` kullanıyoruz.
Betiklerinde takma ad yerine fonksiyon kullanmanın nedeni budur.

## Eşleme tablosu

| Mini'deki parça                    | Gerçek depodaki karşılığı (dosya yolu)                                                    | Fark                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mini-omz.sh`                      | `oh-my-zsh.sh`                                                                            | Gerçekte emülasyon modu denetimi, macOS'ta ana makine adı önbelleği, zcompdump'a commit kimliği ve fpath üst verisi yazıp gerektiğinde silme, `zrecompile`           |
| `_mini_kaynak`                     | `oh-my-zsh.sh` içindeki `_omz_source`                                                     | Gerçekte global takma adlar (`galiases`) da geri alınır                                                                                                              |
| `_mini_eklenti_mi` + fpath döngüsü | `oh-my-zsh.sh` içindeki `is_plugin` döngüsü                                               | Aynı fikir                                                                                                                                                           |
| `compinit -i -d …`                 | `oh-my-zsh.sh` + `lib/compfix.zsh` (`handle_completion_insecurities`)                     | Gerçekte güvensiz dizinler için ayrıntılı uyarı, `ZSH_DISABLE_COMPFIX`                                                                                               |
| `lib/git.zsh`                      | `lib/git.zsh`                                                                             | Gerçekte upstream bilgisi, `git_prompt_status`, `lib/async_prompt.zsh` ile eşzamansız istem                                                                          |
| `lib/kancalar.zsh`                 | `lib/termsupport.zsh`                                                                     | Gerçekte terminal türüne göre başlık, `DISABLE_AUTO_TITLE`; süre ölçümü çekirdekte yok: `plugins/timer` eklentisi ve bazı temalar (ör. `refined`) yapar              |
| `lib/komut.zsh` (`mini_omz`)       | `lib/cli.zsh` (`omz` komutu, 976 satır)                                                   | Gerçekte eklenti aç/kapa, tema ayarla, `omz reload`, `omz update`                                                                                                    |
| `plugins/selam/_selam`             | Örnek: `plugins/ant/_ant`, `plugins/bazel/_bazel` (95 eklentide 96 tamamlama dosyası var) | Aynı biçim                                                                                                                                                           |
| `plugins/git-kisa`                 | `plugins/git/git.plugin.zsh` (449 satır, 204 takma ad)                                    | Gerçekte sürüm denetimi ve yüzlerce kısaltma                                                                                                                         |
| `themes/sade.zsh-theme`            | `themes/robbyrussell.zsh-theme` (varsayılan tema)                                         | Gerçekte `$fg_bold[...]` renk dizileri ve `%1{➜%}` ile genişlik ipucu                                                                                                |
| `tools/guncelleme-kontrol.zsh`     | `tools/check_for_upgrade.sh`, `tools/upgrade.sh`                                          | Gerçekte GitHub API'sine `curl` ile sorulur, `prompt` (kullanıcıya sor) ve `background-alpha` modları, `cooldown` ayarı, kullanıcı tuşa bastıysa sormadan hatırlatma |
| `custom/` önceliği                 | `custom/` + `ZSH_CUSTOM`                                                                  | Aynı fikir                                                                                                                                                           |
| `templates/zshrc.ornek`            | `templates/zshrc.zsh-template`                                                            | Gerçek şablon yorumlarla tüm seçenekleri anlatır                                                                                                                     |
| `test.sh`                          | `.github/workflows/main.yml` (`zsh -n` sözdizimi denetimi) ve `lib/tests/cli.test.zsh`    | Gerçek CI ağırlıkla sözdizimi denetler; bizim testler davranışı da doğrular                                                                                          |

## zsh'ye özgü olan ne? (bash ile yazsaydın ne değişirdi)

| Konu                  | zsh (bu mini)                                                                                            | bash karşılığı                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Tamamlama             | `fpath` dizinindeki `_ad` dosyaları + `compinit`; `#compdef ad` satırı bağlar; `_arguments`, `_describe` | `bash-completion` paketi; `complete -F _fonksiyon komut`, `COMPREPLY` dizisi, `compgen` |
| İstem genişletme      | `%~`, `%F{red}`, `%(?.a.b)`, `%n@%m`; `setopt prompt_subst` ile `$(…)`                                   | `\w`, `\u@\h`, renkler için `\[\e[31m\]`; `$(…)` her zaman genişler (`promptvars`)      |
| Kancalar              | `precmd_functions`, `preexec_functions`, `add-zsh-hook`                                                  | `PROMPT_COMMAND` (bash 5.1+ dizi olabilir); `preexec` için `trap … DEBUG` hilesi        |
| Şu anki dosyanın yolu | `${(%):-%x}`                                                                                             | `${BASH_SOURCE[0]}`                                                                     |
| Eşleşmesiz glob       | `*.zsh(N)` niteleyicisi                                                                                  | `shopt -s nullglob`                                                                     |
| Ayar sistemi          | `zstyle ':bağlam' anahtar değer`                                                                         | Yok; düz değişkenler                                                                    |
| Zaman                 | `zmodload zsh/datetime` → `EPOCHSECONDS`, `EPOCHREALTIME`                                                | `EPOCHSECONDS`, `EPOCHREALTIME` (bash 5.0+)                                             |
| Dizide arama          | `${dizi[(Ie)değer]}`                                                                                     | Döngü ya da `[[ " ${dizi[*]} " == *" değer "* ]]`                                       |
| Blok sonu temizliği   | `{ … } always { … }`                                                                                     | `trap … RETURN` ya da alt kabuk                                                         |

## Gerçek ölçeğe giden yol

1. Başlangıç süresi: `zcompdump` önbelleğini commit kimliğiyle doğrula, `zrecompile` ile derle (`zprof` ile ölç).
2. Eşzamansız istem: büyük depolarda `git status` istemi yavaşlatır; `lib/async_prompt.zsh` gibi arka planda hesapla.
3. Güvenlik: `compaudit` ile güvensiz `fpath` dizinlerini raporla; istem içine girecek her dış veriyi kaçır.
4. Komut satırı aracı: eklenti aç/kapa, tema seç, `.zshrc`'yi güvenle düzenle (`lib/cli.zsh`).
5. Topluluk: eklenti başına README, CODEOWNERS, sözdizimi CI'ı; yüzlerce katkıcıyla bakım düzeni.
