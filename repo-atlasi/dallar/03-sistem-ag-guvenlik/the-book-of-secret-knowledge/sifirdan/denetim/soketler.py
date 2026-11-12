"""/proc/net/tcp ve /proc/net/tcp6 ayrıştırma — `ss -ltn` / `netstat -ltn` neyi okuyorsa.

Satırları çekirdek üretir: net/ipv4/tcp_ipv4.c (get_tcp4_sock, tcp4_seq_show).
Adres, ağ bayt sırasındaki 32 bitlik sayının "%08X" ile basılmış hâlidir; x86
gibi little-endian makinelerde baytlar ters görünür: 0100007F → 127.0.0.1.
IPv6'da 4 adet 32 bitlik sözcük, her biri kendi içinde ters basılır.
Durum kodları include/net/tcp_states.h: 0A = TCP_LISTEN.
"""

import ipaddress

from .bulgu import Bulgu

DURUMLAR = {1: "ESTABLISHED", 2: "SYN_SENT", 3: "SYN_RECV", 4: "FIN_WAIT1", 5: "FIN_WAIT2", 6: "TIME_WAIT",
            7: "CLOSE", 8: "CLOSE_WAIT", 9: "LAST_ACK", 10: "LISTEN", 11: "CLOSING"}
HASSAS = {3306: "MySQL", 5432: "PostgreSQL", 6379: "Redis", 27017: "MongoDB", 9200: "Elasticsearch",
          11211: "Memcached", 2375: "Docker API (TLS'siz)", 5984: "CouchDB", 2379: "etcd"}
SIFRESIZ = {21: "FTP", 23: "Telnet", 110: "POP3", 143: "IMAP"}


def adres_coz(hex_adres, bayt_sirasi="little"):
    """'0100007F' → '127.0.0.1'; 32 hanelik IPv6 da desteklenir."""
    ham = bytes.fromhex(hex_adres)
    if bayt_sirasi == "little":  # her 32 bitlik sözcüğü kendi içinde ters çevir
        ham = b"".join(ham[i : i + 4][::-1] for i in range(0, len(ham), 4))
    return str(ipaddress.ip_address(ham))


def ayristir(metin, bayt_sirasi="little"):
    soketler = []
    for satir in metin.splitlines()[1:]:  # ilk satır başlık
        alan = satir.split()
        if len(alan) < 10:
            continue
        yerel_ip, yerel_port = alan[1].split(":")
        uzak_ip, uzak_port = alan[2].split(":")
        soketler.append({
            "yerel": adres_coz(yerel_ip, bayt_sirasi), "yerel_port": int(yerel_port, 16),
            "uzak": adres_coz(uzak_ip, bayt_sirasi), "uzak_port": int(uzak_port, 16),
            "durum": DURUMLAR.get(int(alan[3], 16), alan[3]), "uid": int(alan[7]), "inode": int(alan[9]),
        })
    return soketler


def dinleyenler(soketler):
    return [s for s in soketler if s["durum"] == "LISTEN"]


def denetle(soketler, kaynak="/proc/net/tcp"):
    bulgular = []
    for s in dinleyenler(soketler):
        ip = ipaddress.ip_address(s["yerel"])
        konum = f"{s['yerel']}:{s['yerel_port']} uid={s['uid']} inode={s['inode']}"
        herkese = ip.is_unspecified  # 0.0.0.0 ya da :: → tüm arayüzler
        port = s["yerel_port"]
        if herkese and port in HASSAS:
            bulgular.append(Bulgu("yuksek", "NET-001", f"{HASSAS[port]} tüm arayüzlerde dinliyor",
                                  "Veritabanı/önbellek servisleri genelde parolasız ya da zayıf korumalıdır.",
                                  "127.0.0.1'e bağlayın ya da güvenlik duvarıyla yalnız uygulama sunucusuna açın.",
                                  konum))
        elif port in SIFRESIZ:
            bulgular.append(Bulgu("orta", "NET-002", f"şifresiz protokol: {SIFRESIZ[port]}",
                                  "Kimlik bilgileri ağda açık metin gider.", "SSH/SFTP ya da TLS'li sürüme geçin.",
                                  konum))
        else:
            kapsam = "tüm arayüzler" if herkese else ("yalnız yerel" if ip.is_loopback else "tek arayüz")
            bulgular.append(Bulgu("bilgi", "NET-000", f"dinleyen port {port} ({kapsam})",
                                  f"Kaynak: {kaynak}", "Bu servisi tanıyor musunuz? Tanımıyorsanız sahibini bulun "
                                  "(inode → /proc/<pid>/fd).", konum))
    return bulgular
