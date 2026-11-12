"""Yetkili yanıt algoritması — RFC 1034 §4.3.2'nin sadeleştirilmiş hâli.

Bir sorgu için karar ağacı:
  1. Mesaj çözülemiyor           → FORMERR (kimlik okunabiliyorsa)
  2. Opcode QUERY değil          → NOTIMP
  3. Ad bizim bölgelerimizde yok → REFUSED (biz özyinelemeli çözücü değiliz)
  4. Ad bir delegasyonun altında → YÖNLENDİRME: AA=0, yetki = alt bölgenin NS'leri,
                                   ek = yapıştırıcı (glue) adresleri
  5. Ad var, CNAME var           → CNAME'i ekle, hedef bölgedeyse zinciri izle
  6. Ad var, tür var             → CEVAP (AA=1)
  7. Ad var / boş ara düğüm      → NODATA: NOERROR + yetki bölümünde SOA
  8. Ad yok                      → NXDOMAIN + yetki bölümünde SOA (RFC 2308)
"""

from . import tel

UDP_SINIRI = 512  # EDNS(0) olmadan UDP yanıtı en fazla 512 bayt (RFC 1035 §4.2.1)
CNAME_SINIRI = 8


def _bolge_sec(bolgeler, ad):
    adaylar = [b for b in bolgeler if b.icinde_mi(ad)]
    return max(adaylar, key=lambda b: len(b.koken), default=None)


def _olumsuz_soa(bolge):
    """Olumsuz yanıtın önbellek süresi = min(SOA TTL, SOA asgari) (RFC 2308 §5)."""
    soa = bolge.soa
    return tel.Kayit(soa.ad, tel.SOA, min(soa.ttl, soa.veri.asgari), soa.veri)


def _adresler(bolge, adlar):
    ek = []
    for ad in adlar:
        ad = tel.normalle(ad)
        if bolge.icinde_mi(ad):
            ek += bolge.rrset(ad, tel.A) + bolge.rrset(ad, tel.AAAA)
    return ek


def _coz(yanit, soru, bolgeler):
    ad = tel.normalle(soru.ad)
    if soru.sinif != tel.SINIF_IN:
        yanit.rcode = tel.REFUSED
        return
    bolge = _bolge_sec(bolgeler, ad)
    if bolge is None:
        yanit.rcode = tel.REFUSED
        return

    hedef = ad
    for _ in range(CNAME_SINIRI):
        kesim = bolge.kesim_bul(hedef)
        if kesim is not None:
            if hedef == ad:  # ilk ad delegasyon altında: yönlendirme yanıtı
                ns = bolge.rrset(kesim, tel.NS)
                yanit.aa = False
                yanit.yetkililer = ns
                # Yapıştırıcı: NS adı kesimin altındaysa adresi ancak üst bölgeden öğrenilir.
                yanit.ekler = [k for k in _adresler(bolge, [n.veri for n in ns]) if k.ad == kesim
                               or k.ad.endswith("." + kesim)]
            return  # CNAME hedefi başka bir bölgeye düştü: çözücü izlesin
        yanit.aa = True
        if not bolge.ad_var_mi(hedef):
            if not bolge.bos_ara_dugum_mu(hedef):
                yanit.rcode = tel.NXDOMAIN  # zincirin SON adına göre (RFC 6604)
            yanit.yetkililer = [_olumsuz_soa(bolge)]
            return
        cname = bolge.rrset(hedef, tel.CNAME)
        if cname and soru.tur not in (tel.CNAME, tel.ANY):
            yanit.cevaplar += cname
            hedef = tel.normalle(cname[0].veri)
            if not bolge.icinde_mi(hedef):
                return
            continue
        if soru.tur == tel.ANY:
            yanit.cevaplar += bolge.kumeler(hedef)
            return
        kume = bolge.rrset(hedef, soru.tur)
        if not kume:
            yanit.yetkililer = [_olumsuz_soa(bolge)]  # NODATA
            return
        yanit.cevaplar += kume
        if soru.tur == tel.MX:
            yanit.ekler = _adresler(bolge, [k.veri[1] for k in kume])
        elif soru.tur == tel.NS:
            yanit.ekler = _adresler(bolge, [k.veri for k in kume])
        return
    yanit.rcode = tel.SERVFAIL  # CNAME döngüsü ya da aşırı uzun zincir


def cevapla(sorgu_baytlari, bolgeler, azami_boy=UDP_SINIRI):
    """Ham sorgu → ham yanıt. Yanıt verilmemesi gerekiyorsa None."""
    try:
        sorgu = tel.coz(sorgu_baytlari)
    except tel.BicimHatasi:
        if len(sorgu_baytlari) < 12:
            return None  # kimliği bile okunamayan paketi sessizce at
        kimlik = int.from_bytes(sorgu_baytlari[:2], "big")
        return tel.kodla(tel.Mesaj(kimlik=kimlik, qr=True, rcode=tel.FORMERR))
    if sorgu.qr:
        return None  # yanıtlara yanıt verilmez: yansıtma döngülerini önler

    yanit = tel.Mesaj(kimlik=sorgu.kimlik, qr=True, opcode=sorgu.opcode, rd=sorgu.rd, sorular=sorgu.sorular[:1])
    if sorgu.opcode != 0:
        yanit.rcode = tel.NOTIMP
    elif len(sorgu.sorular) != 1:
        yanit.rcode = tel.FORMERR
    else:
        _coz(yanit, sorgu.sorular[0], bolgeler)

    veri = tel.kodla(yanit)
    if len(veri) > azami_boy:
        # Sığmadı: TC=1 ile yalnız başlık + soru gönder; istemci TCP ile yeniden sorar.
        yanit.tc = True
        yanit.cevaplar, yanit.yetkililer, yanit.ekler = [], [], []
        veri = tel.kodla(yanit)
    return veri
