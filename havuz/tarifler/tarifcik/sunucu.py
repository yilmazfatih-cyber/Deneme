"""Sunucu süreçleri ve HTTP: boş kapı bulma, arka planda başlatma, sağlık bekleme, düzgün kapatma.

    kapi = bos_kapi()
    with Surec("yz", [py, "-m", "yz", "sun", "--kapi", str(kapi)], klasor, ortam, gunluk_yolu) as yz:
        yz.saglik_bekle(f"http://127.0.0.1:{kapi}/saglik")
        durum, _, govde = http_istek("POST", url, {"soru": "…"}, {"Authorization": "Bearer …"})
    # with bloğundan çıkınca süreç ve ALT SÜREÇLERİ kapatılır (önce SIGTERM, 10 sn sonra SIGKILL)

Süreç kendi süreç grubunda başlar: npm/uvicorn gibi alt süreç açanlar da birlikte kapanır.
Çıktı bir günlük dosyasına yazılır; sağlık beklenirken süreç ölürse günlüğün sonu hataya eklenir.
Genişletme: Windows'ta süreç grubu yerine `CREATE_NEW_PROCESS_GROUP` gerekir (bu ortamda denenmedi).
"""

from __future__ import annotations

import contextlib
import json
import os
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.request
from collections.abc import Mapping, Sequence
from pathlib import Path
from types import TracebackType
from typing import IO, Any


def bos_kapi() -> int:
    """İşletim sisteminin verdiği boş bir TCP kapısı (127.0.0.1)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as soket:
        soket.bind(("127.0.0.1", 0))
        return int(soket.getsockname()[1])


class SurecHatasi(Exception):
    """Sunucu başlamadı ya da sağlık denetimine yanıt vermedi."""


class Surec:
    """Arka planda çalışan bir sunucu (bağlam yöneticisi)."""

    def __init__(
        self,
        ad: str,
        komut: Sequence[str],
        klasor: Path,
        ortam: Mapping[str, str] | None,
        gunluk_yolu: Path,
    ) -> None:
        self.ad = ad
        self.komut = list(komut)
        self.klasor = klasor
        self.ortam = dict(ortam) if ortam is not None else None
        self.gunluk_yolu = gunluk_yolu
        self._surec: subprocess.Popen[bytes] | None = None
        self._dosya: IO[bytes] | None = None

    def __enter__(self) -> Surec:
        self.gunluk_yolu.parent.mkdir(parents=True, exist_ok=True)
        self._dosya = self.gunluk_yolu.open("wb")
        print(f"\n> başlatılıyor: {self.ad}: {' '.join(self.komut)}  [{self.klasor}]", flush=True)
        self._surec = subprocess.Popen(
            self.komut,
            cwd=self.klasor,
            env=self.ortam,
            stdout=self._dosya,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        return self

    def __exit__(
        self,
        tur: type[BaseException] | None,
        hata: BaseException | None,
        iz: TracebackType | None,
    ) -> None:
        self.kapat()

    @property
    def calisiyor(self) -> bool:
        return self._surec is not None and self._surec.poll() is None

    def gunluk_sonu(self, satir: int = 40) -> str:
        try:
            metin = self.gunluk_yolu.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
        return "\n".join(metin.splitlines()[-satir:])

    def saglik_bekle(self, url: str, sure_sn: float = 120.0) -> None:
        """`url` 200 dönene dek bekler; süreç ölürse ya da süre dolarsa günlükle birlikte hata."""
        son = time.monotonic() + sure_sn
        while time.monotonic() < son:
            if not self.calisiyor:
                raise SurecHatasi(f"{self.ad} kapandı. Günlüğün sonu:\n{self.gunluk_sonu()}")
            try:
                with urllib.request.urlopen(url, timeout=5) as yanit:  # noqa: S310 - yerel adres
                    if yanit.status == 200:
                        print(f"  {self.ad} hazır: {url}", flush=True)
                        return
            except (urllib.error.URLError, ConnectionError, TimeoutError, OSError):
                pass
            time.sleep(0.5)
        raise SurecHatasi(
            f"{self.ad} {sure_sn:.0f} sn'de hazır olmadı. Günlük:\n{self.gunluk_sonu()}"
        )

    def kapat(self, bekleme_sn: float = 10.0) -> int | None:
        """Süreç grubuna SIGTERM; süre dolarsa SIGKILL. Çıkış kodunu döndürür."""
        surec, self._surec = self._surec, None
        if surec is not None:
            if surec.poll() is None:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(surec.pid, signal.SIGTERM)
                try:
                    surec.wait(timeout=bekleme_sn)
                except subprocess.TimeoutExpired:
                    os.killpg(surec.pid, signal.SIGKILL)
                    surec.wait(timeout=bekleme_sn)
            with contextlib.suppress(ProcessLookupError, PermissionError):
                os.killpg(surec.pid, signal.SIGKILL)  # grupta artakalan alt süreç kalmasın
        if self._dosya is not None:
            self._dosya.close()
            self._dosya = None
        return surec.returncode if surec is not None else None


def http_istek(
    yontem: str,
    url: str,
    govde: Any = None,
    basliklar: Mapping[str, str] | None = None,
    zaman_asimi_sn: float = 60.0,
) -> tuple[int, dict[str, str], Any]:
    """Küçük HTTP istemcisi: (durum, başlıklar, gövde) döner; gövde JSON ise çözülür.

    `govde` dict/list ise JSON gönderilir, `bytes` ise olduğu gibi. Hata durum kodları da DÖNER
    (istisna değil); bağlantı kurulamazsa `OSError` fırlatır.
    """
    tum_basliklar = dict(basliklar or {})
    veri: bytes | None = None
    if isinstance(govde, bytes):
        veri = govde
    elif govde is not None:
        veri = json.dumps(govde, ensure_ascii=False).encode("utf-8")
        tum_basliklar.setdefault("Content-Type", "application/json")
    istek = urllib.request.Request(url, data=veri, method=yontem, headers=tum_basliklar)  # noqa: S310
    try:
        with urllib.request.urlopen(istek, timeout=zaman_asimi_sn) as yanit:  # noqa: S310
            durum, ham, gelen = yanit.status, yanit.read(), dict(yanit.headers.items())
    except urllib.error.HTTPError as hata:
        durum, ham, gelen = hata.code, hata.read(), dict(hata.headers.items())
    metin = ham.decode("utf-8", errors="replace")
    try:
        return durum, gelen, json.loads(metin) if metin else None
    except json.JSONDecodeError:
        return durum, gelen, metin
