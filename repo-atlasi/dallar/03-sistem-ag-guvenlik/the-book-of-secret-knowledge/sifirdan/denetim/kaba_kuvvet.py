"""auth.log içinde kaba kuvvet (brute-force) ve parola püskürtme tespiti.

Kayan pencere: bir IP'den PENCERE saniye içinde ESIK kadar başarısız deneme →
uyarı. Ayrıca: aynı IP'den çok farklı kullanıcı adı (kullanıcı adı taraması),
aynı kullanıcıya çok farklı IP'den deneme (dağıtık saldırı) ve en önemlisi
saldırgan IP'den sonradan gelen BAŞARILI giriş (olası ele geçirme).
fail2ban'ın çekirdek fikri budur; burada yalnız tespit edilir, engellenmez.
"""

import re
from collections import defaultdict, deque
from datetime import datetime

from .bulgu import Bulgu

_SYSLOG_ZAMAN = re.compile(r"^(?P<ay>[A-Z][a-z]{2})\s+(?P<gun>\d{1,2}) (?P<saat>\d\d:\d\d:\d\d) ")
_ISO_ZAMAN = re.compile(r"^(?P<iso>\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?) ")
_AYLAR = {a: i for i, a in enumerate(("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov",
                                      "Dec"), 1)}
_BASARISIZ = re.compile(r"Failed (?:password|publickey) for (?:invalid user )?(?P<kul>\S+) from (?P<ip>[\d.:a-fA-F]+)")
_GECERSIZ = re.compile(r"Invalid user (?P<kul>\S+) from (?P<ip>[\d.:a-fA-F]+)")
_BASARILI = re.compile(r"Accepted (?P<yontem>\S+) for (?P<kul>\S+) from (?P<ip>[\d.:a-fA-F]+)")


def zaman_oku(satir, yil):
    m = _ISO_ZAMAN.match(satir)
    if m:
        return datetime.fromisoformat(m["iso"].replace("Z", "+00:00")).replace(tzinfo=None)
    m = _SYSLOG_ZAMAN.match(satir)
    if m and m["ay"] in _AYLAR:  # klasik syslog'da yıl yazmaz: dışarıdan verilir
        return datetime.strptime(f"{yil}-{_AYLAR[m['ay']]}-{m['gun']} {m['saat']}", "%Y-%m-%d %H:%M:%S")
    return None


def olaylar(metin, yil):
    """(zaman, tür, kullanıcı, ip) üretir; tür: 'basarisiz' | 'basarili'."""
    for satir in metin.splitlines():
        if "sshd" not in satir:
            continue
        zaman = zaman_oku(satir, yil)
        if zaman is None:
            continue
        if m := _BASARISIZ.search(satir):
            yield zaman, "basarisiz", m["kul"], m["ip"]
        elif m := _BASARILI.search(satir):
            yield zaman, "basarili", m["kul"], m["ip"]
        elif m := _GECERSIZ.search(satir):
            # "Invalid user" ardından genelde "Failed password for invalid user" gelir;
            # çift saymamak için yalnız kullanıcı adı çeşitliliğine katkı verir.
            yield zaman, "gecersiz", m["kul"], m["ip"]


def analiz(metin, yil=None, esik=5, pencere=600, kullanici_esigi=4, dagitik_esik=5):
    yil = yil or datetime.now().year
    son_denemeler = defaultdict(deque)
    kullanicilar = defaultdict(set)
    ip_sayisi = defaultdict(set)
    saldirganlar = {}  # ip → ilk uyarı zamanı
    sayac = defaultdict(int)
    bulgular = []
    for zaman, tur, kul, ip in sorted(olaylar(metin, yil), key=lambda o: o[0]):
        kullanicilar[ip].add(kul)
        if tur == "gecersiz":
            continue
        if tur == "basarili":
            if ip in saldirganlar:
                bulgular.append(Bulgu("kritik", "LOG-003", f"kaba kuvvetten sonra başarılı giriş: {kul}@{ip}",
                                      f"{ip} {saldirganlar[ip]:%H:%M:%S}'de uyarı tetikledi; {zaman:%H:%M:%S}'de "
                                      f"'{kul}' olarak girdi.", "Oturumu inceleyin, parolayı değiştirin, hesabı "
                                      "kilitleyin; olay müdahale sürecini başlatın.", ip))
            continue
        sayac[ip] += 1
        ip_sayisi[kul].add(ip)
        q = son_denemeler[ip]
        q.append(zaman)
        while (zaman - q[0]).total_seconds() > pencere:
            q.popleft()
        if len(q) >= esik and ip not in saldirganlar:
            saldirganlar[ip] = zaman
            bulgular.append(Bulgu("yuksek", "LOG-001", f"kaba kuvvet: {ip}",
                                  f"{pencere // 60} dk içinde {len(q)} başarısız deneme (ilk uyarı {zaman:%H:%M:%S}).",
                                  "Parola girişini kapatın; fail2ban/nftables ile hız sınırı koyun.", ip))
    for ip, adlar in kullanicilar.items():
        if len(adlar) >= kullanici_esigi:
            bulgular.append(Bulgu("orta", "LOG-002", f"kullanıcı adı taraması: {ip}",
                                  f"{len(adlar)} farklı kullanıcı adı denendi: {', '.join(sorted(adlar)[:6])}",
                                  "Var olmayan kullanıcılarla gelen trafiği erken engelleyin; AllowGroups kullanın.", ip))
    for kul, ipler in ip_sayisi.items():
        if len(ipler) >= dagitik_esik:
            bulgular.append(Bulgu("orta", "LOG-004", f"dağıtık deneme: '{kul}' hesabı",
                                  f"{len(ipler)} farklı IP aynı hesabı denedi; IP başına eşik bunu yakalamaz.",
                                  "Hesap tabanlı kilitleme/izleme ve anahtar zorunluluğu.", kul))
    return bulgular, dict(sayac)
