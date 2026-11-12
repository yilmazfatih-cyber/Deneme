"""Gerçek HTTP katmanı: yerel sahte sunucuya karşı kimlik, parametre, sayfalama, gzip ve hata eşleme.

Yanıt gövdeleri Mixpanel/Hotjar belgelerindeki örnek biçimlerdedir (docs/API-NOTLARI.md).
"""

import base64
import contextlib
import gzip
import io
import json
import os
import tempfile
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import hj as hj_cli
import mp as mp_cli
from analitik import ayarlar as A
from analitik.hotjar import Hotjar
from analitik.istemci import ApiHatasi, GercekTasima
from analitik.mixpanel import Mixpanel

SEGMENTASYON = {
    "data": {
        "series": ["2026-11-02", "2026-11-01"],
        "values": {"Android": {"2026-11-01": 120, "2026-11-02": 80}, "iOS": {"2026-11-01": 100, "2026-11-02": 104}},
    },
    "legend_size": 2,
}
HUNI = {
    "meta": {"dates": ["2026-11-01"]},
    "data": {
        "2026-11-01": {
            "steps": [
                {
                    "count": 1000,
                    "avg_time": None,
                    "avg_time_from_start": None,
                    "step_conv_ratio": 1,
                    "goal": "A",
                    "overall_conv_ratio": 1,
                    "event": "A",
                },
                {
                    "count": 400,
                    "avg_time": 133,
                    "avg_time_from_start": 133,
                    "step_conv_ratio": 0.4,
                    "goal": "B",
                    "step_label": "B",
                    "overall_conv_ratio": 0.4,
                    "event": "B",
                },
            ],
            "analysis": {"completion": 400, "starting_amount": 1000, "steps": 2, "worst": 1},
        }
    },
}
TUTUNMA = {"2026-10-01": {"counts": [9, 7, 6], "first": 10}, "2026-10-02": {"counts": [9, 6], "first": 10}}
KAYITLI = {
    "computed_at": "2026-11-09T06:00:00+00:00",
    "date_range": {"from_date": "2026-10-01T00:00:00+03:00", "to_date": "2026-10-14T23:59:59.999000+03:00"},
    "headers": ["$event"],
    "series": {"Logged in": {"2026-10-01T00:00:00+03:00": 9852, "2026-10-08T00:00:00+03:00": 4325}},
}


class Sahte(BaseHTTPRequestHandler):
    istekler = []
    yanitlar = {}

    def _yanitla(self, yontem):
        parca = urllib.parse.urlsplit(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(parca.query).items()}
        uzunluk = int(self.headers.get("Content-Length") or 0)
        govde = self.rfile.read(uzunluk) if uzunluk else b""
        Sahte.istekler.append(
            {"yontem": yontem, "yol": parca.path, "q": q, "basliklar": dict(self.headers), "govde": govde}
        )
        kod, veri, basliklar = Sahte.yanitlar.get(parca.path, (404, b'{"error": "yok"}', {}))
        if callable(veri):
            kod, veri, basliklar = veri(q)
        self.send_response(kod)
        for k, v in basliklar.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(veri)))
        self.end_headers()
        self.wfile.write(veri)

    def do_GET(self):
        self._yanitla("GET")

    def do_POST(self):
        self._yanitla("POST")

    def log_message(self, *a):
        pass


def _json(veri, kod=200):
    return (kod, json.dumps(veri).encode(), {"Content-Type": "application/json"})


class ApiTesti(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Sahte)
        threading.Thread(target=cls.sunucu.serve_forever, daemon=True).start()
        cls.taban = f"http://127.0.0.1:{cls.sunucu.server_address[1]}"
        cls.eski_ortam = dict(os.environ)
        cls.gecici = tempfile.TemporaryDirectory()
        yerel = Path(cls.gecici.name) / "yerel"
        yerel.mkdir()
        (yerel / "ayarlar.json").write_text(
            json.dumps(
                {
                    "mixpanel": {"kaynak": "api", "bolge": "eu", "proje_id": 12345},
                    "hotjar": {"kaynak": "api", "site_id": 99},
                    "boyutlar": ["$os"],
                }
            ),
            encoding="utf-8",
        )
        (yerel / ".env").write_text(
            "MIXPANEL_SA_USER=sa.kullanici\nMIXPANEL_SA_SECRET='gizli 123'  \n"
            "HOTJAR_CLIENT_ID=hj-id\nHOTJAR_CLIENT_SECRET=hj-sir # yorum\n",
            encoding="utf-8",
        )
        os.environ.update(
            {
                "ANALITIK_YEREL": str(yerel),
                "ANALITIK_BUGUN": "2026-11-09",
                "MIXPANEL_QUERY_BASE": cls.taban + "/api/query",
                "MIXPANEL_EXPORT_BASE": cls.taban + "/api/2.0/export",
                "MIXPANEL_APP_BASE": cls.taban + "/api/app",
                "HOTJAR_API_BASE": cls.taban,
                "NO_PROXY": "127.0.0.1,localhost",
                "no_proxy": "127.0.0.1,localhost",
            }
        )
        for anahtar in ("MIXPANEL_SA_USER", "MIXPANEL_SA_SECRET", "MIXPANEL_API_SECRET", "ANALITIK_DEMO"):
            os.environ.pop(anahtar, None)

    @classmethod
    def tearDownClass(cls):
        cls.sunucu.shutdown()
        os.environ.clear()
        os.environ.update(cls.eski_ortam)
        cls.gecici.cleanup()

    def setUp(self):
        Sahte.istekler = []
        Sahte.yanitlar = {}

    def _calistir(self, modul, argv):
        cikti = io.StringIO()
        with contextlib.redirect_stdout(cikti):
            kod = modul.main(argv)
        return kod, cikti.getvalue()

    def test_bolge_adresleri(self):
        os.environ.pop("MIXPANEL_QUERY_BASE")
        try:
            mp = Mixpanel(A.yukle())
            self.assertEqual(mp.sorgu_taban, "https://eu.mixpanel.com/api/query")
            self.assertEqual(mp.disa_aktar_taban, self.taban + "/api/2.0/export")
        finally:
            os.environ["MIXPANEL_QUERY_BASE"] = self.taban + "/api/query"

    def test_kimlik_ve_parametreler(self):
        Sahte.yanitlar["/api/query/events/properties"] = _json(SEGMENTASYON)
        kod, cikti = self._calistir(
            mp_cli, ["kirilim", "Purchase", "--on", "$os", "--aralik", "2026-11-02:2026-11-02", "--taze"]
        )
        self.assertEqual(kod, 0, cikti)
        istek = Sahte.istekler[0]
        beklenen = "Basic " + base64.b64encode(b"sa.kullanici:gizli 123").decode()
        self.assertEqual(istek["basliklar"]["Authorization"], beklenen)
        self.assertEqual(istek["q"]["project_id"], "12345")
        self.assertEqual(istek["q"]["event"], "Purchase")
        self.assertEqual(istek["q"]["name"], "$os")
        self.assertEqual((istek["q"]["from_date"], istek["q"]["to_date"]), ("2026-11-01", "2026-11-02"))
        self.assertIn("| Android |  80 |", cikti)
        self.assertNotIn("gizli", cikti)

    def test_filtre_segmentation_kullanir(self):
        Sahte.yanitlar["/api/query/segmentation"] = _json(SEGMENTASYON)
        kod, _ = self._calistir(
            mp_cli,
            [
                "kirilim",
                "Purchase",
                "--on",
                "$os",
                "--filtre",
                "plan=pro",
                "--filtre",
                "surum~5.2",
                "--aralik",
                "7g",
                "--taze",
            ],
        )
        self.assertEqual(kod, 0)
        q = Sahte.istekler[0]["q"]
        self.assertEqual(q["on"], 'properties["$os"]')
        self.assertEqual(q["where"], 'properties["plan"] == "pro" and "5.2" in properties["surum"]')

    def test_huni_tutunma_kayitli(self):
        Sahte.yanitlar["/api/query/funnels"] = _json(HUNI)
        Sahte.yanitlar["/api/query/retention"] = _json(TUTUNMA)
        Sahte.yanitlar["/api/query/insights"] = _json(KAYITLI)
        kod, cikti = self._calistir(mp_cli, ["huni", "77", "--aralik", "2026-11-01:2026-11-07", "--taze"])
        self.assertEqual(kod, 0, cikti)
        self.assertEqual(Sahte.istekler[-1]["q"]["interval"], "7")
        self.assertIn("%40,0", cikti)
        kod, cikti = self._calistir(mp_cli, ["tutunma", "Sign Up", "App Open", "--sayi", "2", "--taze"])
        self.assertEqual(kod, 0, cikti)
        self.assertIn("ağırlıklı ort.", cikti)
        self.assertEqual(Sahte.istekler[-1]["q"]["born_event"], "Sign Up")
        kod, cikti = self._calistir(mp_cli, ["kayitli", "4242", "--taze"])
        self.assertEqual(kod, 0, cikti)
        self.assertIn("Logged in", cikti)
        self.assertIn("14.177", cikti)

    def test_disa_aktarim_gzip_ve_tekillestirme(self):
        import datetime as dt

        t0 = (dt.date(2026, 11, 2) - dt.date(1970, 1, 1)).days * 86400 - 3 * 3600 + 3600  # 01:00 (UTC+3)
        satirlar = [
            {"event": "A", "properties": {"time": t0, "distinct_id": "u1", "$insert_id": "x1", "$os": "iOS"}},
            {"event": "A", "properties": {"time": t0, "distinct_id": "u1", "$insert_id": "x1", "$os": "iOS"}},
            {"event": "B", "properties": {"time": t0 + 100, "distinct_id": "u1", "$insert_id": "x2"}},
            {
                "event": "A",
                "properties": {"time": (t0 + 300) * 1000, "distinct_id": "u2", "$insert_id": "x3", "$os": "Android"},
            },
        ]
        govde = gzip.compress("\n".join(json.dumps(s) for s in satirlar).encode())
        Sahte.yanitlar["/api/2.0/export"] = (200, govde, {"Content-Encoding": "gzip", "Content-Type": "text/plain"})
        kod, cikti = self._calistir(
            mp_cli, ["huni-yerel", "A", "B", "--aralik", "2026-11-02:2026-11-02", "--pencere", "1g", "--on", "$os"]
        )
        self.assertEqual(kod, 0, cikti)
        self.assertIn("3 olay indirildi", cikti)
        self.assertEqual(Sahte.istekler[0]["basliklar"].get("Accept-Encoding"), "gzip")
        self.assertEqual(json.loads(Sahte.istekler[0]["q"]["event"]), ["A", "B"])
        self.assertRegex(cikti, r"\|\s+1 \| A\s+\|\s+2 \|")

    def test_hata_mesajlari(self):
        Sahte.yanitlar["/api/query/events/names"] = _json({"error": "Invalid credentials"}, 401)
        kod, cikti = self._calistir(mp_cli, ["kontrol"])
        self.assertEqual(kod, 2)
        self.assertIn("401", cikti)
        Sahte.yanitlar["/api/query/events/names"] = _json({"error": "Unknown event"}, 400)
        kod, cikti = self._calistir(mp_cli, ["degerler", "X", "y", "--taze"])
        self.assertIn("HATA", cikti)
        Sahte.yanitlar["/api/query/events/properties/values"] = _json({"error": "bad where"}, 400)
        kod, cikti = self._calistir(mp_cli, ["degerler", "X", "y", "--taze"])
        self.assertIn("bad where", cikti)

    def test_429_yeniden_dener(self):
        sayac = {"n": 0}

        def yanit(q):
            sayac["n"] += 1
            if sayac["n"] < 3:
                return (429, b'{"error": "rate"}', {"Retry-After": "0"})
            return _json(["App Open"])

        Sahte.yanitlar["/api/query/events/names"] = (200, yanit, {})
        tasima = GercekTasima(deneme=3, bekleme=0.01)
        mp = Mixpanel(A.yukle(), tasima=tasima, taze=True)
        self.assertEqual(mp.olay_adlari(), ["App Open"])
        self.assertEqual(sayac["n"], 3)
        sayac["n"] = -10
        with self.assertRaises(ApiHatasi) as baglam:
            Mixpanel(A.yukle(), tasima=GercekTasima(deneme=2, bekleme=0.01), taze=True).olay_adlari()
        self.assertIn("limit", str(baglam.exception))

    def test_hotjar_jeton_ve_sayfalama(self):
        Sahte.yanitlar["/v1/oauth/token"] = _json({"access_token": "jt", "token_type": "Bearer", "expires_in": 3600})

        def sayfa(q):
            if q.get("cursor") == "c2":
                return _json(
                    {
                        "results": [
                            {
                                "id": "r3",
                                "created_time": "2026-10-01T10:00:00Z",
                                "answers": [{"question_id": "q1", "answer": "3"}],
                            }
                        ],
                        "next_cursor": None,
                    }
                )
            return _json(
                {
                    "results": [
                        {
                            "id": "r1",
                            "created_time": "2026-11-05T10:00:00Z",
                            "device": "mobile",
                            "answers": [
                                {"question_id": "q1", "answer": "9"},
                                {"question_id": "q2", "answer": "Ödeme hızlı"},
                                {"question_id": "q3", "answer": "Sepet"},
                                {"question_id": "q3", "answer": "Diğer", "comment": "Favoriler"},
                            ],
                            "user_attributes": [{"name": "plan", "value": "pro"}],
                        },
                        {
                            "id": "r2",
                            "created_time": "2026-11-04T10:00:00Z",
                            "answers": [{"question_id": "q1", "answer": "6"}],
                        },
                    ],
                    "next_cursor": "c2",
                }
            )

        Sahte.yanitlar["/v1/sites/99/surveys/s1/responses"] = (200, sayfa, {})
        Sahte.yanitlar["/v1/sites/99/surveys/s1"] = _json(
            {
                "id": "s1",
                "name": "NPS",
                "questions": [
                    {"id": "q1", "text": "Puan?", "type": "nps"},
                    {"id": "q2", "text": "Neden?", "type": "long-text"},
                    {"id": "q3", "text": "Bölüm?", "type": "multiple-option"},
                    {"id": "q9", "text": "Sağ ol", "type": "thank-you"},
                ],
            }
        )
        hj = Hotjar(A.yukle())
        self.assertEqual([y["id"] for y in hj.yanitlar("s1")], ["r1", "r2", "r3"])
        jeton_istegi = Sahte.istekler[0]
        self.assertEqual(jeton_istegi["yontem"], "POST")
        self.assertEqual(urllib.parse.parse_qs(jeton_istegi["govde"].decode())["grant_type"], ["client_credentials"])
        self.assertEqual(Sahte.istekler[1]["basliklar"]["Authorization"], "Bearer jt")
        self.assertEqual(Sahte.istekler[2]["q"]["cursor"], "c2")
        import datetime as dt

        self.assertEqual([y["id"] for y in Hotjar(A.yukle()).yanitlar("s1", dt.date(2026, 11, 5))], ["r1"])
        with tempfile.TemporaryDirectory() as d:
            hedef = Path(d) / "a.csv"
            kod, cikti = self._calistir(hj_cli, ["indir", "s1", "--dosya", str(hedef)])
            self.assertEqual(kod, 0, cikti)
            metin = hedef.read_text(encoding="utf-8")
        self.assertIn("Sepet | Diğer", metin)
        self.assertIn("Bölüm? (yorum)", metin)
        self.assertIn("nitelik:plan", metin)
        self.assertNotIn("Sağ ol", metin)

    def test_hotjar_403_aciklamasi(self):
        Sahte.yanitlar["/v1/oauth/token"] = _json({"access_token": "jt", "expires_in": 3600})
        Sahte.yanitlar["/v1/sites/99/surveys"] = _json({"code": "forbidden", "msg": "No access"}, 403)
        kod, cikti = self._calistir(hj_cli, ["anketler"])
        self.assertEqual(kod, 2)
        self.assertIn("Ask Scale", cikti)
        self.assertIn("CSV", cikti)


if __name__ == "__main__":
    unittest.main()
