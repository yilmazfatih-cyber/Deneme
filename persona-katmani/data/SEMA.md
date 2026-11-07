# `data/kaynak/*.csv` sütun şeması

Her satır bir makaleden çıkarılmış **tek bir etki/bulgu**dur. Aynı makaleden birden çok satır olabilir. Virgülle ayrılmış, UTF-8, başlık satırı var.

| Sütun | Açıklama |
| --- | --- |
| kayit_id | `EK-001` (ekonomik), `RK-001` (uygulama içi reklam), `WB-001` (web ürün) |
| alan | ekonomik_davranis · uygulama_reklam · web_urun |
| alt_konu | ör. kayıptan kaçınma, banner körlüğü, yorum etkisi |
| etki_adi | Kısa ad |
| etki_tanimi | Bir cümle: ne, neye göre, hangi sonuç değişkeninde |
| yon | pozitif · negatif · ters-U · yok |
| etki_buyuklugu_deger | Sayı (ör. 1.31, 0.23, 12) |
| etki_buyuklugu_olcusu | lambda · Cohen d · r · OR · beta · yüzde puan · esneklik · diğer |
| guven_araligi | "%95 GA 1.10–1.53" gibi; yoksa boş |
| orneklem_n | Toplam katılımcı/gözlem; meta-analizde k çalışma + N |
| populasyon_ulke | Ülke(ler); çok ülkeli ise "76 ülke (TR dahil)" |
| populasyon_yas | Yaş aralığı veya "öğrenci", "yetişkin panel" |
| baglam | laboratuvar · çevrimiçi panel · saha · gerçek işlem/log verisi |
| yontem | deney · RCT · meta-analiz · gözlemsel · replikasyon · anket |
| moderator_degisken | Farkı yaratan değişken: yaş, gelir, eğitim, kültür/ülke, cinsiyet, deneyim, cihaz, ürün kategorisi, kişilik |
| moderator_yonu_ve_buyuklugu | ör. "yaşla artar, β=0.08/10 yıl"; "yüksek gelirde yarıya iner" |
| bireysel_fark_olcegi | Varsa ölçek: Big Five, CRT, sayısal okuryazarlık, maksimizasyon ölçeği, düzenleyici odak |
| persona_parametresi | Dijital ikizde hangi parametreye bağlanır: lambda_kayip, beta_simdicilik, delta_iskonto, rho_risk, w_sosyal_kanit, tau_reklam_tolerans, eta_fiyat, w_yorum, kappa_secim_yuku, theta_kitlik, phi_guven_isareti, sabir, dikkat_esigi, varsayilan_yapiskanlik |
| parametre_dagilimi_onerisi | Prior önerisi: ör. lognormal(ln 1.3, 0.4); beta(2,5) |
| kanit_gucu | 1–5: 5 = kayıtlı ön tescilli meta-analiz/çok ülkeli; 4 = meta-analiz; 3 = çok çalışmalı deney veya büyük saha; 2 = tek deney; 1 = gözlemsel/anket |
| yazarlar | "Soyad, Soyad & Soyad" |
| yil | |
| baslik | |
| dergi | |
| doi | 10.xxxx/… (yoksa arXiv id) |
| url | |
| kaynak_dogrulama | crossref · arxiv · semanticscholar · websearch (meta veri hangi kaynakla doğrulandı) |
| notlar | Replikasyon durumu, çelişen bulgular, dikkat edilecekler |
