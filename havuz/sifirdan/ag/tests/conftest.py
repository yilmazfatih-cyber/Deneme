"""Tüm testlerin ortak fikstürleri ve oturum sonu sızıntı denetimi.

- `loop_thread`: arka planda asyncio döngüsü (sunucular orada koşar); test bitince bekleyen görev kalırsa test düşer.
- Oturum sonunda: dinleyen soket, canlı iş parçacığı ya da alt süreç kaldıysa oturum hata verir.
- Hypothesis profili: belirlenimci (aynı örnekler), süre sınırı yok (paylaşımlı makinede yanlış alarm olmasın).

Genişletme: her mini sistemin kendine özgü fikstürleri `tests/<sistem>/conftest.py` dosyasına yazılır.
"""

from __future__ import annotations

import os
import threading
from collections.abc import Iterator

import pytest
from destek import BackgroundLoop, listening_sockets
from hypothesis import HealthCheck, settings

settings.register_profile(
    "havuz",
    deadline=None,
    derandomize=True,
    max_examples=60,
    database=None,
    suppress_health_check=[HealthCheck.too_slow],
)
settings.load_profile("havuz")


@pytest.fixture
def loop_thread() -> Iterator[BackgroundLoop]:
    """Arka plan asyncio döngüsü; test sonunda kapatılmamış görev varsa testi düşürür."""
    background = BackgroundLoop()
    try:
        yield background
    finally:
        leftovers = background.stop()
    assert not leftovers, f"Test bittiğinde hâlâ çalışan görevler var (sunucu kapatılmadı mı?): {leftovers}"


@pytest.fixture(scope="session", autouse=True)
def no_leftovers() -> Iterator[None]:
    """Oturum sonunda dinleyen kapı, iş parçacığı ve alt süreç kalmadığını doğrular."""
    yield
    sockets = listening_sockets()
    assert not sockets, f"Testlerden sonra hâlâ dinleyen soket var: {sockets}"
    for thread in threading.enumerate():
        if thread is not threading.main_thread():
            thread.join(timeout=5)
    alive = [t.name for t in threading.enumerate() if t is not threading.main_thread()]
    assert not alive, f"Testlerden sonra hâlâ çalışan iş parçacığı var: {alive}"
    try:
        pid, _status = os.waitpid(-1, os.WNOHANG)
    except ChildProcessError:
        pid = -1  # hiç alt süreç yok: beklenen durum
    assert pid != 0, "Testlerden sonra hâlâ çalışan alt süreç var"
