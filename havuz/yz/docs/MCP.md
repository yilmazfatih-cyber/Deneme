# MCP (Model Context Protocol) sunucusu ve köprüsü

`yz` iki yönde MCP konuşur:

1. **Sunucu** (`python -m yz mcp`): paketin araçlarını başka uygulamalara (kod ajanları, masaüstü
   sohbet uygulamaları) yayımlar.
2. **Köprü** (`yz.mcp.kopru.McpKoprusu`): başka bir MCP sunucusunun araçlarını `yz` ajanına bağlar.

SDK: resmî Python `mcp` paketi 2.x (bu ortamda 2.3.0; `MCPServer` ve `Client` API'si kurulu
paketten doğrulandı). Kurulum: `uv pip install --python .venv/bin/python -e ".[mcp]"` (dev ekstrası içerir).

## Yayımlanan araçlar

| Araç | Ne yapar | Ne zaman var |
| --- | --- | --- |
| `hesapla` | Güvenli aritmetik (AST; `eval` yok; Türkçe ondalık ve `%18` anlar) | her zaman |
| `simdi`, `tarih_farki`, `tarih_ekle` | Bugünün tarihi (Europe/Istanbul), iki tarih arası gün, tarihe gün ekleme | her zaman |
| `belge_ara` | Klasördeki belgelerde karma arama; numaralı ve kaynaklı parçalar | `--klasor` verilirse |
| `dosya_listele`, `dosya_oku` | Klasörde salt-okunur gezinme (kök dışına çıkış, gizli dosya, ikili dosya reddedilir) | `--klasor` verilirse |

Tehlikeli (dünyayı değiştiren) araçlar MCP'ye yayımlanmaz; onay kancası yalnız `yz` ajanında vardır.
Yayımlanan her araç `readOnlyHint: true` ipucuyla işaretlenir (istemciler onaysız çalıştırabilsin).

## Çalıştırma

```bash
# stdio (kod ajanları bu komutu kendileri başlatır)
.venv/bin/python -m yz mcp --klasor /yol/belgelerim

# Streamable HTTP (http://127.0.0.1:8421/mcp)
.venv/bin/python -m yz mcp --http --kapi 8421 --klasor /yol/belgelerim
```

stdio kipinde standart çıktıya yalnız protokol yazılır; günlükler standart hataya gider.
HTTP kipi yalnız `127.0.0.1`'de dinler (kimlik doğrulama yoktur; başka adrese açmayın).

## Bir kod ajanına bağlama

Aşağıdaki biçimler istemcilerin belgelerinden alınmıştır; **bu ortamda o istemcilerle denenmedi**
(doğrulanan: aynı sunucuya resmî SDK istemcisiyle stdio ve HTTP üzerinden bağlanma —
`tests/test_mcp.py`). Yollar mutlak olmalıdır.

**Claude Code (komut satırı):**

```bash
claude mcp add yz -- /mutlak/yol/havuz/yz/.venv/bin/python -m yz mcp --klasor /mutlak/yol/belgelerim
# ya da HTTP sunucusu çalışıyorsa:
claude mcp add --transport http yz http://127.0.0.1:8421/mcp
```

**Proje dosyası (`.mcp.json`) ya da masaüstü uygulamalarının `mcpServers` ayarı:**

```json
{
  "mcpServers": {
    "yz": {
      "command": "/mutlak/yol/havuz/yz/.venv/bin/python",
      "args": ["-m", "yz", "mcp", "--klasor", "/mutlak/yol/belgelerim"]
    }
  }
}
```

Bağlandıktan sonra ajandan "belgelerimde iade süresini ara" ya da "2026-01-01 ile 2026-03-01
arasında kaç gün var?" gibi bir istekle deneyin.

## Kendi aracını yayımla

```python
from yz.arac.tanim import Arac
from yz.mcp.sunucu import calistir, mcp_sunucusu_kur


def stok_sorgula(urun_kodu: str) -> str:
    """Ürünün stok adedini verir.

    Args:
        urun_kodu: Ürün kodu, ör. "A-100".
    """
    return "12"


calistir(mcp_sunucusu_kur(ek_araclar=[Arac(stok_sorgula)]))  # stdio
```

Araç kuralları `AGENTS.md` "Yeni araç ekle" tarifindedir (tip ipucu, belge dizgisi, hata = istisna).

## Başka bir MCP sunucusunu `yz` ajanına bağla (köprü)

```python
from mcp import StdioServerParameters
from yz.ajan import Ajan
from yz.mcp.kopru import McpKoprusu

hedef = StdioServerParameters(
    command="/yol/sunucu", args=["--secenek"]
)  # ya da "http://127.0.0.1:8421/mcp"
with McpKoprusu(hedef) as kopru:
    sonuc = Ajan(saglayici, kopru.araclar()).calistir("Görev…")
```

Komut satırından: `python -m yz sohbet --arac --mcp "http://127.0.0.1:8421/mcp"` (ya da
`--mcp "/yol/sunucu --secenek"` ile stdio).

Köprü, MCP araç adlarındaki izin verilmeyen karakterleri `_` yapar; zorunlu argümanları denetler,
tip denetimini sunucuya bırakır. Sunucunun döndürdüğü hata (`is_error`) ajana gözlem olarak gider.

**Onay:** `readOnlyHint: true` ipucu taşımayan her uzak araç **tehlikeli** sayılır: onay kancası
(`AracKutusu(..., onay=...)`) yoksa çalışmaz, varsa önce sorulur (`sohbet --arac --mcp` konsoldan sorar).
MCP'de ipucu yoksa varsayılan "yıkıcı olabilir"dir; köprü hepsini zararsız saysaydı bağlanan bir dosya
sistemi sunucusunun silme aracı (ör. bir belgedeki istem enjeksiyonuyla) onaysız çalışırdı. İpucu
sunucunun kendi beyanıdır: güvenmediğiniz bir MCP sunucusuna hiç bağlanmayın.
