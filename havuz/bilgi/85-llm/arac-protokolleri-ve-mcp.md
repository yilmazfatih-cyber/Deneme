---
baslik: Araç protokolleri ve MCP
ozet: Modele araç bağlamanın genel düzeni (tanım, çağrı, sonuç), araç sunucusu kavramı ve MCP'nin ne zaman işe yaradığı, güvenlik (yetki, onay, üçüncü taraf sunucu); havuzdaki çalışan sunucuya bağlantı.
etiketler: [llm, arac, mcp, protokol, guvenlik]
duzey: orta
guncellik: 2026-11
---

# Araç protokolleri ve MCP

> Bu notu ne zaman okumalı: Bir modele kendi işlevlerinizi araç olarak tanıtırken; bir kod ajanına ya da masaüstü
> sohbet uygulamasına belgelerinizi/hesap araçlarınızı bağlamak isterken; başkasının yazdığı bir araç sunucusunu
> kurmadan önce. Ajan döngüsü ve araç tasarımı: [Ajanlar ve araçlar](ajanlar-ve-araclar.md).

## Temel fikir

Model hiçbir şeyi kendisi çalıştırmaz. Siz araçları **tanımlarsınız** (ad, açıklama, parametre şeması); model bir
**çağrı** önerir (araç adı + argümanlar); **sizin kodunuz** çağrıyı doğrular, çalıştırır ve sonucu çağrı kimliğiyle
bir **araç iletisi** olarak geri verir; model devam eder. Bu düzen her sağlayıcıda aynıdır; yalnız tel biçimi
(alan adları, argümanın dizgi mi nesne mi geldiği) değişir. **Araç sunucusu**, araçları ayrı bir süreçte paketleyip
standart bir protokolle birçok istemciye sunar; Model Context Protocol (MCP) bunun yaygın bir örneğidir. Protokol
ayrıntısı sürümle değişir: ezberden yazmayın, kurulu SDK'dan doğrulayın; havuzda doğrulanmış, çalışan bir sunucu var
([`yz/docs/MCP.md`](../../yz/docs/MCP.md)).

## Karar tablosu: süreç içi araç mı, araç sunucusu mu

| Durum                                                                | Seçim                         | Neden                                                    |
| -------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------- |
| Tek uygulama, araçlar aynı dilde, az araç                            | Süreç içi işlev (doğrudan)    | En az parça; hata ayıklaması kolay; gecikme yok          |
| Aynı araçları birden çok istemci kullanacak (kod ajanı, sohbet uygulaması, kendi ajanınız) | Araç sunucusu (MCP)  | Bir kez yaz, her istemcide kullan                         |
| Kod ajanına belgelerinizi / veritabanınızı okutacaksınız             | MCP sunucusu (salt-okunur)    | Kod ajanları MCP sunucularını doğrudan bağlayabilir      |
| Araç başka bir dilde ya da başka makinede                             | Araç sunucusu                 | Süreç sınırı doğal ayrımdır                              |
| Dünyayı değiştiren araç (ödeme, silme, e-posta)                      | Süreç içi + insan onayı       | Onay kancası istemciye göre değişir; havuz MCP'de yayımlamaz |
| Başkasının yazdığı araç sunucusu                                     | Yalnız güvenilir kaynak, sabit sürüm, en dar yetki | Kendi yetkinizle çalışır; açıklamaları modele gider |

## Genel düzen: tanım → çağrı → sonuç

```text
istemci ──(iletiler + araç tanımları)──► model
model   ──(araç çağrısı: kimlik, ad, argümanlar)──► istemci
istemci: doğrula → (tehlikeliyse onay) → çalıştır → sonucu kırp
istemci ──(araç iletisi: aynı kimlik + sonuç ya da HATA metni)──► model
model   ──► yeni çağrı ya da yanıt
```

Ayrıntılar ve tuzaklar:

- **Tanım:** ad (eylem + nesne), ilk cümlesi "ne zaman kullanılır" diyen açıklama, tipli parametre şeması, zorunlu
  alanlar. Model aracı bu metne bakarak seçer.
- **Argüman biçimi:** bazı sunucular argümanı JSON **dizgisi**, bazıları **nesne** olarak verir; bozuk JSON da gelir.
  İkisini de kabul edin ve sağlam ayrıştırın ([yapılı çıktı](yapili-cikti.md); havuz: `yz/docs/KARARLAR.md` K-01).
- **Kimlik eşleme:** her sonuç, ait olduğu çağrının kimliğiyle döner. Bir turda birden çok çağrı gelebilir; hepsinin
  sonucu verilmeden model devam ettirilmez.
- **Hata = sonuç:** araç hatası istisna olarak döngüyü düşürmez; modelin düzeltebileceği Türkçe, kısa bir metin olur.
- **Araç desteği olmayan sunucu:** model aracı düz metinle "çağırır"; metin kipine (ReAct) geçilir
  (`yz/yz/ajan/metin_kipi.py`).

```python calistir
import inspect
import json
from datetime import date
from typing import get_type_hints

TIP = {str: "string", int: "integer", float: "number", bool: "boolean"}


def arac_tanimi(islev) -> dict:
    """İşlevin imzası ve belge dizgisinden araç tanımı (ad + açıklama + parametre şeması)."""
    imza, ipucu = inspect.signature(islev), get_type_hints(islev)
    return {
        "name": islev.__name__,
        "description": inspect.getdoc(islev).splitlines()[0],
        "parameters": {
            "type": "object",
            "properties": {ad: {"type": TIP[ipucu[ad]]} for ad in imza.parameters},
            "required": [ad for ad, p in imza.parameters.items() if p.default is inspect.Parameter.empty],
        },
    }


def tarih_farki(baslangic: str, bitis: str) -> int:
    """İki tarih (YYYY-AA-GG) arasındaki gün sayısını verir."""
    try:
        return (date.fromisoformat(bitis) - date.fromisoformat(baslangic)).days
    except ValueError:
        raise ValueError("tarih YYYY-AA-GG biçiminde olmalı, ör. 2026-03-01") from None


ARACLAR = {f.__name__: f for f in [tarih_farki]}
TANIMLAR = {ad: arac_tanimi(f) for ad, f in ARACLAR.items()}  # modele bu tanımlar gönderilir


def calistir(cagri: dict) -> dict:
    """Modelin araç çağrısını yürütür; sonuç ya da hata HER ZAMAN aynı kimlikle bir araç iletisi olur."""
    def ileti(icerik: str) -> dict:
        return {"role": "tool", "tool_call_id": cagri["id"], "content": icerik}

    if cagri["name"] not in ARACLAR:
        return ileti(f"HATA: '{cagri['name']}' diye araç yok. Kullanılabilenler: {', '.join(ARACLAR)}")
    sema = TANIMLAR[cagri["name"]]["parameters"]
    try:
        arg = cagri["arguments"]
        arg = json.loads(arg) if isinstance(arg, str) else arg  # sunucuya göre dizgi ya da nesne gelir
    except json.JSONDecodeError:
        return ileti("HATA: argümanlar geçerli JSON değil")
    if eksik := [a for a in sema["required"] if a not in arg]:
        return ileti(f"HATA: eksik argüman: {', '.join(eksik)}")
    if fazla := [a for a in arg if a not in sema["properties"]]:
        return ileti(f"HATA: bilinmeyen argüman: {', '.join(fazla)}; geçerli: {', '.join(sema['properties'])}")
    try:
        return ileti(json.dumps(ARACLAR[cagri["name"]](**arg)))
    except ValueError as hata:  # aracın Türkçe, eyleme dönük hatası modele gözlem olarak döner
        return ileti(f"HATA: {hata}")


print(json.dumps(TANIMLAR["tarih_farki"], ensure_ascii=False))
print(calistir({"id": "c1", "name": "tarih_farki", "arguments": '{"baslangic": "2026-01-01", "bitis": "2026-03-01"}'}))
print(calistir({"id": "c2", "name": "tarih_farki", "arguments": {"baslangic": "01.01.2026", "bitis": "2026-03-01"}}))
assert calistir({"id": "c3", "name": "tarih_farki", "arguments": {"bitis": "2026-03-01"}})["content"].startswith("HATA: eksik")
assert "Kullanılabilenler" in calistir({"id": "c4", "name": "takvim", "arguments": {}})["content"]
```

```cikti
{"name": "tarih_farki", "description": "İki tarih (YYYY-AA-GG) arasındaki gün sayısını verir.", "parameters": {"type": "object", "properties": {"baslangic": {"type": "string"}, "bitis": {"type": "string"}}, "required": ["baslangic", "bitis"]}}
{'role': 'tool', 'tool_call_id': 'c1', 'content': '59'}
{'role': 'tool', 'tool_call_id': 'c2', 'content': 'HATA: tarih YYYY-AA-GG biçiminde olmalı, ör. 2026-03-01'}
```

Havuzdaki tam gerçekleme (Pydantic ile tip doğrulama, zaman aşımı, `tehlikeli` işareti, argüman düzeltme):
`yz/yz/arac/tanim.py` ve `yz/yz/arac/kutu.py`.

## Araç sunucusu kavramı ve MCP

Araç sunucusu, araçları (ve bazen okunacak kaynakları, hazır istemleri) ayrı bir süreçte çalıştırır; istemci onu
başlatır ya da adresine bağlanır, araç listesini ister, çağrıları ona iletir. Yararı: aynı araç kümesi kod ajanında,
masaüstü sohbet uygulamasında ve kendi ajanınızda değişmeden kullanılır.

Havuzda **doğrulanmış** olanlar ([`yz/docs/MCP.md`](../../yz/docs/MCP.md), resmî Python `mcp` paketi 2.x, kurulu
paketten doğrulandı):

| Ne                         | Nasıl                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Sunucuyu stdio ile çalıştırma | `.venv/bin/python -m yz mcp --klasor /yol/belgelerim` (istemci bu komutu kendisi başlatır) |
| HTTP ile çalıştırma        | `python -m yz mcp --http --kapi 8421` → `http://127.0.0.1:8421/mcp` (yalnız yerel; kimlik doğrulama yok) |
| Yayımlanan araçlar         | `hesapla`, `simdi`, `tarih_farki`, `tarih_ekle`; klasör verilirse `belge_ara`, `dosya_listele`, `dosya_oku` |
| Kendi aracını yayımlama    | `mcp_sunucusu_kur(ek_araclar=[Arac(islev)])` (`yz/yz/mcp/sunucu.py`)               |
| Başka MCP sunucusunu `yz` ajanına bağlama | `McpKoprusu` (`yz/yz/mcp/kopru.py`); komut satırı: `python -m yz sohbet --arac --mcp "<adres ya da komut>"` |
| Doğrulama düzeyi           | Resmî SDK istemcisiyle stdio ve HTTP üzerinden test edildi (`yz/tests/test_mcp.py`); kod ajanı ve masaüstü istemcilerinin ayar biçimleri o istemcilerin belgelerinden alındı, **denenmedi** |

Bilinen ayrıntılar (havuzdan): stdio kipinde standart çıktıya yalnız protokol yazılır, günlükler standart hataya
gider (standart çıktıya basılan bir `print` bağlantıyı bozar); araç hatası SDK'nın hata türüyle yükseltilmezse ileti
gizlenebilir (`yz/docs/KARARLAR.md` K-13); istemci ayarlarında yollar mutlak olmalıdır.

## Güvenlik

| Risk                                                      | Önlem                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| Sunucu sizin kullanıcı yetkinizle çalışır                 | En dar yetki: salt-okunur, tek klasör, ayrı veritabanı kullanıcısı    |
| Dünyayı değiştiren araç onaysız çağrılır                  | Tehlikeli araçları sunucuda yayımlamayın ya da istemcide onay zorunlu (havuz: yayımlamıyor) |
| Üçüncü taraf sunucunun araç açıklaması modele talimat sokar | Yalnız güvenilir kaynak; açıklamaları okuyun; sürümü sabitleyin       |
| Araç çıktısı (web sayfası, belge) dolaylı enjeksiyon taşır | Çıktı veridir; [LLM güvenliği](llm-guvenligi.md) katmanları          |
| HTTP sunucusu ağa açık kalır                              | Yalnız `127.0.0.1`; ağa açılacaksa kimlik doğrulama                   |
| Fazla araç, yanlış seçim                                  | Sunucu başına az araç; istemcide yalnız gereken sunucular             |

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Model aracı çağırıyor ama sonuç modele ulaşmıyor              | Sonuç iletisi çağrı kimliğiyle eşleşmiyor                | Her sonuç aynı `tool_call_id` ile; her çağrı yanıtlanır      |
| Bir sunucuda çalışan kod başka sunucuda argüman hatası veriyor | Argüman dizgi/nesne farkı                                | İkisini de kabul edin; sağlam JSON ayrıştırma                |
| stdio sunucusu bağlanınca hemen kopuyor                        | Sunucu standart çıktıya günlük basıyor                   | Günlükleri standart hataya yönlendirin                       |
| İstemci sunucuyu bulamıyor                                    | Göreli yol ya da yanlış Python ortamı                    | Mutlak yol; sanal ortamın Python'u                           |
| Araç hatası "Error executing tool" diye geliyor, ayrıntı yok  | Hata SDK'nın beklediği türle yükseltilmedi               | SDK'nın araç hatası türünü kullanın (havuz: K-13)            |
| Model araç açıklamasındaki bir cümleye göre tuhaf davranıyor  | Üçüncü taraf açıklaması talimat içeriyor                 | Sunucuyu çıkarın ya da açıklamaları gözden geçirin           |
| Protokol alanları belgedekiyle uyuşmuyor                      | Ezberden ya da eski sürüme göre yazıldı                  | Kurulu SDK'nın kaynağından/türlerinden doğrulayın            |

## Denetim listesi

- [ ] Her aracın adı eylem + nesne, açıklamasının ilk cümlesi ne zaman kullanılacağını söylüyor, parametreleri tipli.
- [ ] Argüman hem dizgi hem nesne olarak kabul ediliyor; bozuk JSON hata metnine dönüşüyor.
- [ ] Her çağrının sonucu aynı kimlikle dönüyor; hata da bir sonuç.
- [ ] Hata iletileri Türkçe ve düzeltme yolunu söylüyor.
- [ ] Araç sunucusu en dar yetkide; tehlikeli araç yayımlanmıyor ya da onay zorunlu.
- [ ] HTTP kipi yalnız yerel adreste ya da kimlik doğrulamalı.
- [ ] Üçüncü taraf sunucular güvenilir kaynaktan, sabit sürümde; araç açıklamaları okundu.
- [ ] Protokol/SDK ayrıntıları kurulu paketten doğrulandı ve sürümüyle kaydedildi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni aracı `yz/ornekler/kendi_aracim.py` kalıbında yaz ve `mcp_sunucusu_kur(ek_araclar=[...])` ile
  yayımla. MCP SDK çağrılarını ezberden yazma; `yz/yz/mcp/sunucu.py` dosyasındaki çalışan kullanımı kopyala.
  Dünyayı değiştiren aracı yayımlama."
- **Modelin tipik hatası:** eski SDK sürümünün sınıf/işlev adlarını yazmak; stdio sunucusunda `print` ile günlük
  basmak; argümanın yalnız bir biçimini (dizgi ya da nesne) kabul etmek; hatayı istisna olarak bırakıp döngüyü
  düşürmek; tehlikeli aracı onaysız yayımlamak.
- **Çıktıda denetleyin:** SDK içe aktarımları havuzdaki dosyayla aynı mı; `print(` var mı; araç açıklamaları net mi;
  `tests/test_mcp.py` benzeri bir bağlanma testi var mı.

## İlgili

- [Ajanlar ve araçlar](ajanlar-ve-araclar.md) · [LLM güvenliği](llm-guvenligi.md) · [Yapılı çıktı](yapili-cikti.md) ·
  [Kodlama için LLM](kodlama-icin-llm.md)
- Üçüncü taraf sunucu bir bağımlılıktır: [Tedarik zinciri](../50-guvenlik/tedarik-zinciri.md); adres getiren araçlar:
  [SSRF ve dış istekler](../50-guvenlik/ssrf-ve-dis-istekler.md)
- Havuz: [MCP.md](../../yz/docs/MCP.md), [`sunucu.py`](../../yz/yz/mcp/sunucu.py), [`kopru.py`](../../yz/yz/mcp/kopru.py),
  [`test_mcp.py`](../../yz/tests/test_mcp.py), [`tanim.py`](../../yz/yz/arac/tanim.py),
  [`kendi_aracim.py`](../../yz/ornekler/kendi_aracim.py)
