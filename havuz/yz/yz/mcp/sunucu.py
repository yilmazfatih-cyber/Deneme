"""Model Context Protocol (MCP) sunucusu şablonu — resmî `mcp` SDK'sı (2.x, `MCPServer`).

Yayımlanan araçlar paketin kendi araçlarıdır (aynı doğrulama, zaman aşımı ve güvenlik):
    hesapla, simdi, tarih_farki, tarih_ekle   her zaman
    belge_ara                                 `belge_klasoru` ya da `dizin` verilirse
    dosya_listele, dosya_oku                  `belge_klasoru` verilirse (yalnız o klasör, salt-okunur)
Taşıma: stdio (kod ajanları bunu başlatır) ya da Streamable HTTP (`/mcp` yolu).
Çalıştırma: `python -m yz mcp --klasor belgelerim` (stdio) · `python -m yz mcp --http --kapi 8421`
Bağlama adımları: docs/MCP.md.
Kim kullanır: cli.py (`mcp`), tests/test_mcp.py.
Genişletme: yeni araç → `Arac` olarak yazıp `ek_araclar=[...]` ile verin (ya da `_varsayilan_araclar`a ekleyin).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from pathlib import Path

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from yz.arac.hazir import belge_arama_araci, dosya_araclari, hesap_araci, zaman_araclari
from yz.arac.tanim import Arac
from yz.rag.dizin import RagDizini
from yz.rag.yukleyici import klasor_yukle

TALIMAT = (
    "Bu sunucu hesap makinesi, tarih/saat ve (yapılandırıldıysa) yerel belgelerde arama araçları "
    "sunar. Hesap ve tarih için tahmin etme, araçları kullan. Belge sorularında önce belge_ara."
)


def arac_sarmala(arac: Arac) -> Callable[..., str]:
    """`Arac`ı MCPServer'ın beklediği imzalı işleve çevirir; hata `ToolError` olur (ileti korunur)."""

    def islev(**kwargs: object) -> str:
        sonuc = arac.calistir(dict(kwargs))
        if sonuc.hata:
            raise ToolError(sonuc.icerik)
        return sonuc.icerik

    islev.__name__ = arac.ad
    islev.__doc__ = arac.aciklama
    imza = arac.imza.replace(return_annotation=str)
    islev.__signature__ = imza  # type: ignore[attr-defined]
    islev.__annotations__ = {p.name: p.annotation for p in imza.parameters.values()} | {
        "return": str
    }
    return islev


def _varsayilan_araclar(belge_klasoru: Path | None, dizin: RagDizini | None) -> list[Arac]:
    araclar: list[Arac] = [hesap_araci, *zaman_araclari()]
    if dizin is None and belge_klasoru is not None:
        dizin = RagDizini()
        dizin.ekle(klasor_yukle(belge_klasoru))
    if dizin is not None:
        araclar.append(belge_arama_araci(dizin))
    if belge_klasoru is not None:
        araclar.extend(dosya_araclari(belge_klasoru))
    return araclar


def mcp_sunucusu_kur(
    *,
    belge_klasoru: str | Path | None = None,
    dizin: RagDizini | None = None,
    ek_araclar: Sequence[Arac] = (),
    ad: str = "yz",
) -> MCPServer:
    """Araçları kayıtlı bir `MCPServer` döndürür (çalıştırmaz)."""
    klasor = Path(belge_klasoru) if belge_klasoru is not None else None
    sunucu = MCPServer(ad, instructions=TALIMAT)
    for arac in [*_varsayilan_araclar(klasor, dizin), *ek_araclar]:
        if arac.tehlikeli:
            continue  # onay kancası olmayan ortamda tehlikeli araç yayımlanmaz
        sunucu.add_tool(arac_sarmala(arac), name=arac.ad, description=arac.aciklama)
    return sunucu


def calistir(
    sunucu: MCPServer, *, http: bool = False, adres: str = "127.0.0.1", kapi: int = 8421
) -> None:
    """Sunucuyu çalıştırır (dönmez). stdio'da stdout'a YALNIZ protokol yazılır; günlük stderr'e."""
    if http:
        sunucu.run("streamable-http", host=adres, port=kapi)
    else:
        sunucu.run("stdio")
