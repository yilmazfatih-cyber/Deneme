"""Model Context Protocol: sunucu şablonu (araçları dışarıya yayımlar) ve köprü (dışarıdaki
araçları ajana bağlar). `mcp` ekstrası gerekir: uv pip install -e ".[mcp]".

Bu paketin adı da `mcp` olduğu için İÇERİDEN yalnız tam yolla içe aktarın:
`from yz.mcp.sunucu import mcp_sunucusu_kur` (resmî SDK `import mcp` ile gelir).
Genişletme: bkz. yz/mcp/sunucu.py ve yz/mcp/kopru.py başlıkları.
"""
