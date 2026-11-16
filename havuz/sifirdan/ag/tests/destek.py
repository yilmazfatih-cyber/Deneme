"""Testlerin ortak yardımcıları (fikstür olmayanlar).

- `BackgroundLoop`: ayrı iş parçacığında koşan asyncio döngüsü. Test ana iş parçacığında
  *engelleyen* istemcilerle
  (stdlib `http.client`, `smtplib`, ham soket) konuşurken sunucu bu döngüde çalışır.
- `raw_exchange`: ham soketle bayt gönderip yanıtı okur (bozuk/kötü niyetli istek testleri için).
- `listening_sockets`: bu sürecin hâlâ dinleyen soketlerini listeler (test sonu sızıntı denetimi).

Genişletme: birden çok mini sistemin testinde işe yarayan yeni bir yardımcıyı buraya ekleyin; tek
bir sisteme özgü olanı o sistemin test klasöründe tutun.
"""

from __future__ import annotations

import asyncio
import os
import socket
import ssl
import stat
import threading
from collections.abc import Coroutine
from pathlib import Path
from typing import Any, TypeVar

T = TypeVar("T")
HOST = "127.0.0.1"


class BackgroundLoop:
    """Arka plan iş parçacığında asyncio döngüsü; `run(coro)` sonucu eşzamanlı döndürür."""

    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._main, name="test-dongusu", daemon=True)
        self._thread.start()

    def _main(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run(self, coro: Coroutine[Any, Any, T], timeout: float = 20.0) -> T:
        """Eş yordamı arka plan döngüsünde çalıştırır ve sonucunu bekler."""
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result(timeout)

    def stop(self) -> list[str]:
        """Döngüyü durdurur; hâlâ bekleyen görev varsa adlarını döndürür (sızıntı göstergesi)."""

        async def leftovers() -> list[str]:
            await asyncio.sleep(0)  # az önce biten görevlerin kapanmasına bir tur izin ver
            current = asyncio.current_task()
            tasks = [t for t in asyncio.all_tasks() if t is not current and not t.done()]
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            return [repr(t.get_coro()) for t in tasks]

        names = self.run(leftovers())
        self.run(self.loop.shutdown_asyncgens())
        self.run(self.loop.shutdown_default_executor())
        self.loop.call_soon_threadsafe(self.loop.stop)
        self._thread.join(timeout=10)
        self.loop.close()
        return names


def raw_exchange(
    port: int, payload: bytes, timeout: float = 5.0, half_close: bool = False
) -> bytes:
    """`payload`ı gönderir, karşı taraf bağlantıyı kapatana (ya da süre dolana) dek okur."""
    with socket.create_connection((HOST, port), timeout=timeout) as sock:
        sock.sendall(payload)
        if half_close:
            sock.shutdown(socket.SHUT_WR)
        chunks: list[bytes] = []
        try:
            while True:
                data = sock.recv(65536)
                if not data:
                    break
                chunks.append(data)
        except (TimeoutError, ConnectionResetError):
            pass
        return b"".join(chunks)


def recv_until(sock: socket.socket, marker: bytes, limit: int = 1 << 20) -> bytes:
    """Soketten `marker` görülene dek okur; okunan her şeyi döndürür."""
    data = b""
    while marker not in data:
        chunk = sock.recv(65536)
        if not chunk:
            break
        data += chunk
        if len(data) > limit:
            raise AssertionError("beklenen işaret gelmeden çok fazla veri okundu")
    return data


def listening_sockets() -> list[str]:
    """Bu süreçte hâlâ dinleyen TCP soketlerini ve bağlı UDP soketlerini adresleriyle döndürür."""
    found: list[str] = []
    if not os.path.isdir("/proc/self/fd"):
        return found
    for name in os.listdir("/proc/self/fd"):
        try:
            fd = int(name)
            if not stat.S_ISSOCK(os.fstat(fd).st_mode):
                continue
            duplicate = os.dup(fd)
        except (OSError, ValueError):
            continue
        with socket.socket(fileno=duplicate) as sock:
            try:
                if sock.family not in (socket.AF_INET, socket.AF_INET6):
                    continue
                address = sock.getsockname()
                listening = sock.getsockopt(socket.SOL_SOCKET, socket.SO_ACCEPTCONN)
                if (sock.type == socket.SOCK_STREAM and listening) or (
                    sock.type == socket.SOCK_DGRAM and address[1] != 0
                ):
                    found.append(f"{sock.type.name} {address}")
            except OSError:
                continue
    return found


def make_self_signed_cert(directory: Path) -> tuple[Path, Path]:
    """127.0.0.1 ve localhost için kendinden imzalı sertifika + anahtar (yalnız test;
    `cryptography`).
    """
    import datetime
    import ipaddress

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = datetime.datetime.now(datetime.UTC)
    names = [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(days=1))
        .add_extension(x509.SubjectAlternativeName(names), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(key.public_key()), critical=False
        )
        .sign(key, hashes.SHA256())
    )
    cert_path, key_path = directory / "sertifika.pem", directory / "anahtar.pem"
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return cert_path, key_path


def server_tls_context(cert: Path, key: Path) -> ssl.SSLContext:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    return context
