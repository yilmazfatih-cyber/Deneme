"""Telegram'a doğrudan gönderim: n8n kullanmayan kurulumlar (ör. cron ile çalışan barındırılan paketler) için yedek yol.

İstek, n8n'in Telegram düğümünün yaptığıyla aynıdır (n8n-io/n8n @ 5ee06d3, packages/nodes-base/credentials/
TelegramApi.credentials.ts → `{baseUrl}/bot{accessToken}`, varsayılan baseUrl https://api.telegram.org;
nodes/Telegram/Telegram.node.ts → sendMessage gövdesinde chat_id ve text). Fark: parse_mode gönderilmez, ileti düz
metindir (Bot API'de parse_mode isteğe bağlıdır; doğrulanmadı). Bot belirteci yalnızca ortam değişkeninden okunur ve
hiçbir hata iletisine, günlüğe ya da rapora yazılmaz.
"""

import json
import urllib.error
import urllib.request

TELEGRAM_API = "https://api.telegram.org"


class BildirimHatasi(Exception):
    pass


def _gizle(metin: str, belirtec: str) -> str:
    return metin.replace(belirtec, "***") if belirtec else metin


def telegram_gonder(metin: str, sohbet_kimligi, belirtec: str, api_url: str = TELEGRAM_API, zaman_asimi: float = 20) -> None:
    if not belirtec:
        raise BildirimHatasi("Telegram bot belirteci yok (TELEGRAM_BOT_TOKEN ortam değişkeni)")
    if sohbet_kimligi in (None, ""):
        raise BildirimHatasi('ayar.json\'da "telegram": {"sohbet_kimligi": ...} yok')
    govde = json.dumps({"chat_id": sohbet_kimligi, "text": metin, "disable_web_page_preview": True}).encode("utf-8")
    istek = urllib.request.Request(
        f"{api_url.rstrip('/')}/bot{belirtec}/sendMessage", data=govde, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(istek, timeout=zaman_asimi) as yanit:
            ham = yanit.read(1_000_000)
    except urllib.error.HTTPError as hata:  # Telegram hata ayrıntısını JSON gövdede verir
        with hata:
            ham = hata.read(100_000)
    except OSError as hata:
        raise BildirimHatasi(_gizle(f"Telegram'a ulaşılamadı: {hata}", belirtec)) from None
    try:
        sonuc = json.loads(ham)
    except ValueError:
        sonuc = {}
    if not isinstance(sonuc, dict) or not sonuc.get("ok"):
        neden = sonuc.get("description", "bilinmeyen yanıt") if isinstance(sonuc, dict) else "bilinmeyen yanıt"
        raise BildirimHatasi(_gizle(f"Telegram iletiyi reddetti: {str(neden)[:200]}", belirtec))
