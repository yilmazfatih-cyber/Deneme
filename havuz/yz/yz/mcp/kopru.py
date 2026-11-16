"""MCP köprüsü: bir MCP sunucusunun araçlarını ajanın kullanabileceği `Arac` nesnelerine çevirir.

Ajan döngüsü eşzamanlıdır (sync), MCP istemcisi eşzamansızdır (async). Köprü arka planda kendi
olay döngüsünü (event loop) çalıştıran bir iş parçacığı açar; her araç çağrısı oraya gönderilip
sonucu beklenir. Bağlantı köprü açık kaldıkça sürer:

    with McpKoprusu("http://127.0.0.1:8421/mcp") as kopru:          # ya da StdioServerParameters
        sonuc = Ajan(saglayici, kopru.araclar()).calistir("…")

Kim kullanır: cli.py (`sohbet --mcp`), tests/test_mcp.py.
Genişletme: kaynak (resource) ya da istem (prompt) desteği → `_ana` içinde istemcinin ilgili
yöntemlerini çağıran yeni bir yöntem ekleyin.
"""

from __future__ import annotations

import asyncio
import re
import threading
from collections.abc import Coroutine
from types import TracebackType
from typing import Any, TypeVar

from mcp import Client, StdioServerParameters
from mcp.server.mcpserver import MCPServer

from yz.arac.tanim import AracSonucu, SemaliArac
from yz.hatalar import BaglantiHatasi

T = TypeVar("T")
McpHedefi = str | StdioServerParameters | MCPServer


def _icerik_metni(sonuc: Any) -> str:
    parcalar = []
    for icerik in getattr(sonuc, "content", None) or []:
        metin = getattr(icerik, "text", None)
        parcalar.append(
            metin if isinstance(metin, str) else f"[{getattr(icerik, 'type', 'içerik')}]"
        )
    return "\n".join(parcalar)


class McpKoprusu:
    """Bir MCP sunucusuna bağlanır ve araçlarını `SemaliArac` olarak sunar."""

    def __init__(self, hedef: McpHedefi, zaman_asimi_sn: float = 30.0) -> None:
        self.hedef = hedef
        self.zaman_asimi_sn = zaman_asimi_sn
        self._dongu: asyncio.AbstractEventLoop | None = None
        self._istemci: Client | None = None
        self._hazir = threading.Event()
        self._dur: asyncio.Event | None = None
        self._hata: BaseException | None = None
        self._is_parcacigi: threading.Thread | None = None
        self._araclar: list[SemaliArac] = []

    def __enter__(self) -> McpKoprusu:
        self._is_parcacigi = threading.Thread(target=self._calis, daemon=True, name="mcp-kopru")
        self._is_parcacigi.start()
        if not self._hazir.wait(self.zaman_asimi_sn) or self._hata is not None:
            self.__exit__(None, None, None)
            raise BaglantiHatasi(
                f"MCP sunucusuna bağlanılamadı ({self.hedef!r}): {self._hata or 'zaman aşımı'}"
            )
        sonuc = self._gonder(self._istemci_al().list_tools())
        self._araclar = [self._arac_kur(t) for t in sonuc.tools]
        return self

    def __exit__(
        self, tur: type[BaseException] | None, deger: BaseException | None, iz: TracebackType | None
    ) -> None:
        if self._dongu is not None and self._dur is not None and not self._dongu.is_closed():
            self._dongu.call_soon_threadsafe(self._dur.set)
        if self._is_parcacigi is not None:
            self._is_parcacigi.join(self.zaman_asimi_sn)

    def _calis(self) -> None:
        try:
            asyncio.run(self._ana())
        except BaseException as hata:
            self._hata = hata
            self._hazir.set()

    async def _ana(self) -> None:
        self._dongu = asyncio.get_running_loop()
        self._dur = asyncio.Event()
        async with Client(self.hedef, read_timeout_seconds=self.zaman_asimi_sn) as istemci:
            self._istemci = istemci
            self._hazir.set()
            await self._dur.wait()

    def _istemci_al(self) -> Client:
        if self._istemci is None:
            raise BaglantiHatasi(
                "MCP köprüsü açık değil; `with McpKoprusu(...) as kopru:` kullanın."
            )
        return self._istemci

    def _gonder(self, coro: Coroutine[Any, Any, T]) -> T:
        if self._dongu is None:
            raise BaglantiHatasi("MCP köprüsü açık değil.")
        return asyncio.run_coroutine_threadsafe(coro, self._dongu).result(self.zaman_asimi_sn)

    def _arac_kur(self, tanim: Any) -> SemaliArac:
        mcp_adi = str(tanim.name)
        ad = re.sub(r"[^A-Za-z0-9_-]", "_", mcp_adi)[:64]

        def calistirici(argumanlar: dict[str, Any]) -> AracSonucu:
            sonuc = self._gonder(self._istemci_al().call_tool(mcp_adi, argumanlar))
            return AracSonucu(_icerik_metni(sonuc), bool(getattr(sonuc, "is_error", False)))

        # MCP'de ipucu yoksa araç "yıkıcı olabilir" sayılır: yalnız `readOnlyHint` diyen araç onaysız
        # çalışır, öteki her araç tehlikelidir (onay kancası yoksa varsayılan ret; arac/kutu.py).
        # İpucu sunucunun beyanıdır: güvenmediğiniz bir MCP sunucusuna hiç bağlanmayın.
        salt_okunur = bool(getattr(getattr(tanim, "annotations", None), "read_only_hint", False))
        return SemaliArac(
            ad,
            str(tanim.description or ""),
            dict(tanim.input_schema or {}),
            calistirici,
            tehlikeli=not salt_okunur,
            zaman_asimi_sn=self.zaman_asimi_sn,
        )

    def araclar(self) -> list[SemaliArac]:
        """Sunucudaki araçlar (bağlanırken listelenir)."""
        return list(self._araclar)
