"""Telegram Bot API bağdaştırıcısı (yalnız standart kütüphane).

İki taşıma yolu: uzun yoklama (getUpdates; sunucu/alan adı gerekmez) ve webhook
(Telegram'ın gönderdiği X-Telegram-Bot-Api-Secret-Token başlığı sabit zamanlı
karşılaştırmayla doğrulanır). Testler gerçek Telegram yerine yerel sahte sunucu kullanır;
taban_url bu yüzden değiştirilebilir.

İşleme modeli (OpenClaw'ın Telegram kanalından uyarlandı, bkz. openclaw/openclaw 7c78826
docs/channels/telegram/transports.md): güncelleme önce kuyruğa alınır, webhook hemen 200 döner;
iş sohbet başına sıralı, sohbetler arasında paralel "şeritlerde" yapılır. Böylece yavaş bir
model çağrısı diğer müşterileri bekletmez, Telegram da zaman aşımı yüzünden aynı güncellemeyi
yeniden göndermez; yeniden gönderilen update_id bir kez işlenir. Fark: OpenClaw kuyruğu diske
yazar, burada kuyruk bellektedir (süreç çökerse işlenmemiş mesajlar kaybolur).
"""

from __future__ import annotations

import hmac
import http.client
import json
import logging
import queue
import re
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict, deque
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .yonlendirici import Yonlendirici

log = logging.getLogger(__name__)
AZAMI_GOVDE = 1_000_000  # bayt; Telegram güncellemeleri bunun çok altındadır
AZAMI_YANIT = 10_000_000  # bayt; Bot API yanıtı için üst sınır (sınırsız okuma yok)
# Telegram setWebhook secret_token kuralı (Bot API belgesine göre, doğrulanmadı): 1-256 karakter, yalnız
# A-Z a-z 0-9 _ -. En az 16 karakter bizim güvenlik tercihimiz.
GIZLI_DESENI = re.compile(r"[A-Za-z0-9_-]{16,256}")


class TelegramHatasi(Exception):
    pass


class TelegramIstemcisi:
    def __init__(self, token: str, taban_url: str = "https://api.telegram.org", zaman_asimi: float = 40.0) -> None:
        if not token:
            raise ValueError("Bot belirteci (TELEGRAM_BOT_TOKEN) boş olamaz")
        self._token = token  # günlüklere ve hata mesajlarına asla yazılmaz
        self.taban_url = taban_url.rstrip("/")
        self.zaman_asimi = zaman_asimi

    def __repr__(self) -> str:
        return f"TelegramIstemcisi(taban_url={self.taban_url!r})"

    def cagir(self, metod: str, veri: dict | None = None) -> object:
        istek = urllib.request.Request(
            f"{self.taban_url}/bot{self._token}/{metod}",
            data=json.dumps(veri or {}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            try:
                with urllib.request.urlopen(istek, timeout=self.zaman_asimi) as yanit:
                    ham = yanit.read(AZAMI_YANIT + 1)
                    if len(ham) <= AZAMI_YANIT and getattr(yanit, "length", None):
                        raise http.client.IncompleteRead(ham)  # Content-Length'ten az bayt: bağlantı koptu
            except urllib.error.HTTPError as hata:  # Telegram hata gövdesi de JSON'dur: {"ok": false, ...}
                try:
                    ham = hata.read(AZAMI_YANIT + 1)
                finally:
                    hata.close()
                try:
                    json.loads(ham.decode("utf-8"))
                except ValueError:  # vekilin HTML hata sayfası ya da boş gövde: durum kodunu bildir
                    ham = json.dumps({"ok": False, "description": f"HTTP {hata.code}"}).encode()
        except (OSError, http.client.HTTPException) as hata:
            # Kopan bağlantı (RemoteDisconnected), yarım gövde (IncompleteRead), zaman aşımı, DNS...
            # Hata metninde URL (dolayısıyla belirteç) olmasın diye yalnız tür adı yazılır.
            raise TelegramHatasi(f"{metod}: bağlantı hatası ({type(hata).__name__})") from None
        if len(ham) > AZAMI_YANIT:
            raise TelegramHatasi(f"{metod}: yanıt çok büyük")
        try:
            govde = json.loads(ham.decode("utf-8"))
        except ValueError:
            raise TelegramHatasi(f"{metod}: yanıt JSON değil") from None
        if not isinstance(govde, dict) or not govde.get("ok"):
            aciklama = govde.get("description", "bilinmeyen hata") if isinstance(govde, dict) else "bozuk yanıt"
            raise TelegramHatasi(f"{metod}: {aciklama}")
        return govde.get("result")

    def mesaj_gonder(self, sohbet_id: int, metin: str, secenekler: tuple[str, ...] = ()) -> object:
        if secenekler:  # yanıt klavyesi: düğmeye basınca metni normal mesaj olarak gelir
            isaret = {"keyboard": [[{"text": s}] for s in secenekler], "resize_keyboard": True,
                      "one_time_keyboard": True}
        else:
            isaret = {"remove_keyboard": True}
        return self.cagir("sendMessage", {"chat_id": sohbet_id, "text": metin[:4096], "reply_markup": isaret})

    def webhook_ayarla(self, url: str, gizli: str) -> object:
        return self.cagir("setWebhook", {"url": url, "secret_token": gizli, "allowed_updates": ["message"]})


class HizSiniri:
    """Sohbet başına kayan pencere: dakikada en fazla `azami` mesaj (spam ve maliyet koruması).

    İş parçacığı güvenlidir; uzun süre sessiz kalan sohbetlerin kayıtları budanır (bellek sınırsız büyümez).
    """

    def __init__(self, azami: int = 20, pencere_sn: float = 60.0, saat: Callable[[], float] = time.monotonic) -> None:
        self.azami, self.pencere_sn, self.saat = azami, pencere_sn, saat
        self._gecmis: dict[int, deque[float]] = defaultdict(deque)
        self._kilit = threading.Lock()
        self._sayac = 0

    def izin(self, sohbet_id: int) -> bool:
        with self._kilit:
            simdi, kuyruk = self.saat(), self._gecmis[sohbet_id]
            while kuyruk and simdi - kuyruk[0] > self.pencere_sn:
                kuyruk.popleft()
            izin = len(kuyruk) < self.azami
            if izin:
                kuyruk.append(simdi)
            self._sayac += 1
            if self._sayac % 1000 == 0:
                for eski in [s for s, k in self._gecmis.items() if not k or simdi - k[-1] > self.pencere_sn]:
                    del self._gecmis[eski]
            return izin

    def __len__(self) -> int:
        return len(self._gecmis)


class Seritler:
    """Güncellemeleri sohbet başına sıralı, sohbetler arasında paralel işleyen iş kuyrukları.

    ekle(): 'kabul', 'tekrar' (aynı update_id daha önce alındı) ya da 'dolu' (kuyruk dolu) döndürür.
    """

    def __init__(self, isleyici: Callable[[dict], object], serit_sayisi: int = 4, kuyruk_siniri: int = 500,
                 hatirla: int = 5000) -> None:
        self._isleyici = isleyici
        self._kuyruklar: list[queue.Queue] = [queue.Queue(maxsize=kuyruk_siniri) for _ in range(serit_sayisi)]
        self._gorulen: deque[int] = deque()
        self._gorulen_kume: set[int] = set()
        self._hatirla = hatirla
        self._kilit = threading.Lock()
        self._iscler = [
            threading.Thread(target=self._calis, args=(k,), daemon=True, name=f"esnaf-serit-{no}")
            for no, k in enumerate(self._kuyruklar)
        ]
        for isci in self._iscler:
            isci.start()

    def ekle(self, guncelleme: dict) -> str:
        uid = guncelleme.get("update_id")
        mesaj = guncelleme.get("message")
        sohbet = mesaj.get("chat") if isinstance(mesaj, dict) else None
        sohbet_id = sohbet.get("id") if isinstance(sohbet, dict) else None
        serit = self._kuyruklar[(sohbet_id if isinstance(sohbet_id, int) else 0) % len(self._kuyruklar)]
        with self._kilit:
            if uid in self._gorulen_kume:
                return "tekrar"
            try:
                serit.put_nowait(guncelleme)
            except queue.Full:
                return "dolu"
            self._gorulen.append(uid)
            self._gorulen_kume.add(uid)
            if len(self._gorulen) > self._hatirla:
                self._gorulen_kume.discard(self._gorulen.popleft())
        return "kabul"

    def _calis(self, kuyruk: queue.Queue) -> None:
        while True:
            guncelleme = kuyruk.get()
            try:
                if guncelleme is None:
                    return
                self._isleyici(guncelleme)
            except Exception:  # tek mesajdaki hata şeridi durdurmamalı
                log.exception("Güncelleme %s işlenemedi", guncelleme.get("update_id") if guncelleme else None)
            finally:
                kuyruk.task_done()

    def bekle(self) -> None:
        """Kuyruktaki tüm işler bitene kadar bekler (testler ve düzenli kapanış için)."""
        for kuyruk in self._kuyruklar:
            kuyruk.join()

    def durdur(self, zaman_asimi: float = 5.0) -> None:
        for kuyruk in self._kuyruklar:
            kuyruk.put(None)
        for isci in self._iscler:
            isci.join(zaman_asimi)


def guncellemeyi_isle(guncelleme: dict, yonlendirici: Yonlendirici, istemci: TelegramIstemcisi,
                      sinir: HizSiniri | None = None) -> int:
    """Tek bir Update nesnesini işler; gönderilebilen mesaj sayısını döndürür. Grup mesajları yok sayılır.

    Her giden mesaj ayrı denenir: müşteri botu engellediyse (403) bile işletme sahibinin bildirimi gider.
    """
    mesaj = guncelleme.get("message") or {}
    sohbet = mesaj.get("chat") or {}
    if sohbet.get("type") != "private" or not isinstance(sohbet.get("id"), int):
        return 0
    if not isinstance(mesaj.get("text"), str):
        return 0
    if sinir and not sinir.izin(sohbet["id"]):
        return 0
    ad = (mesaj.get("from") or {}).get("first_name", "")
    gonderilen = 0
    for giden in yonlendirici.isle(sohbet["id"], mesaj["text"], ad if isinstance(ad, str) else ""):
        try:
            istemci.mesaj_gonder(giden.sohbet_id, giden.metin, giden.secenekler)
            gonderilen += 1
        except TelegramHatasi as hata:
            log.warning("Mesaj gönderilemedi (alıcı %s): %s", giden.sohbet_id, hata)
    return gonderilen


def uzun_yoklama(istemci: TelegramIstemcisi, yonlendirici: Yonlendirici, tur: int | None = None,
                 bekleme_sn: int = 25, uyku: Callable[[float], object] = time.sleep, serit_sayisi: int = 4) -> None:
    """getUpdates döngüsü. tur=None sonsuza kadar çalışır; testler küçük bir tur sayısı verir.

    Hata sonrası bekleme 5 sn'den başlayıp 60 sn'ye kadar ikiye katlanır; süreç ölmez.
    """
    sinir = HizSiniri()
    seritler = Seritler(lambda g: guncellemeyi_isle(g, yonlendirici, istemci, sinir), serit_sayisi)
    offset, sayac, hata_sayisi = None, 0, 0
    try:
        while tur is None or sayac < tur:
            sayac += 1
            istek: dict = {"timeout": bekleme_sn, "allowed_updates": ["message"]}
            if offset is not None:
                istek["offset"] = offset
            try:
                guncellemeler = istemci.cagir("getUpdates", istek)
            except TelegramHatasi as hata:
                hata_sayisi += 1
                bekle = min(60, 5 * 2 ** (hata_sayisi - 1))
                log.warning("%s; %s sn sonra yeniden denenecek", hata, bekle)
                uyku(bekle)
                continue
            hata_sayisi = 0
            for guncelleme in guncellemeler if isinstance(guncellemeler, list) else []:
                if not isinstance(guncelleme, dict) or not isinstance(guncelleme.get("update_id"), int):
                    continue
                offset = guncelleme["update_id"] + 1  # işlenemese bile ilerle: bozuk mesaj döngüye sokmasın
                while seritler.ekle(guncelleme) == "dolu":  # geri basınç: kuyruk boşalana kadar bekle
                    uyku(0.5)
        seritler.bekle()
    finally:
        seritler.durdur()


class WebhookSunucusu(ThreadingHTTPServer):
    seritler: Seritler

    def server_close(self) -> None:
        super().server_close()
        self.seritler.durdur()


def webhook_sunucusu(istemci: TelegramIstemcisi, yonlendirici: Yonlendirici, gizli: str,
                     adres: tuple[str, int] = ("127.0.0.1", 8080), yol: str = "/telegram",
                     serit_sayisi: int = 4) -> WebhookSunucusu:
    """Webhook HTTP sunucusu döndürür (serve_forever çağırmak çağırana kalır). TLS'i önündeki ters vekil sağlar."""
    if not GIZLI_DESENI.fullmatch(gizli):
        raise ValueError("Webhook gizli anahtarı (TELEGRAM_WEBHOOK_SECRET) 16-256 karakter olmalı ve yalnız "
                         "A-Z, a-z, 0-9, _ ve - içermeli")
    sinir = HizSiniri()
    seritler = Seritler(lambda g: guncellemeyi_isle(g, yonlendirici, istemci, sinir), serit_sayisi)

    class Isleyici(BaseHTTPRequestHandler):
        timeout = 10  # yavaş gönderen bağlantı (slowloris) iş parçacığını sonsuza kadar tutamasın

        def do_POST(self) -> None:  # noqa: N802 (http.server adlandırması)
            if self.path != yol:
                return self._bitir(404)
            gelen = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            if not hmac.compare_digest(gelen.encode(), gizli.encode()):
                return self._bitir(401)
            try:
                uzunluk = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self._bitir(400)
            if not 0 < uzunluk <= AZAMI_GOVDE:
                return self._bitir(413)
            try:
                guncelleme = json.loads(self.rfile.read(uzunluk))
            except (ValueError, OSError):
                return self._bitir(400)
            if not isinstance(guncelleme, dict) or not isinstance(guncelleme.get("update_id"), int):
                return self._bitir(400)
            # Kuyruğa al ve hemen yanıt ver; dolu kuyrukta 503: Telegram daha sonra yeniden dener.
            return self._bitir(503 if seritler.ekle(guncelleme) == "dolu" else 200)

        def _bitir(self, kod: int) -> None:
            self.send_response(kod)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:  # erişim günlüğü kapalı (gizlilik)
            return

    sunucu = WebhookSunucusu(adres, Isleyici)
    sunucu.seritler = seritler
    return sunucu
