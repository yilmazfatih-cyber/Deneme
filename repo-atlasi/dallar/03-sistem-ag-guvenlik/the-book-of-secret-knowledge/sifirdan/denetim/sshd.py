"""sshd_config denetimi.

Önemli iki kural (sshd_config(5)):
  1. Bir anahtar sözcük için İLK okunan değer geçerlidir. Bu yüzden dosyanın
     başındaki "Include /etc/ssh/sshd_config.d/*.conf", sonradan yazılan ana
     ayarları ezebilir (bulut imajlarında sık görülen tuzak).
  2. "Match" satırından sonraki ayarlar yalnız eşleşen bağlantılar için geçerlidir
     ve global bölüm ilk Match ile biter.
Ayar yoksa güncel OpenSSH varsayılanı kullanılır (ör. PermitRootLogin
prohibit-password, PasswordAuthentication yes).
"""

import re

from .bulgu import Bulgu

COKLU = {"port", "listenaddress", "hostkey", "acceptenv", "allowusers", "allowgroups", "denyusers", "denygroups",
         "include", "subsystem"}
VARSAYILAN = {"permitrootlogin": "prohibit-password", "passwordauthentication": "yes",
              "permitemptypasswords": "no", "maxauthtries": "6", "x11forwarding": "no"}
ZAYIF_SIFRELER = {"3des-cbc", "aes128-cbc", "aes192-cbc", "aes256-cbc", "blowfish-cbc", "cast128-cbc", "arcfour",
                  "arcfour128", "arcfour256", "rijndael-cbc@lysator.liu.se"}
ZAYIF_MAC = {"hmac-md5": "yuksek", "hmac-md5-96": "yuksek", "hmac-md5-etm@openssh.com": "yuksek",
             "hmac-sha1-96": "yuksek", "hmac-sha1": "dusuk", "umac-64@openssh.com": "dusuk"}
ZAYIF_KEX = {"diffie-hellman-group1-sha1": "yuksek", "diffie-hellman-group14-sha1": "orta",
             "diffie-hellman-group-exchange-sha1": "orta"}


def ayristir(metin):
    """(global, match_bloklari) döndürür. global: anahtar → (değer, satır);
    match_bloklari: [(koşul, {anahtar: (değer, satır)})]."""
    genel, bloklar, hedef = {}, [], None
    for no, satir in enumerate(metin.splitlines(), 1):
        satir = satir.strip()
        if not satir or satir.startswith("#"):
            continue
        parca = re.split(r"\s*=\s*|\s+", satir, maxsplit=1)
        anahtar, deger = parca[0].lower(), (parca[1].strip() if len(parca) > 1 else "")
        if anahtar == "match":
            hedef = {}
            bloklar.append((deger, hedef))
            continue
        sozluk = genel if hedef is None else hedef
        if anahtar in COKLU:
            sozluk.setdefault(anahtar, []).append((deger, no))
        elif anahtar not in sozluk:  # ilk değer kazanır
            sozluk[anahtar] = (deger, no)
    return genel, bloklar


def _deger(ayarlar, anahtar):
    if anahtar in ayarlar:
        return ayarlar[anahtar][0], ayarlar[anahtar][1]
    return VARSAYILAN.get(anahtar), None


def _liste(deger):
    """'+a,b' / '^a,b' (varsayılana ekle) / '-a' (çıkar) / 'a,b' (değiştir)."""
    if not deger or deger.startswith("-"):
        return []
    return [x.strip().lower() for x in deger.lstrip("+^").split(",") if x.strip()]


def _konum(dosya, no):
    return f"{dosya}:{no}" if no else f"{dosya} (varsayılan)"


def _ayar_denetle(ayarlar, dosya, kosul=None):
    b = []
    ek = f" [Match {kosul}]" if kosul else ""

    deger, no = _deger(ayarlar, "permitrootlogin")
    if deger and deger.lower() == "yes" and (no or not kosul):
        b.append(Bulgu("yuksek", "SSH-001", "root parola ile girebilir" + ek,
                       "PermitRootLogin yes: root hesabına doğrudan (parolayla da) giriş açık.",
                       "PermitRootLogin no; yönetim için kişisel hesap + sudo kullanın.", _konum(dosya, no)))
    deger, no = _deger(ayarlar, "passwordauthentication")
    if deger and deger.lower() == "yes" and (no or not kosul):
        b.append(Bulgu("orta", "SSH-002", "parola ile kimlik doğrulama açık" + ek,
                       "Parolalar kaba kuvvet ve parola püskürtmeye açıktır." + ("" if no else " (Ayar yok: varsayılan yes.)"),
                       "Anahtar tabanlı girişe geçip PasswordAuthentication no yazın.", _konum(dosya, no)))
    deger, no = _deger(ayarlar, "permitemptypasswords")
    if deger and deger.lower() == "yes":
        b.append(Bulgu("kritik", "SSH-003", "boş parolaya izin var" + ek, "PermitEmptyPasswords yes.",
                       "PermitEmptyPasswords no.", _konum(dosya, no)))
    if "protocol" in ayarlar and "1" in ayarlar["protocol"][0].split(","):
        b.append(Bulgu("kritik", "SSH-004", "SSH protokol 1 etkin" + ek,
                       "SSH-1 kırık bir protokoldür; OpenSSH 7.4'ten beri desteklenmez.",
                       "Protocol satırını kaldırın ve OpenSSH'yi güncelleyin.", _konum(dosya, ayarlar["protocol"][1])))
    if "ciphers" in ayarlar:
        zayif = sorted(set(_liste(ayarlar["ciphers"][0])) & ZAYIF_SIFRELER)
        if zayif:
            b.append(Bulgu("yuksek", "SSH-005", "zayıf şifreleme algoritması" + ek, "Etkin: " + ", ".join(zayif),
                           "CBC ve RC4 (arcfour) kiplerini çıkarın; chacha20-poly1305 / aes-gcm / aes-ctr kullanın.",
                           _konum(dosya, ayarlar["ciphers"][1])))
    for anahtar, tablo, kural, ad in (("macs", ZAYIF_MAC, "SSH-006", "MAC"), ("kexalgorithms", ZAYIF_KEX, "SSH-007",
                                                                              "anahtar değişimi")):
        if anahtar not in ayarlar:
            continue
        for alg in _liste(ayarlar[anahtar][0]):
            if alg in tablo:
                b.append(Bulgu(tablo[alg], kural, f"zayıf {ad} algoritması: {alg}" + ek,
                               f"{alg} MD5/SHA-1 ya da kısa anahtar/etiket kullanır.",
                               f"{alg} değerini listeden çıkarın.", _konum(dosya, ayarlar[anahtar][1])))
    deger, no = _deger(ayarlar, "maxauthtries")
    if deger and deger.isdigit() and int(deger) > 4 and (no or not kosul):
        b.append(Bulgu("dusuk", "SSH-008", f"bağlantı başına {deger} parola denemesi" + ek,
                       "Her TCP bağlantısında bu kadar deneme yapılabilir.", "MaxAuthTries 3-4 (CIS önerisi).",
                       _konum(dosya, no)))
    deger, no = _deger(ayarlar, "x11forwarding")
    if deger and deger.lower() == "yes":
        b.append(Bulgu("dusuk", "SSH-009", "X11 yönlendirme açık" + ek,
                       "Kullanılmayan yönlendirme saldırı yüzeyini büyütür.", "X11Forwarding no.", _konum(dosya, no)))
    return b


def denetle(metin, dosya="sshd_config"):
    genel, bloklar = ayristir(metin)
    bulgular = _ayar_denetle(genel, dosya)
    for deger, no in genel.get("include", []):
        bulgular.append(Bulgu("bilgi", "SSH-010", "Include edilen dosyalar denetlenmedi",
                              f"Include {deger}: ilk değer kazandığı için bu dosyalar ana ayarları ezebilir.",
                              "Gerçek etkin ayarları görmek için: sudo sshd -T", _konum(dosya, no)))
    for kosul, ayarlar in bloklar:
        bulgular += _ayar_denetle(ayarlar, dosya, kosul)
    if not any(k in genel for k in ("allowusers", "allowgroups")):
        bulgular.append(Bulgu("bilgi", "SSH-011", "giriş izni olanlar sınırlanmamış",
                              "AllowUsers/AllowGroups yok: geçerli her sistem hesabı denenebilir.",
                              "AllowGroups ssh-kullanicilari gibi bir izin listesi tanımlayın.", dosya))
    return bulgular
