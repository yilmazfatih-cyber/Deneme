"""Araştırma ajanı: Claude ile şirket araştırır, değerler ve olasılıklı bir tez üretir.

Yavaş katmandır (günde/haftada bir). Dakikalık işlem kararlarını VERMEZ; yalnızca hangi hisselerin
işlem yapılabilir olduğunu ve ne kadar emin olunduğunu söyler. Zamanlamayı kurallı katman yapar.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any

import anthropic
import pandas as pd
from pydantic import ValidationError

from ..ayarlar import AjanAyarlari, Piyasa
from ..tahmin.gunluk import tahmin_ekle
from ..veri.zaman_kilidi import ZamanKilitliVeri
from .araclar import AracKutusu
from .sema import TEZ_SEMASI, TezCiktisi

SISTEM = """Sen deneyimli, temkinli bir hisse senedi analistisin. Görevin tek bir şirketi araştırıp
değerlemek ve ölçülebilir, olasılıklı bir tez yazmak. Yazdığın her tez kaydedilir, vadesi gelince
gerçekleşen fiyatla puanlanır (Brier skoru). Abartılı güven cezalandırılır.

Çalışma biçimin:
1. Önce fiyat_ozeti ve gosterge_ozeti ile hissenin ve piyasanın durumunu gör.
2. Canlı moddaysan temel_veriler ve web aramasıyla şirketin işini, son bilançosunu, KAP/SEC
   bildirimlerini, sektörünü ve haberleri incele. Kaynaklarını kaynaklar alanına yaz.
3. Değerleme yap: sektör çarpanlarıyla kıyas (F/K, PD/DD, FD/FAVÖK) ve kabaca bir indirgenmiş
   nakit akışı aralığı. Tek bir hedef fiyat değil, bir adil değer ARALIĞI ver. Veri yetmiyorsa
   aralığı null bırak ve nedenini gerekçede yaz.
4. gecmis_tahminlerim ile kendi karneni gör. Geçmişte aşırı emin çıktıysan olasılıklarını
   0,5'e doğru çek.
5. Tezini yaz.

Olasılık kuralları:
* olasilik = "hisse ufuk_gun içinde en az esik_getiri getiri sağlar" önermesinin olasılığıdır.
* Temel oran: rastgele bir hissenin 3 ayda pozitif getiri sağlama olasılığı kabaca %50-55'tir.
  Güçlü, somut kanıt olmadan 0,65'in üstüne ya da 0,35'in altına çıkma. 0,80'in üstü neredeyse
  hiçbir zaman haklı değildir.
* Kısa vadeli fiyat hareketini bildiğini sanma. Emin değilsen karar IZLE, olasılık 0,5'e yakın.
* Karar ile olasılık tutarlı olmalı: AL için olasılık > 0,55 ve esik_getiri >= 0; SAT için olasılık
  < 0,45 (yani getirinin eşiğin altında kalması beklenir).

Zaman kuralı (çok önemli): Sana bir karar anı verilir. O andan SONRA olan hiçbir şeyi kullanma.
Eğitim bilgin o tarihten sonraki olayları içeriyorsa bile yok say; araçların sana gösterdiği
dünya o andaki dünyadır. Bu bir tahmin sınavıdır, geriye bakış sınavı değil.

Bu bir yatırım tavsiyesi değil, kişisel araştırma notudur. Yanıtın Türkçe olsun."""


class AjanHatasi(RuntimeError):
    pass


@dataclass
class ArastirmaSonucu:
    tez: TezCiktisi
    giris_fiyati: float | None
    tur_sayisi: int
    girdi_token: int = 0
    cikti_token: int = 0
    araclar: list[str] = field(default_factory=list)


class ArastirmaAjani:
    def __init__(
        self,
        ayar: AjanAyarlari,
        piyasa: Piyasa,
        veri: ZamanKilitliVeri,
        db: sqlite3.Connection,
        istemci: Any | None = None,
    ) -> None:
        self.ayar = ayar
        self.piyasa = piyasa
        self.veri = veri
        self.db = db
        self.istemci = istemci if istemci is not None else anthropic.Anthropic()
        self.kutu = AracKutusu(veri, piyasa, db)

    def _araclar(self) -> list[dict[str, Any]]:
        araclar: list[dict[str, Any]] = list(self.kutu.tanimlar())
        # Web araması yalnız canlı modda: geçmiş bir tarihte arama yapmak geleceği sızdırır.
        if self.veri.canli and self.ayar.web_arama:
            araclar.append({"type": "web_search_20260209", "name": "web_search", "max_uses": 6})
        return araclar

    def arastir(self, hisse: str) -> ArastirmaSonucu:
        hisse = hisse.strip().upper()
        mod = "CANLI (web araması ve güncel temel veriler açık)" if self.veri.canli else (
            "ZAMAN KİLİTLİ (yalnız karar anına kadarki fiyat verisi; web ve temel veri kapalı)"
        )
        mesajlar: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": (
                    f"Karar anı: {self.veri.an.isoformat()}\n"
                    f"Piyasa: {self.piyasa.kod.upper()} ({self.piyasa.para_birimi}), gösterge {self.piyasa.gosterge}\n"
                    f"Mod: {mod}\n"
                    f"Hisse: {hisse}\n\n"
                    "Bu hisseyi araştır, değerle ve tezini yaz."
                ),
            }
        ]
        araclar = self._araclar()
        girdi = cikti = 0
        kullanilan: list[str] = []

        for tur in range(1, self.ayar.max_tur + 1):
            yanit = self.istemci.beta.messages.create(
                model=self.ayar.model,
                max_tokens=16000,
                system=[{"type": "text", "text": SISTEM, "cache_control": {"type": "ephemeral"}}],
                thinking={"type": "adaptive"},
                output_config={
                    "effort": self.ayar.efor,
                    "format": {"type": "json_schema", "schema": TEZ_SEMASI},
                },
                tools=araclar,
                messages=mesajlar,
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
            if getattr(yanit, "usage", None) is not None:
                girdi += getattr(yanit.usage, "input_tokens", 0) or 0
                cikti += getattr(yanit.usage, "output_tokens", 0) or 0

            durum = yanit.stop_reason
            if durum == "refusal":
                detay = getattr(yanit, "stop_details", None)
                raise AjanHatasi(f"Model isteği reddetti: {getattr(detay, 'explanation', '')}")
            if durum == "max_tokens":
                raise AjanHatasi("Yanıt token sınırında kesildi")

            # Düşünce blokları dahil tüm içerik olduğu gibi geri gönderilir.
            mesajlar.append({"role": "assistant", "content": yanit.content})

            if durum == "pause_turn":
                continue
            if durum == "tool_use":
                sonuclar = []
                for blok in yanit.content:
                    if getattr(blok, "type", None) != "tool_use":
                        continue
                    kullanilan.append(blok.name)
                    girdi_sozluk = blok.input if isinstance(blok.input, dict) else {}
                    metin, hata = self.kutu.calistir(blok.name, girdi_sozluk)
                    sonuc: dict[str, Any] = {"type": "tool_result", "tool_use_id": blok.id, "content": metin}
                    if hata:
                        sonuc["is_error"] = True
                    sonuclar.append(sonuc)
                if sonuclar:
                    mesajlar.append({"role": "user", "content": sonuclar})
                    continue

            metin = "".join(getattr(b, "text", "") for b in yanit.content if getattr(b, "type", None) == "text")
            if not metin.strip():
                if tur < self.ayar.max_tur:
                    mesajlar.append({"role": "user", "content": "Lütfen tezini istenen JSON biçiminde yaz."})
                    continue
                raise AjanHatasi("Model tez yazmadı")
            try:
                tez = TezCiktisi.model_validate(json.loads(metin))
            except (json.JSONDecodeError, ValidationError) as h:
                raise AjanHatasi(f"Tez çıktısı geçersiz: {h}") from h
            if tez.hisse != hisse:
                tez = tez.model_copy(update={"hisse": hisse})
            return ArastirmaSonucu(
                tez=tez,
                giris_fiyati=self.veri.son_fiyat(self.piyasa.sembol(hisse)),
                tur_sayisi=tur,
                girdi_token=girdi,
                cikti_token=cikti,
                araclar=kullanilan,
            )
        raise AjanHatasi(f"{self.ayar.max_tur} turda tez çıkmadı")


def tez_kaydet(
    db: sqlite3.Connection,
    piyasa: Piyasa,
    sonuc: ArastirmaSonucu,
    veri: ZamanKilitliVeri,
    model: str,
) -> int:
    """Tezi ve ona bağlı tahmini kaydeder; tez kimliğini döndürür."""
    t = sonuc.tez
    imlec = db.execute(
        """INSERT INTO tezler (piyasa, hisse, an, karar, olasilik, ufuk_gun, esik_getiri, adil_alt,
           adil_ust, giris_fiyati, ozet, gerekce, riskler, kaynaklar, model, zaman_kilitli)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            piyasa.kod, t.hisse, veri.an.isoformat(), t.karar, t.olasilik, t.ufuk_gun, t.esik_getiri,
            t.adil_deger_alt, t.adil_deger_ust, sonuc.giris_fiyati, t.ozet, t.gerekce,
            json.dumps(t.riskler, ensure_ascii=False), json.dumps(t.kaynaklar, ensure_ascii=False),
            model, int(not veri.canli),
        ),  # fmt: skip
    )
    tez_id = int(imlec.lastrowid or 0)
    db.commit()
    if sonuc.giris_fiyati:
        tahmin_ekle(
            db, tez_id, piyasa.kod, t.hisse, veri.an.to_pydatetime(), t.ufuk_gun,
            sonuc.giris_fiyati, t.esik_getiri, t.olasilik,
        )  # fmt: skip
    return tez_id


def gecerli_tezler(db: sqlite3.Connection, piyasa: str, an_iso: str) -> dict[str, sqlite3.Row]:
    """Her hisse için karar anından önceki en son ve ufku dolmamış tez."""
    satirlar = db.execute(
        """SELECT * FROM tezler t WHERE piyasa = ? AND an <= ? AND id = (
               SELECT id FROM tezler WHERE piyasa = t.piyasa AND hisse = t.hisse AND an <= ?
               ORDER BY an DESC, id DESC LIMIT 1)""",
        (piyasa, an_iso, an_iso),
    ).fetchall()
    sonuc = {}
    for r in satirlar:
        if pd.Timestamp(r["an"]) + pd.Timedelta(days=r["ufuk_gun"]) >= pd.Timestamp(an_iso):
            sonuc[r["hisse"]] = r
    return sonuc
