"""Mesaj yönlendirici: niyete göre yanıt üretir, çok adımlı randevu akışını yönetir.

Kanal bağımsızdır: Telegram, terminal (sohbet komutu) ya da ileride WhatsApp aynı
`isle(sohbet_id, metin)` çağrısını kullanır. Randevuyu her zaman deterministik slot
motoru ve kullanıcı onayı oluşturur; dil modeli (varsa) yalnız anlamaya yardım eder.

Onay kuralı: randevu, iptal ve veri silme yalnız mesajın tamamı açık bir onaysa yapılır.
"uygun değil", "tamam, silmeyin", "evet ama 16:00 olsun" onay sayılmaz; saat içeren cevapta
yeni saat önerilir, belirsiz cevapta soru yinelenir.
"""

from __future__ import annotations

import logging
import re
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from . import slotlar
from .depo import Depo, MusteriSiniri, OturumBulunamadi, SlotDolu
from .metin import GUN_ADLARI, sadelestir, saat_bul, tarih_bul, tarih_metni
from .niyet import Niyet, hizmet_bul, niyet_bul
from .yapilandirma import Hizmet, Isletme, dk_metni
from .zaman import yerel_saat

log = logging.getLogger(__name__)

MENU = ("Randevu al", "Fiyatlar", "Adres", "Çalışma saatleri", "Randevularım", "Yetkiliyle görüş")
CIKIS = frozenset({"vazgec", "vazgectim", "menu", "/start", "iptal", "bosver", "hayir", "istemiyorum"})
OTURUM_OMRU = timedelta(minutes=30)
KILIT_SAYISI = 64  # sohbet başına kilit (şeritleme): aynı sohbetin iki mesajı aynı anda işlenmez

_EVET = frozenset({"evet", "e", "evt", "tamam", "tamamdir", "olur", "onay", "onayla", "onayliyorum", "uygun",
                   "uygundur", "kabul", "ok", "okey", "tabii", "tabi", "elbette", "aynen"})
_HAYIR = frozenset({"hayir", "h", "yok", "istemiyorum", "istemem", "vazgec", "vazgectim", "olmaz", "iptal"})
_BELIRSIZ = frozenset({"ama", "fakat", "ancak", "yalniz", "sadece"})  # "evet ama ...": emin değiliz
_DOLGU = frozenset({"lutfen", "olsun", "tesekkurler", "tesekkur", "ederim", "sagol", "sagolun", "hocam", "abi",
                    "abla", "bey", "hanim", "simdilik"})
_IFADELER = (("sorun yok", "tamam"), ("problem yok", "tamam"), ("fark etmez", "tamam"), ("gerek yok", "hayir"),
             ("uygun degil", "hayir"))
# Olumsuz fiil sonları: silmeyin, yapmayalım, istemiyorum, olmasın, gelmem, olmaz, etme.
_OLUMSUZ_FIIL = re.compile(r"(m[ae]y[iu]n|m[ae]y[iu]niz|m[ae]y[ae]lim|m[iu]yor\w*|m[ae]s[iu]n|m[ae]m|m[ae]z|m[ae])$")
_BEGENI = ("\U0001f44d", "\U0001f44c")  # başparmak ve "tamam" el işareti
_IPTAL_EVET = frozenset({"iptal", "et", "edin", "edebilirsiniz"})
_IPTAL_HAYIR = frozenset({"kalsin", "dursun"})
_SIL_EVET = frozenset({"sil", "silin", "silinsin", "silebilirsiniz"})
# Numara kabul edilen dolgu kelimeler: "2", "2.", "2)", "2. seçenek", "2 numara", "2'yi"
_NUMARA_DOLGU = frozenset({"secenek", "secenegi", "numara", "numarayi", "nolu", "no", "olsun", "lutfen", "yi", "i",
                           "u", "yu", "inci", "nci", "uncu", "ncu"})


@dataclass
class Giden:
    sohbet_id: int
    metin: str
    secenekler: tuple[str, ...] = ()


def _zaman(an: datetime, bugun: date | None = None) -> str:
    return f"{tarih_metni(an.date(), bugun)} {an:%H:%M}"


def _numara(metin: str, ust: int) -> int | None:
    """Liste seçimi: yalnız mesajın tamamı bir numaraysa ('2', '2)', '2. seçenek') ya da düğme metniyse
    ('1) 10.11 15:00'). '1.30', '2.15'e alalım', '2 dakika bekleyin' numara değildir."""
    eslesme = re.match(r"\s*(\d{1,2})\)", metin)  # düğme: "1) 10.11 15:00"
    if not eslesme:
        sade = sadelestir(metin).split()
        if not sade or not sade[0].isdigit() or any(k not in _NUMARA_DOLGU for k in sade[1:]):
            return None
        if re.match(r"\s*\d{1,2}\.\d", metin):  # "1.30": saat
            return None
        no = int(sade[0])
    else:
        no = int(eslesme.group(1))
    return no if 1 <= no <= ust else None


def _onay_cevabi(
    metin: str, ek_evet: frozenset[str] = frozenset(), ek_hayir: frozenset[str] = frozenset()
) -> str | None:
    """'evet', 'hayir' ya da None (emin değiliz). Mesajın tamamı onay/ret kelimelerinden oluşmalı."""
    ham = metin.strip()
    if ham in _BEGENI:
        return "evet"
    sade = sadelestir(ham)
    for kalip, yerine in _IFADELER:
        sade = re.sub(rf"\b{kalip}\b", yerine, sade)
    evet = hayir = False
    for kelime in sade.split():
        if kelime in ek_evet:
            evet = True
        elif kelime in ek_hayir or kelime in _HAYIR:
            hayir = True
        elif kelime in _EVET:
            evet = True
        elif kelime in _BELIRSIZ:
            return None
        elif kelime in _DOLGU:
            continue
        elif _OLUMSUZ_FIIL.search(kelime):
            hayir = True
        else:
            return None  # onay dışında bir şey de söylenmiş: tahmin etmeyiz
    if evet == hayir:
        return None
    return "evet" if evet else "hayir"


class Yonlendirici:
    def __init__(
        self,
        isletme: Isletme,
        depo: Depo,
        saat: Callable[[], datetime] | None = None,
        ajan: object | None = None,
    ) -> None:
        self.isletme = isletme
        self.depo = depo
        # "Şimdi" işletmenin saat dilimindedir (sunucu UTC olsa bile); testler sabit bir saat verir.
        self.saat = saat or yerel_saat(isletme.saat_dilimi)
        self.ajan = ajan  # OllamaAjani gibi .yanitla(metin) -> (metin, eylem) sunan herhangi bir nesne
        self._kilitler = [threading.Lock() for _ in range(KILIT_SAYISI)]

    def isle(self, sohbet_id: int, metin: str, ad: str = "") -> list[Giden]:
        """Bir mesajı işler. Aynı sohbetin mesajları sırayla işlenir (webhook iş parçacıklıdır)."""
        with self._kilitler[hash(sohbet_id) % KILIT_SAYISI]:
            return self._isle(sohbet_id, (metin or "").strip(), ad)

    def _isle(self, sohbet_id: int, metin: str, ad: str) -> list[Giden]:
        simdi = self.saat()
        if self._sahip_mi(sohbet_id) and metin.startswith("/"):
            yanit = self._sahip_komutu(sohbet_id, metin[:2000], simdi)
            if yanit is not None:
                return yanit
        metin = metin[:500]
        giden = [] if self.depo.gorulme_kaydet(sohbet_id, ad, simdi) else [Giden(sohbet_id, self.aydinlatma())]
        oturum = self.depo.oturum_al(sohbet_id, en_eski=simdi - OTURUM_OMRU)
        isleyici = getattr(self, f"_durum_{oturum[0]}", None) if oturum else None
        if oturum and isleyici is None:  # eski sürümden kalmış bilinmeyen durum: unut
            self.depo.oturum_sil(sohbet_id)
            oturum = None
        if oturum:
            yanit = isleyici(sohbet_id, oturum[1], metin, simdi)
            if yanit is not None:
                return giden + yanit
            if sadelestir(metin) in CIKIS:
                self.depo.oturum_sil(sohbet_id)
                return giden + [Giden(sohbet_id, "Tamam, işlemi bıraktım. Başka nasıl yardımcı olabilirim?", MENU)]
        niyet = niyet_bul(metin, self.isletme, simdi.date())
        if oturum and niyet.ad == "bilinmiyor":
            return giden + [self._tekrar_sor(sohbet_id, oturum[0])]
        return giden + getattr(self, f"_niyet_{niyet.ad}")(sohbet_id, niyet, metin, simdi)

    def _tekrar_sor(self, sid: int, durum: str) -> Giden:
        if durum == "onay":
            metin = "Randevuyu onaylıyor musunuz? Lütfen yalnız 'Evet' ya da 'Hayır' yazın."
            return Giden(sid, metin, ("Evet", "Hayır"))
        if durum == "iptal_onay":
            return Giden(sid, "Randevuyu iptal edeyim mi? 'Evet, iptal et' ya da 'Hayır, kalsın' yazın.",
                         ("Evet, iptal et", "Hayır, kalsın"))
        if durum == "veri_sil_onay":
            return Giden(sid, "Kayıtlarınızı sileyim mi? 'Evet, sil' ya da 'Hayır' yazın.", ("Evet, sil", "Hayır"))
        return Giden(sid, "Anlayamadım. Listeden bir numara yazın ya da 'vazgeç' yazın.")

    # ------------------------------------------------------------------ metinler
    def aydinlatma(self) -> str:
        i = self.isletme
        satirlar = [
            f"Kişisel verileriniz hakkında kısa bilgi (KVKK md. 10). Veri sorumlusu: {i.ad}.",
            "Adınızı, sohbet kimliğinizi ve randevu bilgilerinizi yalnızca randevu oluşturmak ve "
            "sorularınızı yanıtlamak için işliyoruz (KVKK md. 5/2-c).",
            "Yazışmanız mesajlaşma uygulamasının yurt dışındaki sunucularından geçer. Botun kayıtlarında mesaj "
            f"içeriği tutulmaz; yalnız yetkiliye iletmemizi istediğiniz mesaj yanıtlanana kadar, en çok "
            f"{i.devir_saklama_gun} gün saklanır. Geçmiş randevu kayıtları {i.saklama_gun} gün sonra silinir.",
            "Bottaki kayıtlarınızı silmek için istediğiniz an 'verilerimi sil' yazabilirsiniz.",
        ]
        if i.hassas_veri:
            satirlar.append("Lütfen sağlık durumunuzla ilgili bilgi yazmayın; bu kanal bunun için uygun değildir.")
        if i.kvkk_url:
            satirlar.append(f"Aydınlatma metninin tamamı: {i.kvkk_url}")
        return "\n".join(satirlar)

    def _hizmet_listesi(self) -> str:
        return "\n".join(
            f"{no}) {h.ad}: {h.fiyat_metni()}, {h.sure_dk} dk" for no, h in enumerate(self.isletme.hizmetler, 1)
        )

    def _saat_metni(self, gun_no: int) -> str:
        araliklar = self.isletme.saatler[gun_no]
        return ", ".join(f"{dk_metni(a)}-{dk_metni(k)}" for a, k in araliklar) or "kapalı"

    def _sahip_mi(self, sohbet_id: int) -> bool:
        return self.isletme.sahip_sohbet_id is not None and sohbet_id == self.isletme.sahip_sohbet_id

    def _sahibe(self, metin: str) -> list[Giden]:
        sahip = self.isletme.sahip_sohbet_id
        return [Giden(sahip, metin)] if sahip is not None else []

    def _randevu_listesi(self, kayitlar: list) -> str:
        return "\n".join(
            f"{no}) {self._hizmet_adi(r['hizmet'])}, {_zaman(datetime.fromisoformat(r['baslangic']))}"
            for no, r in enumerate(kayitlar, 1)
        )

    def _hizmet_adi(self, kod: str) -> str:
        h = self.isletme.hizmet(kod)
        return h.ad if h else kod

    # ------------------------------------------------------------------ işletme sahibinin komutları
    def _sahip_komutu(self, sid: int, metin: str, simdi: datetime) -> list[Giden] | None:
        """Sahip Telegram'dan yönetir: /devirler, /yanit N mesaj, /kapat N, /randevular [gün], /iptal N."""
        parcalar = metin.split(None, 1)
        komut, kalan = sadelestir(parcalar[0]), (parcalar[1].strip() if len(parcalar) > 1 else "")
        ilk = kalan.split()[0].lstrip("#") if kalan else ""
        no = int(ilk) if ilk.isdecimal() else None
        if komut in ("/yanit", "/cevap"):
            eslesme = re.match(r"#?(\d+)\s+(.+)", kalan, re.S)
            if not eslesme:
                return [Giden(sid, "Kullanım: /yanit <talep no> <mesajınız>")]
            devir = self.depo.devir_getir(int(eslesme.group(1)))
            if devir is None:
                return [Giden(sid, f"Açık talep #{eslesme.group(1)} bulunamadı.")]
            self.depo.devir_kapat(devir["id"])
            return [
                Giden(devir["sohbet_id"], f"{self.isletme.ad} yetkilisi: {eslesme.group(2).strip()}"),
                Giden(sid, f"Yanıt gönderildi; talep #{devir['id']} kapatıldı ve mesajı silindi."),
            ]
        if komut == "/kapat":
            if no is None:
                return [Giden(sid, "Kullanım: /kapat <talep no>")]
            kapandi = self.depo.devir_kapat(no)
            return [Giden(sid, f"Talep #{no} kapatıldı ve mesajı silindi." if kapandi else f"Talep #{no} yok.")]
        if komut == "/devirler":
            satirlar = [
                f"#{d['id']} sohbet {d['sohbet_id']} ({d['ad'] or '-'}), {d['olusturma'][:16].replace('T', ' ')}: "
                f"{d['mesaj'] or '(mesaj saklanmadı)'}"
                for d in self.depo.acik_devirler()
            ]
            return [Giden(sid, "\n".join(satirlar) or "Açık talep yok.")]
        if komut == "/randevular":
            gun = tarih_bul(kalan, simdi.date()) or simdi.date()
            satirlar = [
                f"#{r['id']} {r['baslangic'][11:]}-{r['bitis'][11:]} {r['kaynak']}: "
                f"{self._hizmet_adi(r['hizmet'])} ({r['ad'] or '-'})"
                for r in self.depo.gunun_randevulari(gun.isoformat())
            ]
            return [Giden(sid, f"{tarih_metni(gun)}:\n" + ("\n".join(satirlar) or "Randevu yok."))]
        if komut == "/iptal":
            if no is None:
                return [Giden(sid, "Kullanım: /iptal <randevu no>")]
            r = self.depo.randevu_iptal(no)
            if r is None:
                return [Giden(sid, f"Aktif randevu #{no} bulunamadı.")]
            ne = f"{self._hizmet_adi(r['hizmet'])}, {_zaman(datetime.fromisoformat(r['baslangic']))}"
            musteriye = Giden(r["sohbet_id"], f"{self.isletme.ad}: {ne} randevunuz işletme tarafından iptal edildi. "
                                              "Yeni randevu için 'randevu' yazabilirsiniz.", MENU)
            return [musteriye, Giden(sid, f"Randevu #{no} iptal edildi; müşteriye haber verildi.")]
        if komut in ("/sahip", "/yardim"):
            return [Giden(sid, "Sahip komutları: /devirler, /yanit <no> <mesaj>, /kapat <no>, "
                               "/randevular [gün], /iptal <randevu no>, /kimlik")]
        return None

    # ------------------------------------------------------------------ randevu akışı
    def _oner(self, sid: int, hizmet: Hizmet, tarih: date | None, saat: time | None, degisen: int | None,
              simdi: datetime) -> list[Giden]:
        """İstenen saat uygunsa onay sorar; değilse en yakın boş saatleri numaralı liste olarak sunar."""
        dolu = self.depo.dolu_araliklar(degisen)
        bugun, son_gun = simdi.date(), simdi.date() + timedelta(days=self.isletme.en_gec_gun)
        if saat and not tarih:
            tarih = bugun if datetime.combine(bugun, saat) > simdi else bugun + timedelta(days=1)
        baslik = ""
        if tarih and not bugun <= tarih <= son_gun:  # "takvim dolu" demeyelim: sınır dışı olduğunu söyleyelim
            if tarih < bugun:
                baslik = f"{tarih_metni(tarih, bugun)} geçmiş bir tarih."
            else:
                baslik = (f"{tarih_metni(tarih, bugun)} için henüz randevu vermiyoruz; en fazla "
                          f"{self.isletme.en_gec_gun} gün sonrasına randevu alıyoruz.")
            tarih = saat = None
        if tarih and saat:
            bas = datetime.combine(tarih, saat)
            if slotlar.uygun_kaynak(self.isletme, hizmet, bas, dolu, simdi):
                return self._onay_sor(sid, hizmet, bas, degisen, simdi)
            gunun = slotlar.bos_slotlar(self.isletme, hizmet, dolu, simdi, tarih, adet=500, tek_gun=True)
            adaylar = sorted(sorted(gunun, key=lambda s: abs(s[0] - bas))[:6])  # istenene en yakın 6 saat
            baslik = f"{_zaman(bas)} uygun değil."
        else:
            adaylar = slotlar.bos_slotlar(self.isletme, hizmet, dolu, simdi, tarih, tek_gun=bool(tarih), seyrek_dk=60)
        if not adaylar and tarih:
            baslik = f"{tarih_metni(tarih)} için boş saat yok."
            adaylar = slotlar.bos_slotlar(self.isletme, hizmet, dolu, simdi, tarih + timedelta(days=1), seyrek_dk=60)
        if not adaylar:
            metin = f"Önümüzdeki {self.isletme.en_gec_gun} gün için boş saat bulamadım. " \
                    "'Yetkili' yazarsanız işletmeye iletirim."
            return [Giden(sid, "\n".join(s for s in (baslik, metin) if s), MENU)]
        veri = {"hizmet": hizmet.kod, "adaylar": [a.isoformat(timespec="minutes") for a, _ in adaylar],
                "degisen": degisen, "gun": adaylar[0][0].date().isoformat()}
        self.depo.oturum_yaz(sid, "slot_sec", veri, simdi)
        satirlar = [baslik, f"{hizmet.ad} için boş saatler:"]
        satirlar += [f"{no}) {_zaman(a)}" for no, (a, _) in enumerate(adaylar, 1)]
        satirlar.append("Numarasını yazın ya da başka bir gün söyleyin (ör. 'cuma').")
        dugmeler = tuple(f"{no}) {a:%d.%m %H:%M}" for no, (a, _) in enumerate(adaylar, 1))
        return [Giden(sid, "\n".join(s for s in satirlar if s), dugmeler)]

    def _onay_sor(self, sid: int, hizmet: Hizmet, bas: datetime, degisen: int | None, simdi: datetime) -> list[Giden]:
        veri = {"hizmet": hizmet.kod, "bas": bas.isoformat(timespec="minutes"), "degisen": degisen}
        self.depo.oturum_yaz(sid, "onay", veri, simdi)
        metin = f"{hizmet.ad} ({hizmet.sure_dk} dk, {hizmet.fiyat_metni()}), {_zaman(bas)}. Onaylıyor musunuz?"
        return [Giden(sid, metin, ("Evet", "Hayır"))]

    def _rezerve(self, sid: int, veri: dict, simdi: datetime) -> list[Giden]:
        hizmet = self.isletme.hizmet(veri["hizmet"])
        if hizmet is None:  # yapılandırma değişmiş olabilir
            self.depo.oturum_sil(sid)
            return [Giden(sid, "Bu hizmet artık sunulmuyor. Lütfen yeniden 'randevu' yazın.", MENU)]
        bas = datetime.fromisoformat(veri["bas"])
        bit = bas + timedelta(minutes=hizmet.sure_dk)
        degisen = veri.get("degisen")
        try:
            rid, kaynak = self.depo.randevu_ekle(
                sid, hizmet.kod, bas, bit,
                lambda dolu: slotlar.uygun_kaynak(self.isletme, hizmet, bas, dolu, simdi), simdi, degisen,
                azami=self.isletme.musteri_basina_azami, oturum_durumu="onay",
            )
        except OturumBulunamadi:
            return [Giden(sid, "Bu onay zaten işlendi. 'Randevularım' yazarak kontrol edebilirsiniz.", MENU)]
        except MusteriSiniri as hata:
            self.depo.oturum_sil(sid)
            if hata.args and hata.args[0] == "cakisma":
                metin = "Bu saatle çakışan bir randevunuz zaten var. 'Randevularım' yazarak görebilirsiniz."
            else:
                metin = (f"En fazla {self.isletme.musteri_basina_azami} aktif randevu alabilirsiniz. "
                         "Saat değiştirmek için 'değiştir', iptal için 'iptal' yazın.")
            return [Giden(sid, metin, MENU)]
        except SlotDolu:
            self.depo.oturum_sil(sid)  # işlem geri alındı; eski onay bir daha denenmesin
            return [Giden(sid, "Üzgünüm, bu saat az önce doldu.")] + self._oner(
                sid, hizmet, bas.date(), bas.time(), degisen, simdi
            )
        satirlar = [
            f"Randevunuz {'güncellendi' if degisen else 'oluşturuldu'}: {hizmet.ad}, {_zaman(bas)} ({kaynak}).",
            f"Adres: {self.isletme.adres}",
            *self.isletme.politikalar[:1],
            "İptal ya da değişiklik için 'iptal' veya 'değiştir' yazabilirsiniz.",
        ]
        not_ = f" (#{degisen} yerine)" if degisen else ""
        return [Giden(sid, "\n".join(satirlar), MENU)] + self._sahibe(
            f"Yeni randevu #{rid}{not_}: {hizmet.ad}, {_zaman(bas)}, {kaynak}."
        )

    def _iptal_sor(self, sid: int, kayit: dict, simdi: datetime) -> list[Giden]:
        self.depo.oturum_yaz(sid, "iptal_onay", {"id": kayit["id"]}, simdi)
        ne = f"{self._hizmet_adi(kayit['hizmet'])}, {_zaman(datetime.fromisoformat(kayit['baslangic']))}"
        return [Giden(sid, f"{ne} randevunuzu iptal edeyim mi?", ("Evet, iptal et", "Hayır, kalsın"))]

    # ------------------------------------------------------------------ oturum durumları
    def _durum_hizmet_sec(self, sid: int, veri: dict, metin: str, simdi: datetime) -> list[Giden] | None:
        secim = _numara(metin, len(self.isletme.hizmetler))
        hizmet = self.isletme.hizmetler[secim - 1] if secim else hizmet_bul(metin, self.isletme)
        if hizmet is None:
            return None
        tarih = date.fromisoformat(veri["tarih"]) if veri.get("tarih") else tarih_bul(metin, simdi.date())
        saat = time.fromisoformat(veri["saat"]) if veri.get("saat") else saat_bul(metin)
        return self._oner(sid, hizmet, tarih, saat, veri.get("degisen"), simdi)

    def _durum_slot_sec(self, sid: int, veri: dict, metin: str, simdi: datetime) -> list[Giden] | None:
        hizmet = self.isletme.hizmet(veri["hizmet"])
        adaylar = [datetime.fromisoformat(a) for a in veri["adaylar"]]
        gun = date.fromisoformat(veri["gun"]) if veri.get("gun") else None  # listenin gösterdiği gün
        secim = _numara(metin, len(adaylar))
        istenen_saat, istenen_tarih = saat_bul(metin), tarih_bul(metin, simdi.date())
        if secim is None and istenen_saat and not istenen_tarih:
            secim = next(
                (no for no, a in enumerate(adaylar, 1) if a.time() == istenen_saat and a.date() == (gun or a.date())),
                None,
            )
        if hizmet and secim:
            return self._onay_sor(sid, hizmet, adaylar[secim - 1], veri.get("degisen"), simdi)
        if hizmet and (istenen_tarih or istenen_saat):  # tarihsiz saat: listelenen günde aranır
            return self._oner(sid, hizmet, istenen_tarih or gun, istenen_saat, veri.get("degisen"), simdi)
        return None

    def _durum_onay(self, sid: int, veri: dict, metin: str, simdi: datetime) -> list[Giden] | None:
        # Önce başka bir gün/saat istenmiş mi bak: "hayır, 4'e olsun", "cuma olsun" yeni öneri ister.
        hizmet, eski = self.isletme.hizmet(veri["hizmet"]), datetime.fromisoformat(veri["bas"])
        istenen_saat, istenen_tarih = saat_bul(metin), tarih_bul(metin, simdi.date())
        if hizmet and (istenen_saat or istenen_tarih):
            yeni_gun, yeni_saat = istenen_tarih or eski.date(), istenen_saat or eski.time()  # yalnız gün: saat kalır
            if (yeni_gun, yeni_saat) != (eski.date(), eski.time()):
                return self._oner(sid, hizmet, yeni_gun, yeni_saat, veri.get("degisen"), simdi)
        cevap = _onay_cevabi(metin)
        if cevap == "evet":
            return self._rezerve(sid, veri, simdi)
        if cevap == "hayir":
            self.depo.oturum_sil(sid)
            return [Giden(sid, "Tamam, randevu oluşturmadım. Başka bir saat için 'randevu' yazabilirsiniz.", MENU)]
        return None

    def _durum_iptal_sec(self, sid: int, veri: dict, metin: str, simdi: datetime) -> list[Giden] | None:
        secim = _numara(metin, len(veri["idler"]))
        if secim is None:
            return None
        kayit = self.depo.randevu_getir(veri["idler"][secim - 1], sid)
        if kayit is None:
            self.depo.oturum_sil(sid)
            return [Giden(sid, "Bu randevu zaten iptal edilmiş.", MENU)]
        return self._iptal_sor(sid, kayit, simdi)

    def _durum_iptal_onay(self, sid: int, veri: dict, metin: str, simdi: datetime) -> list[Giden] | None:
        cevap = _onay_cevabi(metin, ek_evet=_IPTAL_EVET, ek_hayir=_IPTAL_HAYIR)
        if cevap is None:
            return None
        self.depo.oturum_sil(sid)
        if cevap == "hayir":
            return [Giden(sid, "Tamam, randevunuz duruyor.", MENU)]
        kayit = self.depo.randevu_iptal(veri["id"], sid)
        if kayit is None:
            return [Giden(sid, "Bu randevu zaten iptal edilmiş.", MENU)]
        ne = f"{self._hizmet_adi(kayit['hizmet'])}, {_zaman(datetime.fromisoformat(kayit['baslangic']))}"
        yanit = Giden(sid, "Randevunuz iptal edildi. Yeni randevu için 'randevu' yazabilirsiniz.", MENU)
        return [yanit] + self._sahibe(f"Randevu #{kayit['id']} müşteri tarafından iptal edildi: {ne}.")

    def _durum_degistir_sec(self, sid: int, veri: dict, metin: str, simdi: datetime) -> list[Giden] | None:
        secim = _numara(metin, len(veri["idler"]))
        hizmet = self.isletme.hizmet(veri["hizmetler"][secim - 1]) if secim else None
        if hizmet is None:
            return None
        return self._oner(sid, hizmet, None, None, veri["idler"][secim - 1], simdi)

    def _durum_veri_sil_onay(self, sid: int, veri: dict, metin: str, simdi: datetime) -> list[Giden] | None:
        cevap = _onay_cevabi(metin, ek_evet=_SIL_EVET)
        if cevap is None:
            return None
        if cevap == "hayir":
            self.depo.oturum_sil(sid)
            return [Giden(sid, "Tamam, hiçbir kaydı silmedim.", MENU)]
        aktif = self.depo.kisinin_randevulari(sid, simdi)
        self.depo.kisi_verilerini_sil(sid)
        saatler = ", ".join(_zaman(datetime.fromisoformat(r["baslangic"])) for r in aktif)
        bosalan = f"; {len(aktif)} aktif randevu boşaldı ({saatler})" if aktif else ""
        sahibe = self._sahibe(f"Sohbet {sid} bottaki verilerini sildi{bosalan}. Bu kişiyle ilgili size iletilmiş "
                              "mesajlar varsa onları da silin.")
        return [Giden(sid, "Bottaki kayıtlarınız silindi. İşletmeye daha önce iletilmiş mesajlar için "
                           "işletmeyle görüşebilirsiniz.")] + sahibe

    # ------------------------------------------------------------------ niyetler
    def _niyet_randevu(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        tek = self.isletme.hizmetler[0] if len(self.isletme.hizmetler) == 1 else None
        hizmet = n.hizmet or tek
        if hizmet:
            return self._oner(sid, hizmet, n.tarih, n.saat, None, simdi)
        veri = {"tarih": n.tarih.isoformat() if n.tarih else None,
                "saat": n.saat.isoformat(timespec="minutes") if n.saat else None}
        self.depo.oturum_yaz(sid, "hizmet_sec", veri, simdi)
        metin = "Hangi hizmet için randevu istersiniz?\n" + self._hizmet_listesi() + "\nNumarasını yazmanız yeterli."
        return [Giden(sid, metin, tuple(h.ad for h in self.isletme.hizmetler))]

    def _niyet_iptal(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        kayitlar = self.depo.kisinin_randevulari(sid, simdi)
        if not kayitlar:
            return [Giden(sid, "Aktif bir randevunuz görünmüyor.", MENU)]
        if len(kayitlar) == 1:
            return self._iptal_sor(sid, kayitlar[0], simdi)
        self.depo.oturum_yaz(sid, "iptal_sec", {"idler": [r["id"] for r in kayitlar]}, simdi)
        secenek = tuple(str(no) for no in range(1, len(kayitlar) + 1))
        return [Giden(sid, "Hangi randevuyu iptal edelim?\n" + self._randevu_listesi(kayitlar), secenek)]

    def _niyet_degistir(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        kayitlar = self.depo.kisinin_randevulari(sid, simdi)
        if not kayitlar:
            return [Giden(sid, "Değiştirilecek aktif randevunuz yok. Yeni randevu için 'randevu' yazın.", MENU)]
        veri = {"idler": [r["id"] for r in kayitlar], "hizmetler": [r["hizmet"] for r in kayitlar]}
        self.depo.oturum_yaz(sid, "degistir_sec", veri, simdi)
        secenek = tuple(str(no) for no in range(1, len(kayitlar) + 1))
        return [Giden(sid, "Hangi randevuyu değiştirelim?\n" + self._randevu_listesi(kayitlar), secenek)]

    def _niyet_randevularim(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        kayitlar = self.depo.kisinin_randevulari(sid, simdi)
        if not kayitlar:
            return [Giden(sid, "Aktif bir randevunuz görünmüyor.", MENU)]
        return [Giden(sid, "Aktif randevularınız:\n" + self._randevu_listesi(kayitlar), MENU)]

    def _niyet_fiyat(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        if n.hizmet:
            return [Giden(sid, f"{n.hizmet.ad}: {n.hizmet.fiyat_metni()}, yaklaşık {n.hizmet.sure_dk} dakika.")]
        return [Giden(sid, "Fiyat listemiz:\n" + self._hizmet_listesi(), MENU)]

    def _niyet_adres(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        i = self.isletme
        satirlar = [f"Adresimiz: {i.adres}", f"Telefon: {i.telefon}" if i.telefon else "", i.harita]
        return [Giden(sid, "\n".join(s for s in satirlar if s))]

    def _niyet_saatler(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        if n.tarih:
            durum = "tatil" if n.tarih in self.isletme.tatiller else self._saat_metni(n.tarih.weekday())
            return [Giden(sid, f"{tarih_metni(n.tarih)}: {durum}.")]
        satirlar = [f"{GUN_ADLARI[no]}: {self._saat_metni(no)}" for no in range(7)]
        return [Giden(sid, "Çalışma saatlerimiz:\n" + "\n".join(satirlar))]

    def _niyet_sss(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        return [Giden(sid, n.sss.cevap if n.sss else "Bu konuda bilgim yok; 'yetkili' yazabilirsiniz.")]

    def _niyet_insan(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        # Hassas sektörde (klinik) mesaj metni veritabanına yazılmaz; yalnız işletmeye iletilir.
        devir = self.depo.devir_ekle(sid, "" if self.isletme.hassas_veri else metin, simdi)
        sahibe = self._sahibe(
            f"Devir talebi #{devir} (sohbet {sid}): {metin}\nYanıtlamak için: /yanit {devir} <mesaj>"
        )
        if sahibe:
            return [Giden(sid, "Mesajınızı yetkiliye ilettim; yanıtı bu sohbetten alacaksınız.")] + sahibe
        tel = f" Acil bir durumsa {self.isletme.telefon} numarasını arayabilirsiniz." if self.isletme.telefon else ""
        return [Giden(sid, f"Mesajınızı işletmeye ilettim.{tel}")]

    def _niyet_veri_sil(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        self.depo.oturum_yaz(sid, "veri_sil_onay", {}, simdi)
        metin = ("Bottaki tüm kayıtlarınızı silmemi onaylıyor musunuz? "
                 "Aktif randevularınız da iptal olur.")
        return [Giden(sid, metin, ("Evet, sil", "Hayır"))]

    def _niyet_kvkk(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        return [Giden(sid, self.aydinlatma())]

    def _niyet_kimlik(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        return [Giden(sid, f"Sohbet kimliğiniz: {sid}")]

    def _niyet_tesekkur(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        return [Giden(sid, "Rica ederiz, iyi günler dileriz!")]

    def _niyet_selam(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        return [Giden(sid, f"Merhaba, {self.isletme.ad} asistanıyım. Size nasıl yardımcı olabilirim?", MENU)]

    _niyet_yardim = _niyet_selam

    def _niyet_bilinmiyor(self, sid: int, n: Niyet, metin: str, simdi: datetime) -> list[Giden]:
        if self.ajan is not None:
            try:
                yanit, eylem = self.ajan.yanitla(metin)
            except Exception as hata:  # model kapalı, yavaş ya da bozuk yanıt: kural tabanlı menüye düş
                # Yalnız müşteri metni içermediği bilinen hata mesajı günlüğe yazılır; diğerlerinde tür adı.
                log.warning("Dil modeli kullanılamadı: %s", hata if getattr(hata, "guvenli", False)
                            else type(hata).__name__)
                yanit, eylem = "", None
            if eylem and eylem.get("eylem") == "randevu":
                tarih = None
                if eylem.get("tarih"):
                    try:
                        tarih = date.fromisoformat(eylem["tarih"])
                    except ValueError:
                        tarih = None
                istek = Niyet("randevu", hizmet=self.isletme.hizmet(eylem.get("hizmet")), tarih=tarih)
                return self._niyet_randevu(sid, istek, metin, simdi)
            if yanit:
                return [Giden(sid, yanit, MENU)]
        return [Giden(sid, "Tam anlayamadım. Aşağıdakilerden birini seçebilir ya da 'yetkili' yazabilirsiniz.", MENU)]
