# Tabanı geliştirmek (kişisel Claude hesabında)

Ağır iş burada yapılır: yeni komut, yeni skill, yeni analiz yöntemi, test. Şirket hesabında yalnız `git pull` (ya da
ZIP yenileme) ve kullanım kalır.

## Tek kural: şirket verisi buraya gelmez

Kişisel hesaba **olay adı, sayı, ekran görüntüsü, anket yanıtı, müşteri adı getirmeyin.** Yalnız genel ihtiyacı
anlatın. Örnek istek şablonu:

```text
Analitik tabana şunu ekle:
- Ne: <ör. huni adımlarında medyan süre kıyası / haftalık rapora gelir KPI'ı>
- Hangi veriden: <Mixpanel kayıtlı huni | ham olay | Hotjar CSV>
- Çıktı: <tablo sütunları, en fazla kaç satır>
- Şirkette gördüğüm sorun: <genel tarif: "çok segmentli kırılımda çıktı uzun">
Demo verisiyle test et, belgeleri güncelle.
```

Gerekirse demo verisine benzer bir senaryo eklenir (`kit/analitik/demo.py`); gerçek veri gerekmez.

## Geliştirme ortamı

Kurulum yok; Python 3.9+ standart kütüphane. Depo kökünden:

```bash
cd analitik-taban && python3 -m unittest discover -s kit/tests -t kit
```

```bash
ANALITIK_YEREL=/tmp/analitik-demo/yerel python3 kit/kurulum.py baslat --demo
```

`ANALITIK_YEREL` demo/test çalışma alanını depo dışına alır. Lint: `ruff check kit && ruff format kit`
(ayarlar `pyproject.toml`, satır 120, hedef Python 3.9).

## Mimari

```text
CLAUDE.md                  her oturumda yüklenen protokol (İngilizce, kısa) — ~60 satırı geçmesin
.claude/settings.json      izinler (kit komutları serbest, .env ve ham veri okuma kapalı, push kapalı), model
.claude/skills/<ad>/       /komutlar: ne çalıştırılacağı + nasıl yorumlanacağı (kısa İngilizce, çıktı Türkçe)
.claude/agents/veri-cekici.md  MCP ham yanıtlarını ana bağlamdan uzak tutan Haiku alt ajanı
kit/mp.py, hj.py, ozet.py  komut satırı (Türkçe çıktı)
kit/kurulum.py             yerel/ kurulumu, CLAUDE.local.md, durum, test
kit/analitik/
  ayarlar.py               yerel/ayarlar.json + .env, proje saatine göre bugün
  istemci.py               HTTP: yeniden deneme, Türkçe hatalar, önbellek, gzip akış
  mixpanel.py, hotjar.py   API istemcileri (uç nokta ayrıntısı: docs/API-NOTLARI.md)
  analiz.py                dönemler, katkı/sapma, oran ayrıştırma, yerel huni, tutunma
  istatistik.py            oran testi, Wilson, MDE, SRM (ki-kare)
  ozetle.py, csvoku.py     CSV/XLSX okuma ve sınırlı özet
  metin.py                 Türkçe küçük/büyük harf, sık kelime, örneklem, tema kuralları, maskeleme
  sozluk.py, baglam.py, rapor.py, bicim.py
  demo.py, demo_hotjar.py  sentetik arka uç (gerçek API biçimleri, ekili sorunlar)
kit/tests/                 birim + sahte HTTP sunucusu + demo uçtan uca
```

## Token bütçesi kuralları (yeni şey eklerken)

- Komut çıktısı **≤ 40 satır** (uçtan uca test bunu denetler); ham yanıt `ham_kaydet` ile diske.
- Hesap betikte, yorum modelde. Model bir sayıyı elle hesaplıyorsa betiğe taşıyın.
- Skill açıklaması (frontmatter `description`) tek cümle: her oturumda listelenir. Gövde yalnız çağrılınca yüklenir.
- Claude'a giden talimatlar İngilizce ve kısa (Türkçe metin aynı içerik için daha çok token tutar); kullanıcıya
  giden her şey Türkçe.
- Yeni skill `.claude/skills/<ad>/SKILL.md`; yalnız kullanıcı çağırsın isteniyorsa `disable-model-invocation: true`.

## API değişirse

1. `docs/API-NOTLARI.md`'yi güncelleyin (kaynak + tarih).
2. `kit/analitik/mixpanel.py` / `hotjar.py`.
3. Aynı biçimi `demo.py` / `demo_hotjar.py` ve `kit/tests/test_api.py` örneklerine yansıtın.
4. Şirkette ilk gerçek yanıtı gördüğünüzde biçim farkı varsa yalnız **alan adlarını** (değerleri değil) not edip
   buraya getirin.

## Sürüm

`kit/analitik/__init__.py` → `SURUM`. Şirkette `python3 kit/kurulum.py surum` hangi sürümün kurulu olduğunu söyler.

| Sürüm | Değişiklik                                                                            |
| ----- | ------------------------------------------------------------------------------------- |
| 1.0.0 | İlk sürüm: 9 komut, Mixpanel API/MCP/CSV, Hotjar API/CSV, demo, sahte sunucu testleri |
