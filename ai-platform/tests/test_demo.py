"""Demo ERP: kurulum (idempotent), evrak kuyruğu, cari/fatura/hazır sorgu uçları, mükerrer bulma, onay akışı, örnek belgeler, arayüz."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs" / "demo"
WEB = ROOT / "aiplatform" / "web"


@pytest.fixture()
def client(aip_data_dir, monkeypatch):
    from aiplatform import db
    from aiplatform.api.routers import approvals, demo, erp, run
    from aiplatform.erp import connector
    from aiplatform.installer import engine

    for k in ("AIP_ERP_DB_URL", "AIP_ERP_API_BASE_URL", "AIP_ERP_WEBHOOK_SECRET"):
        monkeypatch.delenv(k, raising=False)

    async def no_llm(base_url=None, timeout=2.0):
        return {"ok": False, "url": str(base_url), "error": "test: LLM yok"}

    monkeypatch.setattr(engine, "llm_health", no_llm)
    connector.reset_connectors()
    db.init_db()
    app = FastAPI()
    for r in (erp, approvals, run, demo):
        app.include_router(r.router)
    with TestClient(app) as c:
        yield c
    connector.reset_connectors()


@pytest.fixture()
def ready(client):
    r = client.post("/api/demo/setup")
    assert r.status_code == 200, r.text
    return client


def mark_installed(*module_ids: str) -> None:
    from aiplatform.db import session_scope
    from aiplatform.installer.models import InstalledModule

    with session_scope() as s:
        for m in module_ids:
            s.add(InstalledModule(module_id=m))


def manifest() -> dict:
    return json.loads((DOCS / "manifest.json").read_text(encoding="utf-8"))


# ----------------------------------------------------------------------------- kurulum


def test_kurulmadan_once_demo_not_ready(client):
    r = client.get("/api/demo/cari")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "demo_not_ready"
    assert client.get("/api/demo/durum").json()["ready"] is False


def test_setup_idempotent(client):
    a = client.post("/api/demo/setup").json()
    assert a["connection_id"] == "ornek-erp" and a["connection_created"] is True
    assert a["evrak_sayisi"] == 6 and a["eklenen_evrak"] == 6
    assert a["eklenen_benzer_cari"] == 2
    for m in (
        "fatura-cikarim",
        "dogal-dil-sql",
        "kayit-eslestirme",
        "finans-hesap",
        "ozetleme",
        "yazma-asistani",
        "kvkk-kalkani",
    ):
        assert a["modules"][m] == "not_installed"
    assert a["llm"]["ok"] is False
    assert a["sirket"]["unvan"] == "Örnek Şirket A.Ş."

    b = client.post("/api/demo/setup").json()
    assert b["connection_created"] is False
    assert b["evrak_sayisi"] == 6 and b["eklenen_evrak"] == 0 and b["eklenen_benzer_cari"] == 0
    assert len(client.get("/api/demo/cari").json()["items"]) == 34  # 32 + 2 kasıtlı benzer kayıt
    assert client.get("/api/demo/durum").json()["ready"] is True


# ----------------------------------------------------------------------------- evrak


def test_evrak_listesi_ve_dosyalar(ready):
    items = ready.get("/api/demo/evrak").json()["items"]
    assert len(items) == 6
    assert [i["tur"] for i in items].count("fatura") == 4
    assert {i["tur"] for i in items} == {"fatura", "irsaliye", "sozlesme"}
    assert all(i["durum"] == "bekliyor" for i in items)
    assert sum(1 for i in items if i["goruntu"]) == 2

    r = ready.get("/api/demo/evrak/1/file")
    assert r.status_code == 200 and r.content[:5] == b"%PDF-"
    assert r.headers["content-type"] == "application/pdf"
    png = ready.get("/api/demo/evrak/1/file?goruntu=true")
    assert png.status_code == 200 and png.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert ready.get("/api/demo/evrak/2/file?goruntu=true").status_code == 404
    assert ready.get("/api/demo/evrak/99").json()["error"]["code"] == "not_found"


def test_evrak_oku_kurulu_degilken_409(ready):
    r = ready.post("/api/demo/evrak/1/oku", json={"kaynak": "pdf"})
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "not_installed"
    assert err["hint"] == "POST /api/modules/fatura-cikarim/install"
    assert "kurulu değil" in err["message"]
    assert ready.get("/api/demo/evrak/1").json()["cikarim"] is None


def test_evrak_oku_llm_yoksa_sunucu_hatasi(ready):
    mark_installed("fatura-cikarim")
    r = ready.post("/api/demo/evrak/1/oku", json={"kaynak": "pdf"})
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "not_ready"
    assert ready.get("/api/demo/evrak/1").json()["durum"] == "bekliyor"


def test_sozlesme_cikarim_yerine_ozet(ready):
    r = ready.post("/api/demo/evrak/6/oku", json={})
    assert r.status_code == 400 and r.json()["error"]["code"] == "unsupported_type"
    r = ready.post("/api/demo/evrak/6/ozetle")
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_installed"


# ----------------------------------------------------------------------------- cari, fatura, stok, hazır sorgular


def test_cari_arama_ve_detay(ready):
    r = ready.get("/api/demo/cari", params={"q": "müşteri 07"}).json()
    assert {c["unvan"] for c in r["items"]} == {"Müşteri 07 Ltd. Şti.", "MÜŞTERİ 07 LTD ŞTİ"}
    assert (
        ready.get("/api/demo/cari", params={"q": "MÜŞTERİ 07"}).json()["total"] == 2
    )  # Türkçe büyük/küçük harf
    assert ready.get("/api/demo/cari", params={"q": "İzmir"}).json()["total"] >= 1
    assert "LIMIT" in r["sql"].upper()
    d = ready.get("/api/demo/cari/7").json()
    assert d["cari"]["unvan"] == "Müşteri 07 Ltd. Şti."
    assert d["faturalar"] and len(d["aylik"]) <= 12
    assert ready.get("/api/demo/cari/999").status_code == 404


def test_fatura_stok_satis(ready):
    r = ready.get("/api/demo/fatura", params={"durum": "odenmemis"}).json()
    assert r["items"] and {f["durum"] for f in r["items"]} <= {"acik", "vadesi_gecti"}
    assert r["counts"]["odendi"] > 0
    assert ready.get("/api/demo/fatura", params={"durum": "x';DROP"}).json()["error"]["code"] == "bad_filter"
    assert len(ready.get("/api/demo/stok").json()["items"]) == 36
    assert len(ready.get("/api/demo/satis-aylik").json()["items"]) == 34


def test_hazir_sorgular(ready):
    lst = ready.get("/api/demo/hazir-sorgular").json()
    assert lst["etiket"] == "Hazır sorgu" and "yapay zekâ üretmez" in lst["not"]
    assert all(s["etiket"] == "Hazır sorgu" for s in lst["items"])
    for s in lst["items"]:
        r = ready.post(f"/api/demo/hazir-sorgular/{s['id']}/calistir")
        assert r.status_code == 200, (s["id"], r.text)
        assert r.json()["row_count"] > 0, s["id"]
    top = ready.post("/api/demo/hazir-sorgular/ciro-ilk10-2025/calistir").json()
    assert top["row_count"] == 10 and top["columns"][0] == "unvan"
    assert ready.post("/api/demo/hazir-sorgular/yok/calistir").status_code == 404


def test_mukerrer_bulma(ready):
    r = ready.post("/api/demo/cari/mukerrer", json={})
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_installed"
    mark_installed("kayit-eslestirme")
    r = ready.post("/api/demo/cari/mukerrer", json={"threshold": 95})
    assert r.status_code == 200, r.text
    res = r.json()["result"]
    assert res["engine"] == "rapidfuzz" and res["record_count"] == 34
    pairs = {(p["a"], p["b"]) for p in res["pairs"]}
    assert (7, 33) in pairs and (23, 34) in pairs
    assert len(pairs) == 2  # %95 eşikte "Müşteri 01" ↔ "Müşteri 02" gibi yanlış eşleşme yok
    p = next(p for p in res["pairs"] if p["a"] == 7)
    assert p["b_cari"]["unvan"] == "MÜŞTERİ 07 LTD ŞTİ" and p["score"] >= 95


# ----------------------------------------------------------------------------- onay akışı


def _doc1_form() -> tuple[dict, list[dict]]:
    d = manifest()["belgeler"][0]
    b = d["beklenen"]
    fields = {
        "belge_no": d["belge_no"],
        "tarih": "24.10.2026",
        "satici_unvan": d["tedarikci_unvan"],
        "satici_vkn": d["tedarikci_vkn"],
        "ara_toplam": b["ara_toplam"],
        "kdv_toplam": b["kdv_toplam"],
        "genel_toplam": b["genel_toplam"],
    }
    lines = [
        {k: ln[k] for k in ("aciklama", "miktar", "birim_fiyat", "kdv_orani", "tutar")}
        for ln in b["satirlar"]
    ]
    return fields, lines


def test_onay_akisi_erpye_yazar(ready):
    fields, lines = _doc1_form()
    r = ready.post("/api/demo/evrak/1/oner", json={"fields": fields, "lines": lines})
    assert r.status_code == 202, r.text
    body = r.json()
    aid = body["approval_id"]
    assert body["manuel"] is True
    assert body["args"]["cari_id"] == 21 and body["args"]["tarih"] == "2026-10-24"
    assert [k["urun_kodu"] for k in body["args"]["kalemler"]] == ["URN-0001", "URN-0005", "URN-0003"]

    # onaysız yazma yok
    assert ready.get("/api/demo/fatura", params={"durum": "onay_bekliyor"}).json()["items"] == []
    pending = ready.get("/api/approvals", params={"status": "pending"}).json()["items"]
    assert [a["id"] for a in pending] == [aid]
    assert pending[0]["module"] == "erp" and pending[0]["action"] == "fatura_oneri_olustur"
    assert pending[0]["payload"]["kaynak"]["dogrulama"]["ok"] is True
    ev = ready.get("/api/demo/evrak/1").json()
    assert ev["durum"] == "onerildi" and ev["approval"]["status"] == "pending"

    # aynı evrak ikinci kez önerilemez
    again = ready.post("/api/demo/evrak/1/oner", json={"fields": fields, "lines": lines})
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_proposed"

    d = ready.post(f"/api/approvals/{aid}/decide", json={"decision": "approve"}).json()
    assert d["status"] == "executed", d
    fid = d["result"]["result"]["fatura_id"]
    rows = ready.get("/api/demo/fatura", params={"durum": "onay_bekliyor"}).json()["items"]
    assert [f["id"] for f in rows] == [fid]
    assert rows[0]["unvan"] == "Tedarikçi 01 A.Ş." and rows[0]["toplam"] == pytest.approx(
        fields["genel_toplam"]
    )
    assert ready.get("/api/demo/evrak/1").json()["approval"]["status"] == "executed"


def test_oner_reddedilince_yazmaz(ready):
    fields, lines = _doc1_form()
    aid = ready.post("/api/demo/evrak/1/oner", json={"fields": fields, "lines": lines}).json()["approval_id"]
    assert (
        ready.post(f"/api/approvals/{aid}/decide", json={"decision": "reject"}).json()["status"] == "rejected"
    )
    assert ready.get("/api/demo/fatura", params={"durum": "onay_bekliyor"}).json()["items"] == []
    # ret sonrası yeniden önerilebilir
    assert ready.post("/api/demo/evrak/1/oner", json={"fields": fields, "lines": lines}).status_code == 202


def test_oner_eslesme_eksik_ve_bos(ready):
    r = ready.post("/api/demo/evrak/2/oner", json={})
    assert r.status_code == 400 and r.json()["error"]["code"] == "no_extraction"
    r = ready.post(
        "/api/demo/evrak/2/oner",
        json={
            "fields": {"satici_vkn": "1111111111", "satici_unvan": "Bilinmeyen Firma"},
            "lines": [{"aciklama": "Uzay gemisi", "miktar": 1}],
        },
    )
    assert r.status_code == 422
    body = r.json()
    assert body["error"]["code"] == "mapping_incomplete" and len(body["sorunlar"]) == 2
    assert (
        ready.post("/api/demo/evrak/5/oner", json={"fields": {"belge_no": "x"}}).status_code == 400
    )  # irsaliye


# ----------------------------------------------------------------------------- örnek belgeler


def test_ornek_belgeler_depoda():
    m = manifest()
    docs = m["belgeler"]
    assert len(docs) == 6
    assert [d["tur"] for d in docs].count("fatura") == 4
    total = 0
    for d in docs:
        for name in filter(None, [d["dosya_adi"], d["goruntu"]]):
            p = DOCS / name
            assert p.exists(), name
            total += p.stat().st_size
    assert total < 1_000_000
    assert sum(1 for d in docs if d["goruntu"]) == 2


def test_ornek_belgeler_erp_ile_eslesir_ve_dogrulama_uyarisi():
    from aiplatform.erp.demo_assets import load_erp_refs
    from aiplatform.erp.mock_erp import is_valid_vkn
    from aiplatform.modules.runtimes.fatura_cikarim import validate

    cari, _ = load_erp_refs()
    for d in manifest()["belgeler"]:
        c = cari[d["cari_id"]]
        assert (c["unvan"], c["vkn"]) == (d["tedarikci_unvan"], d["tedarikci_vkn"])
        assert is_valid_vkn(d["tedarikci_vkn"])
    faturalar = [d for d in manifest()["belgeler"] if d["tur"] == "fatura"]
    oranlar = {ln["kdv_orani"] for d in faturalar for ln in d["beklenen"]["satirlar"]}
    assert oranlar == {1, 10, 20}
    sonuc = {}
    for d in faturalar:
        b = d["beklenen"]
        fields = {k: b[k] for k in ("ara_toplam", "kdv_toplam", "genel_toplam")} | {
            "satici_vkn": d["tedarikci_vkn"]
        }
        sonuc[d["dosya_adi"]] = validate(fields, b["satirlar"])["ok"]
    assert sonuc == {
        "fatura_tedarikci01_2026-10.pdf": True,
        "fatura_tedarikci02_2026-10.pdf": True,
        "fatura_tedarikci03_2026-11.pdf": True,
        "fatura_tedarikci04_2026-11.pdf": False,  # kasıtlı toplam uyuşmazlığı
    }


def test_pdf_metin_katmani_turkce():
    pdfplumber = pytest.importorskip("pdfplumber")
    with pdfplumber.open(DOCS / "fatura_tedarikci02_2026-10.pdf") as pdf:
        text = pdf.pages[0].extract_text()
    assert "Tedarikçi 02 Ltd. Şti." in text and "Örnek Şirket A.Ş." in text and "URN-0011" in text
    with pdfplumber.open(DOCS / "sozlesme_tedarikci05.pdf") as pdf:
        assert len(pdf.pages) == 2


def test_belge_uretici_calisir(tmp_path):
    from aiplatform.erp import demo_assets

    try:
        demo_assets.find_font()
    except FileNotFoundError:
        pytest.skip("Türkçe TTF yazı tipi yok")
    pytest.importorskip("reportlab")
    m = demo_assets.generate(tmp_path)
    assert [d["dosya_adi"] for d in m["belgeler"]] == [d["dosya_adi"] for d in manifest()["belgeler"]]
    assert (tmp_path / "manifest.json").exists()
    assert (tmp_path / "fatura_tedarikci04_2026-11.pdf").read_bytes()[:5] == b"%PDF-"


# ----------------------------------------------------------------------------- arayüz


def test_arayuz_demo_baglantisi_ve_modulleri():
    from aiplatform import config, db
    from aiplatform.api.app import create_app

    config.reset_settings()
    db.reset_db()
    c = TestClient(create_app())
    page = c.get("/")
    assert page.status_code == 200 and 'href="#/demo"' in page.text and "Demo ERP" in page.text
    for p in [
        "demo.js",
        "demo/ortak.js",
        "demo/cari.js",
        "demo/evrak.js",
        "demo/fatura.js",
        "demo/raporlar.js",
        "demo/finans.js",
        "demo/onay.js",
        "demo/kvkk.js",
    ]:
        r = c.get(f"/js/pages/{p}")
        assert r.status_code == 200, p
        assert "javascript" in r.headers["content-type"]
    assert 'route("demo"' in (WEB / "js" / "app.js").read_text(encoding="utf-8")
    src = (WEB / "js" / "pages" / "demo.js").read_text(encoding="utf-8")
    assert "export async function render" in src
    rap = (WEB / "js" / "pages" / "demo" / "raporlar.js").read_text(encoding="utf-8")
    assert "Hazır sorgu" in rap  # hazır SQL AI gibi sunulmaz
