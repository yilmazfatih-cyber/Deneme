"""Niyet (intent) bulma: anahtar ifade + bulanık eşleme, öncelik sırasıyla.

Sıra önemlidir: "randevumu iptal etmek istiyorum" hem 'randevu' hem 'iptal' içerir;
listede önce gelen ('iptal') kazanır. Hiçbiri tutmazsa SSS denenir, o da tutmazsa
'bilinmiyor' döner (varsa yerel dil modeline düşülür).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time

from .metin import ifade_puani, kelime_eslesir, sadelestir, saat_bul, tarih_bul
from .yapilandirma import Hizmet, Isletme, Sss

# '=' ile başlayan ifade bulanık eşlenmez: "geliyorum" ile "gelemiyorum" harfçe çok benzer ama zıt anlamlıdır.
NIYETLER: list[tuple[str, tuple[str, ...]]] = [
    ("kimlik", ("/kimlik", "/kimligim")),
    ("veri_sil", ("verilerimi sil", "verilerimi silin", "kayıtlarımı sil", "/verilerimisil")),
    ("insan", ("yetkili", "insanla", "gerçek kişi", "biriyle görüş", "operatör", "işletme sahibi", "şikayet",
               "/insan")),
    ("randevularim", ("randevularım", "randevum ne zaman", "randevumu göster", "/randevularim")),
    ("iptal", ("iptal", "=gelemeyeceğim", "=gelemiyorum", "=gelemem", "=gelmeyeceğim", "=gelmiyorum", "/iptal")),
    ("degistir", ("değiştir", "ertele", "başka saate", "kaydır", "/degistir")),
    ("randevu", ("randevu", "yer var mı", "müsait", "boş saat", "boşluk", "sıra al", "rezervasyon", "/randevu")),
    ("fiyat", ("fiyat", "ücret", "kaç para", "ne kadar", "kaç lira", "kaç tl", "tarife")),
    ("adres", ("adres", "nerede", "neredesiniz", "konum", "yol tarifi", "nasıl gelirim", "harita")),
    ("saatler", ("çalışma saat", "kaçta açıl", "kaça kadar", "açık mı", "açık mısınız", "kaçta kapan", "kapalı mı")),
    ("kvkk", ("kvkk", "aydınlatma", "kişisel veri", "gizlilik")),
    ("tesekkur", ("teşekkür", "sağ ol", "sağolun", "eyvallah")),
    ("selam", ("merhaba", "selam", "iyi günler", "günaydın", "iyi akşamlar", "/start")),
    ("yardim", ("yardım", "menü", "/yardim", "/help")),
]


@dataclass(frozen=True)
class Niyet:
    ad: str
    hizmet: Hizmet | None = None
    tarih: date | None = None
    saat: time | None = None
    sss: Sss | None = None


def hizmet_bul(metin: str, isletme: Isletme) -> Hizmet | None:
    """En iyi eşleşen hizmeti seçer; eşitlikte belirsiz sayıp None döndürür.

    Birincil puan: tamamı geçen en uzun ifade ('saç sakal' 2 > 'saç' 1).
    Eşitlik bozucu: hizmet adındaki kelimelerden kaçının geçtiği
    ("çocuğum için saç" → 'Çocuk saç kesimi' iki kelimeyle 'Saç kesimi'ni geçer).
    """
    kelimeler = sadelestir(metin).split()
    puanlar = []
    for h in isletme.hizmetler:
        tam = max(ifade_puani(kelimeler, i) for i in (h.ad, h.kod.replace("-", " "), *h.anahtarlar))
        kismi = sum(1 for p in sadelestir(h.ad).split() if len(p) > 2 and any(kelime_eslesir(k, p) for k in kelimeler))
        puanlar.append(((tam, kismi), h))
    puanlar.sort(key=lambda p: p[0], reverse=True)
    if puanlar[0][0][0] == 0 or (len(puanlar) > 1 and puanlar[0][0] == puanlar[1][0]):
        return None
    return puanlar[0][1]


def sss_bul(metin: str, isletme: Isletme) -> Sss | None:
    kelimeler = sadelestir(metin).split()
    en_iyi = max(isletme.sss, key=lambda s: sum(ifade_puani(kelimeler, a) for a in s.anahtarlar), default=None)
    if en_iyi and any(ifade_puani(kelimeler, a) for a in en_iyi.anahtarlar):
        return en_iyi
    return None


def niyet_bul(metin: str, isletme: Isletme, bugun: date) -> Niyet:
    kelimeler = sadelestir(metin).split()
    ortak = {"hizmet": hizmet_bul(metin, isletme), "tarih": tarih_bul(metin, bugun), "saat": saat_bul(metin)}
    for ad, ifadeler in NIYETLER:
        if any(ifade_puani(kelimeler, i) for i in ifadeler):
            return Niyet(ad, **ortak)
        if ad == "randevu":
            # Eylem niyetleri bitti; bilgi niyetlerinden önce işletmenin kendi SSS'sine bak:
            # "merhaba, otopark var mı?" selam değil SSS'tir.
            sss = sss_bul(metin, isletme)
            if sss:
                return Niyet("sss", sss=sss, **ortak)
    # Yalnız hizmet ve tarih/saat yazıldıysa ("yarın 3'te saç") randevu isteği sayılır.
    if ortak["hizmet"] and (ortak["tarih"] or ortak["saat"]):
        return Niyet("randevu", **ortak)
    return Niyet("bilinmiyor", **ortak)
