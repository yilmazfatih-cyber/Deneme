# Ekip için kodlama ajanı rehberi

Bu rehber `ajankur` kurulum paketiyle geldi. Amaç: herkesin aynı kurallarla, aynı komutlarla ve güvenli biçimde
ajan kullanması.

## Ne kuruldu

- `AGENTS.md`: proje komutları, doğrulama sırası, çalışma ve güvenlik kuralları. Tek doğru kaynak budur.
- `CLAUDE.md`: tek satır, `@AGENTS.md`. Claude Code talimatları buradan okur.
- `{{BECERI_DIZINI}}/`: başlangıç becerileri ({{BECERI_ADLARI}}).
- `.claude/hooks/guvenlik_kancasi.py` ve `.claude/settings.json`: Claude Code'da tehlikeli komutları engelleyen kanca
  ve kanca çalışmasa da geçerli kalan izin yasakları (`permissions.deny`).
- `opencode.json`: opencode izinleri: yalın test ve lint komutları serbest, yıkıcı komutlar yasak, gerisi onaylı.

## Hangi araç neyi okur

- **Claude Code:** `CLAUDE.md` (içindeki `@AGENTS.md` ile), beceriler `.claude/skills/`. Beceriler `.agents/skills/`
  altındaysa `ln -s ../.agents/skills .claude/skills` bağlantısı yeterli.
- **opencode:** `AGENTS.md` (yoksa `CLAUDE.md`); beceriler `.opencode/skills/`, `.claude/skills/`, `.agents/skills/`.
- **OpenClaw:** çalışma alanındaki `skills/` ve `.agents/skills/`.
- **Hermes:** `.hermes/skills/` ve `.agents/skills/`; depoya bir kez `hermes skills trust` demek gerekir.

## İlk hafta

1. Herkes `AGENTS.md`'yi okur ve "Komutlar" tablosundaki eksikleri tamamlar.
2. Kancayı her geliştiricinin makinesinde sınayın: ajandan `git push` istediğinizde engellendiğini görün.
3. Küçük bir hatayı `tdd` becerisiyle düzeltin; inceleme isteğinde ajan kullandığınızı belirtin.
4. Haftada 30 dakika: ajanın yaptığı hataları konuşun, kalıcı olanları `AGENTS.md`'ye kural olarak yazın.

## Ekip kuralları

- Ajan çıktısı stajyer kodu gibidir: insan incelemesi olmadan ana dala girmez.
- Müşteri verisi ve gizli bilgi bulut modele gönderilmez (KVKK ve gizlilik sözleşmeleri). Gerekirse yerel model.
- Yeni beceri ya da kanca eklemeden önce: `python3 -m ajankur denetle .`
- Üçüncü taraf beceri ve kancaları satır satır okuyun; onlar da bir tedarik zinciri parçasıdır.

## Kancanın sınırları ve asıl önlemler

Kanca bir emniyet kemeridir; kararlı biri onu atlatabilir (ör. içinde `git push` olan bir `npm run release`
betiği). Asıl sınırlar şunlardır:

- **Sunucuda dal koruması:** ana dala doğrudan ve zorla gönderme kapalı, birleştirme yalnız incelemeyle. Kanca
  atlatılsa bile ana dal korunur.
- **Ayrı kimlik ve yalıtım:** ajanı kişisel hesaplarınızdan ayrı bir kullanıcıda ya da kapsayıcıda (devcontainer,
  sanal makine) çalıştırın; kısa ömürlü, dar yetkili erişim belirteçleri kullanın.
- **İzin yasakları:** `.claude/settings.json` içindeki `permissions.deny` satırları kanca çalışmasa da geçerlidir.
  Bu yüzden `.env.example` dahil `.env*` dosyaları Claude Code'da okunamaz; gerekirse o satırı kaldırın.
- **Kanca çalışmazsa:** Claude Code yalnız çıkış kodu 2'de engeller. `python3` bulunamazsa ya da kanca çökerse
  araç engellenmez. Windows'ta kancayı ilk gün sınayın; çalışmıyorsa komutu ortamınıza göre düzenleyin.
- **opencode `--auto` kipi:** onay isteyen (`ask`) her şeyi kendiliğinden onaylar; yalnız `deny` kuralları kalır.

## Ölçüm

Kurulumdan önce ve dört hafta sonra karşılaştırın: inceleme isteği başına tur sayısı, geri alınan commit sayısı,
CI'nin kırmızı kalma oranı ve ekibin kendi değerlendirmesi. Ekip düzeyinde ölçün: kişi bazında ölçüm çalışanların
kişisel verisidir; önce çalışanları bilgilendirmek (KVKK md. 10) ve amaçla ölçülü kalmak gerekir.
