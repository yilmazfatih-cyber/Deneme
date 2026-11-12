"""İçe aktarılabilir n8n iş akışı: Her sabah → radarı HTTP ile çalıştır → bildirim gerekli mi? → Telegram.

Düğüm türleri, sürümleri ve parametre adları n8n-io/n8n @ 5ee06d3'te doğrulandı (packages/nodes-base/):
- nodes/Schedule/ScheduleTrigger.node.ts: scheduleTrigger, sürüm 1.2; rule.interval[].field + triggerAtHour
- nodes/HttpRequest/HttpRequest.node.ts + V3/Description.ts: httpRequest, sürüm 4.2; method, url,
  authentication="genericCredentialType", genericAuthType="httpHeaderAuth", options.timeout (ms; varsayılan 10000)
- nodes/If/V2/IfV2.node.ts + test/v2/IfV2.boolean.json: if, sürüm 2.2; boolean "true" operatörü, filtre sürümü 2
- nodes/Telegram/Telegram.node.ts + GenericFunctions.ts: telegram, sürüm 1.2; resource, operation, chatId, text,
  additionalFields.appendAttribution ve parse_mode. parse_mode boş bırakılırsa düğüm "Markdown" (eski) kullanır;
  radarın metnindeki "_" ya da "[" iletiyi bozmasın diye "HTML" seçilir ve HTML kaçışlı `telegram_html` gönderilir.
İş akışı JSON'unun kabuğu (name, nodes, connections, settings) aynı test dosyalarındaki biçimdir. settings.timezone
verilmezse zamanlama n8n'in GENERIC_TIMEZONE ayarına düşer; varsayılanı "America/New_York"tur
(packages/@n8n/config/src/configs/generic.config.ts; packages/workflow/src/workflow.ts → settings.timezone önceliklidir).
Kimlik bilgileri (Header Auth, Telegram API) içe aktarmadan sonra n8n arayüzünde seçilir; dosyada sır tutulmaz.
"""

import uuid

VARSAYILAN_ZAMAN_ASIMI_MS = 15 * 60 * 1000  # radarın varsayılan süre bütçesi (10 dk) + son sayfa için pay


def _kimlik(ad: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"fiyat-radar/{ad}"))  # her üretimde aynı kimlik


def is_akisi(
    radar_url: str = "http://127.0.0.1:8765/calistir",
    chat_id: str = "TELEGRAM_SOHBET_KIMLIGI",
    saat: int = 8,
    saat_dilimi: str = "Europe/Istanbul",
    zaman_asimi_ms: int = VARSAYILAN_ZAMAN_ASIMI_MS,
) -> dict:
    if not isinstance(saat, int) or not 0 <= saat <= 23:
        raise ValueError("saat 0 ile 23 arasında olmalı")
    tetik, istek, kosul, telegram = "Her sabah", "Radarı çalıştır", "Bildirim gerekli mi?", "Telegram'a gönder"

    def dugum(ad, tur, surum, x, y, parametreler):
        return {"parameters": parametreler, "id": _kimlik(ad), "name": ad, "type": f"n8n-nodes-base.{tur}", "typeVersion": surum, "position": [x, y]}

    kosullar = {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
        "conditions": [
            {
                "id": _kimlik("bildirim-kosulu"),
                "leftValue": "={{ $json.bildirim_gerekli }}",
                "rightValue": "",
                "operator": {"type": "boolean", "operation": "true", "singleValue": True},
            }
        ],
        "combinator": "and",
    }
    dugumler = [
        dugum(tetik, "scheduleTrigger", 1.2, 0, 0, {"rule": {"interval": [{"field": "days", "triggerAtHour": saat}]}}),
        dugum(
            istek,
            "httpRequest",
            4.2,
            220,
            0,
            {
                "method": "POST",
                "url": radar_url,
                "authentication": "genericCredentialType",
                "genericAuthType": "httpHeaderAuth",
                "options": {"timeout": zaman_asimi_ms},
            },
        ),
        dugum(kosul, "if", 2.2, 440, 0, {"conditions": kosullar, "options": {}}),
        dugum(
            telegram,
            "telegram",
            1.2,
            660,
            -100,
            {
                "resource": "message",
                "operation": "sendMessage",
                "chatId": chat_id,
                "text": "={{ $json.telegram_html }}",
                "additionalFields": {"appendAttribution": False, "parse_mode": "HTML"},
            },
        ),
    ]
    baglantilar = {
        tetik: {"main": [[{"node": istek, "type": "main", "index": 0}]]},
        istek: {"main": [[{"node": kosul, "type": "main", "index": 0}]]},
        kosul: {"main": [[{"node": telegram, "type": "main", "index": 0}], []]},  # 2. çıkış: bildirim yok
    }
    return {
        "name": "Fiyat radarı — günlük özet",
        "nodes": dugumler,
        "connections": baglantilar,
        "active": False,
        "settings": {"executionOrder": "v1", "timezone": saat_dilimi},
        "pinData": {},
    }
