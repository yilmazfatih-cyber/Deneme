"""Hotjar demo uç noktaları ve örnek anket (sentetik, Türkçe, şirket verisi değil).

Alan adları Hotjar API belgesindeki adlardır (survey, question, response, answers[question_id, answer, comment]).
Anketin web kullanıcılarından geldiğini unutmayın: Hotjar yalnız web'i görür; demo verisindeki Android 5.2.0
sorunu burada görünmez — /capraz analizinde bu "platform uyumu" kontrolünün örneğidir.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import random
from pathlib import Path
from typing import Any, Dict, List, Optional

from .demo import DEMO_BUGUN, SITE
from .istemci import HttpHatasi

NPS_ANKETI = "survey_7f3c2a10-demo-4b1e-9c55-nps000000001"
ODEME_ANKETI = "survey_1a2b3c4d-demo-4e5f-8a9b-odeme0000002"

ANKETLER = [
    {
        "id": NPS_ANKETI,
        "name": "NPS — genel memnuniyet",
        "type": "popover",
        "is_enabled": True,
        "created_time": "2026-08-01T09:00:00Z",
        "questions": [
            {
                "id": "q_nps",
                "text": "Bizi bir arkadaşınıza tavsiye etme olasılığınız nedir?",
                "type": "nps",
                "is_required": True,
                "choices": None,
                "labels": {"low_label": "Hiç", "high_label": "Kesinlikle"},
            },
            {
                "id": "q_neden",
                "text": "Bu puanı vermenizin ana nedeni nedir?",
                "type": "long-text",
                "is_required": False,
                "choices": None,
                "labels": None,
            },
            {
                "id": "q_bolum",
                "text": "En çok hangi bölümü kullanıyorsunuz?",
                "type": "multiple-option",
                "is_required": False,
                "labels": None,
                "choices": [
                    {"text": t, "allow_comment": t == "Diğer"}
                    for t in ("Arama", "Kampanyalar", "Sepet", "Sipariş takibi", "Diğer")
                ],
            },
            {
                "id": "q_son",
                "text": "Teşekkürler!",
                "type": "thank-you",
                "is_required": False,
                "choices": None,
                "labels": None,
            },
        ],
    },
    {
        "id": ODEME_ANKETI,
        "name": "Ödeme sayfası geri bildirimi",
        "type": "button",
        "is_enabled": True,
        "created_time": "2026-09-10T09:00:00Z",
        "questions": [
            {
                "id": "q_puan",
                "text": "Ödeme deneyiminizi puanlayın",
                "type": "rating-1-5",
                "is_required": True,
                "choices": None,
                "labels": {"low_label": "Çok kötü", "high_label": "Çok iyi"},
            },
            {
                "id": "q_sorun",
                "text": "Bir sorun yaşadınız mı? Anlatır mısınız?",
                "type": "long-text",
                "is_required": False,
                "choices": None,
                "labels": None,
            },
        ],
    },
]

KOTU = [
    "Ödeme sayfasında kart bilgisi kaydedilmiyor, her seferinde baştan girmek zorundayım",
    "3D secure ekranı açılmadı, ödeme yarıda kaldı",
    "Kargo çok geç geldi, takip numarası da güncellenmedi",
    "Sipariş takibi ekranı sürekli hata veriyor",
    "Fiyatlar diğer sitelere göre pahalı",
    "Site mobilde çok yavaş açılıyor, sayfa donuyor",
    "İade süreci çok uzun sürdü, müşteri hizmetlerine ulaşamadım",
    "Kampanya kodu sepette çalışmadı",
    "Giriş yaparken SMS doğrulama kodu gelmedi",
    "Ürün fotoğrafları gerçeği yansıtmıyor",
]
ORTA = [
    "Genel olarak iyi ama teslimat biraz yavaş",
    "Ürün çeşitliliği iyi, fiyatlar biraz yüksek",
    "Arama sonuçları bazen alakasız geliyor",
    "Fena değil, kampanyalar daha sık olabilir",
    "Uygulama iyi ama ödeme adımları fazla",
]
IYI = [
    "Çok hızlı teslimat, harika",
    "Kullanımı çok kolay, her şeyi hemen buluyorum",
    "Kampanyalar süper, sürekli alışveriş yapıyorum",
    "Müşteri hizmetleri çok ilgili",
    "Ürünler kaliteli ve paketleme özenli, memnunum",
    "Sepet ve ödeme çok pratik",
]
ODEME_YORUM = [
    "Kart numarasını girince sayfa dondu",
    "3D secure SMS'i gelmedi",
    "Taksit seçenekleri görünmedi",
    "Adres formu çok uzun",
    "Ödeme butonuna iki kez basmam gerekti",
    "Sorun yok, hızlıydı",
    "Kupon kodu alanını bulamadım",
]
SAYFALAR = ["/", "/urun", "/sepet", "/odeme", "/hesabim/siparisler"]


def _yanit_uret(rnd: random.Random, anket: Dict, sira: int, zaman: dt.datetime) -> Dict:
    cihaz = rnd.choices(["mobile", "desktop", "tablet"], weights=[58, 36, 6])[0]
    os_ = {
        "mobile": rnd.choice(["Android", "iOS"]),
        "tablet": "iPadOS",
        "desktop": rnd.choice(["Windows", "Mac OS X"]),
    }[cihaz]
    yanit: Dict[str, Any] = {
        "id": f"resp_{anket['id'][-4:]}_{sira:05d}",
        "created_time": zaman.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "is_complete": rnd.random() < 0.9,
        "device": cihaz,
        "browser": rnd.choice(["Chrome", "Safari", "Samsung Internet", "Firefox"]),
        "os": os_,
        "country": rnd.choices(["TR", "DE", "AZ", "NL"], weights=[80, 10, 6, 4])[0],
        "hotjar_user_id": f"hj{rnd.randint(10**7, 10**8 - 1)}",
        "recording_url": f"https://insights.hotjar.com/r?site=1234567&recording={rnd.randint(10**9, 10**10)}"
        if rnd.random() < 0.6
        else None,
        "response_origin_url": SITE + rnd.choice(SAYFALAR),
        "window_size": {"width": 390 if cihaz == "mobile" else 1440, "height": 844 if cihaz == "mobile" else 900},
        "user_attributes": [{"name": "plan", "value": "premium" if rnd.random() < 0.15 else "free"}],
        "tags": [],
        "answers": [],
    }
    if anket["id"] == NPS_ANKETI:
        puan = rnd.choices(range(11), weights=[3, 2, 2, 3, 3, 5, 7, 12, 18, 20, 25])[0]
        if cihaz == "mobile" and rnd.random() < 0.12:
            puan = max(0, puan - 4)
        yanit["answers"].append({"question_id": "q_nps", "answer": str(puan), "comment": None})
        if rnd.random() < 0.75:
            havuz = KOTU if puan <= 6 else ORTA if puan <= 8 else IYI
            yanit["answers"].append({"question_id": "q_neden", "answer": rnd.choice(havuz), "comment": None})
        for secenek in rnd.sample(["Arama", "Kampanyalar", "Sepet", "Sipariş takibi"], k=rnd.randint(1, 2)):
            yanit["answers"].append({"question_id": "q_bolum", "answer": secenek, "comment": None})
        if rnd.random() < 0.05:
            yanit["answers"].append({"question_id": "q_bolum", "answer": "Diğer", "comment": "Favoriler listesi"})
    else:
        yanit["response_origin_url"] = SITE + "/odeme"
        puan = rnd.choices([1, 2, 3, 4, 5], weights=[14, 12, 18, 26, 30])[0]
        yanit["answers"].append({"question_id": "q_puan", "answer": str(puan), "comment": None})
        if rnd.random() < 0.6:
            yorum = rnd.choice(ODEME_YORUM[:5] if puan <= 3 else ODEME_YORUM[4:])
            yanit["answers"].append({"question_id": "q_sorun", "answer": yorum, "comment": None})
    return yanit


_YANITLAR: Dict[str, List[Dict]] = {}


def yanitlar(anket_id: str) -> List[Dict]:
    """Anketin tüm yanıtları, en yeni önce (API sırası)."""
    if anket_id not in _YANITLAR:
        anket = next((a for a in ANKETLER if a["id"] == anket_id), None)
        if anket is None:
            return []
        rnd = random.Random(anket_id)
        adet = 640 if anket_id == NPS_ANKETI else 260
        bitis = dt.datetime.combine(DEMO_BUGUN, dt.time(6, 0))
        liste = []
        for i in range(adet):
            zaman = bitis - dt.timedelta(minutes=rnd.randint(30, 60 * 24 * 60))
            liste.append(_yanit_uret(rnd, anket, i + 1, zaman))
        liste.sort(key=lambda y: y["created_time"], reverse=True)
        _YANITLAR[anket_id] = liste
    return _YANITLAR[anket_id]


def yanitla(yontem: str, yol: str, q: Dict[str, str], govde: Optional[bytes]) -> Any:
    if yol == "/v1/oauth/token" and yontem == "POST":
        return {"access_token": "demo-jeton", "token_type": "Bearer", "expires_in": 3600}
    parcalar = yol.strip("/").split("/")
    if len(parcalar) >= 4 and parcalar[:2] == ["v1", "sites"] and parcalar[3] == "surveys":
        if len(parcalar) == 4:
            ozet = [
                {k: v for k, v in a.items() if k != "questions" or q.get("with_questions") == "true"} for a in ANKETLER
            ]
            return {"results": ozet, "next_cursor": None}
        anket = next((a for a in ANKETLER if a["id"] == parcalar[4]), None)
        if anket is None:
            raise HttpHatasi(404, json.dumps({"code": "not_found", "msg": "Survey not found"}))
        if len(parcalar) == 5:
            return anket
        if len(parcalar) == 6 and parcalar[5] == "responses":
            hepsi = yanitlar(anket["id"])
            limit = min(100, int(q.get("limit") or 100))
            bas = int(q.get("cursor") or 0)
            dilim = hepsi[bas : bas + limit]
            sonraki = str(bas + limit) if bas + limit < len(hepsi) else None
            return {"results": dilim, "next_cursor": sonraki}
    raise HttpHatasi(404, json.dumps({"code": "not_found", "msg": f"demo: {yol}"}))


def anket_csv_yaz(yol: Path) -> Path:
    """NPS anketini `hj.py indir` çıktısıyla aynı biçimde CSV'ye yazar."""
    from .hotjar import duzlestir

    anket = ANKETLER[0]
    basliklar, satirlar = duzlestir(anket, yanitlar(anket["id"]))
    yol.parent.mkdir(parents=True, exist_ok=True)
    with yol.open("w", newline="", encoding="utf-8") as f:
        yazici = csv.writer(f)
        yazici.writerow(basliklar)
        yazici.writerows(satirlar)
    return yol
