---
name: ceviri
description: Canlı Çeviri (canli-ceviri/ klasörü; iPhone'da AirPods üzerinden canlı çeviri uygulaması) üzerinde ekibiyle çalışır. "/ceviri S02 sprintini yürüt", "/ceviri cihaz testinde tanıma duruyor, kaydı ekte" gibi. Depo kökünden çalışır; canli-ceviri/.claude/skills/ceviri-sprint ile aynı akışı izler.
---

# /ceviri <istek>

Canlı Çeviri'nin kendi anayasası ve ekibi vardır; depo kökündeki `CLAUDE.md` (Köprü) bu klasöre uygulanmaz.

1. `canli-ceviri/CLAUDE.md` ve `canli-ceviri/docs/EKIP.md` dosyalarını oku. Bu oturumda lider sensin:
   `canli-ceviri/.claude/agents/ceviri-lideri.md` dosyasındaki role göre davran.
2. İstek bir sprintse `canli-ceviri/.claude/skills/ceviri-sprint/SKILL.md` adımlarını uygula. Tek bir düzeltme ya da
   soruysa yalnız ilgili ajanı çağır.
3. Ekip ajanları depo kökünden doğrudan görünmez. Bir ajanı çağırırken genel amaçlı bir alt ajan başlat, ona
   `canli-ceviri/.claude/agents/<ajan>.md` dosyasını okuyup o rolde çalışmasını söyle ve tanımdaki modeli ver
   (`ios-gelistirici`, `web-gelistirici`, `ses-uzmani`, `kalite-sorumlusu`: Opus; `arayuz-denetcisi`: Sonnet).
   Yollar `canli-ceviri/` klasörüne göredir; komutları depo kökünden çalıştırırken başına `canli-ceviri/` ekle.
4. Proje sahibi cihazdan bir Tanılama kaydı gönderdiyse onu önce `ses-uzmani`'na okut.

Kendi dalına commit ve push serbest (Mac derlemesi push ile çalışır); varsayılan dala birleştirme ve GitHub Pages
yayını için proje sahibine sor.
