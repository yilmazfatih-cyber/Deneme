"""İsteğe bağlı kaynak kayması testi: ajankur'un kuralları, dayandığı depolardaki asıl metinlerle hâlâ aynı mı?

Depoların klonlandığı klasörü verin (her depo `<sahip>__<depo>` adlı alt klasörde):
    AJANKUR_KAYNAKLAR=~/kaynak python3 -m unittest discover -s tests -t .
Değişken yoksa ya da dosya klonda yoksa test atlanır. Klon dosyaları yalnız METİN olarak okunur;
hiçbir betik, kanca ya da kod çalıştırılmaz.
"""

import os
import re
import unittest
from pathlib import Path

from ajankur.denetle import AD_KALIBI, GIZLI_UNICODE, IZINLI_ANAHTARLAR, denetle
from ajankur.uret import IZIN_YASAKLARI

KAYNAK = os.environ.get("AJANKUR_KAYNAKLAR")


@unittest.skipUnless(KAYNAK, "AJANKUR_KAYNAKLAR tanımlı değil: kaynak kayması testi atlandı")
class KaynakKaymasiTesti(unittest.TestCase):
    def oku(self, depo, yol):
        dosya = Path(KAYNAK).expanduser() / depo / yol
        if not dosya.is_file():
            self.skipTest(f"klonda yok: {depo}/{yol}")
        return dosya.read_text(encoding="utf-8", errors="replace")

    def test_anthropic_dogrulayicisi(self):
        metin = self.oku("anthropics__skills", "skills/skill-creator/scripts/quick_validate.py")
        izinli = re.search(r"ALLOWED_PROPERTIES = \{([^}]*)\}", metin).group(1)
        self.assertEqual({x.strip(" '\"") for x in izinli.split(",")}, IZINLI_ANAHTARLAR)
        for sinir in ("len(name) > 64", "len(description) > 1024", "len(compatibility) > 500", "'<' in description"):
            self.assertIn(sinir, metin)

    def test_opencode_beceri_ve_izin_belgeleri(self):
        beceri = self.oku("anomalyco__opencode", "packages/web/src/content/docs/skills.mdx")
        self.assertIn(AD_KALIBI.pattern, beceri)
        self.assertIn("Match the directory name", beceri)
        izin = self.oku("anomalyco__opencode", "packages/web/src/content/docs/permissions.mdx")
        self.assertIn("last matching rule winning", izin)
        self.assertIn('"*.env.example": "allow"', izin)
        self.assertIn("Explicit `\"deny\"` rules are still enforced", izin)  # --auto kipinde yalnız deny kalır

    def test_kanca_protokolu_ve_cikis_kodlari(self):
        ecc = self.oku("affaan-m__ECC", "hooks/README.md")
        self.assertIn("Block the tool call (PreToolUse only)", ecc)
        self.assertIn("logged but does not block", ecc)  # kanca çökerse araç engellenmez
        matt = self.oku("mattpocock__skills", "skills/misc/git-guardrails-claude-code/SKILL.md")
        self.assertIn('"PreToolUse"', matt)
        self.assertIn("exit with code 2", matt)

    def test_izin_yasagi_bicimi_klonlardaki_orneklerle_ayni(self):
        rehber = self.oku("affaan-m__ECC", "the-security-guide.md")
        for kural in IZIN_YASAKLARI[1:]:  # Read(...) desenleri ECC rehberinde birebir geçer
            self.assertIn(f'"{kural}"', rehber)
        react = self.oku("react__react", ".claude/settings.json")
        self.assertIn('"Bash(npm:*)"', react)  # Bash(<önek>:*) biçimi react/react'in deny listesinde

    def test_aciklama_politikasi(self):
        metin = re.sub(r"\s+", " ", self.oku("obra__superpowers", "skills/writing-skills/SKILL.md"))
        self.assertIn("It never summarizes the skill's workflow", metin)

    def test_hermes_gorunmez_karakter_listesi_kapsaniyor(self):
        metin = self.oku("NousResearch__hermes-agent", "tools/skills_guard.py")
        blok = metin[metin.index("_INVISIBLE_CHAR_NAMES = {"):metin.index("INVISIBLE_CHARS = set(")]
        karakterler = [chr(int(k, 16)) for k in re.findall(r"'\\u([0-9a-fA-F]{4})'", blok)]
        self.assertGreater(len(karakterler), 10)
        for karakter in karakterler:
            self.assertRegex(karakter, GIZLI_UNICODE, f"U+{ord(karakter):04X}")

    def test_gercek_becerilerde_bilinen_bulgu(self):
        if not (Path(KAYNAK).expanduser() / "anthropics__skills" / "skills").is_dir():
            self.skipTest("anthropics/skills klonu yok")
        bulgular = denetle(Path(KAYNAK).expanduser() / "anthropics__skills" / "skills")
        self.assertTrue(any(b.kural == "description" and "1068 karakter" in b.mesaj for b in bulgular))


if __name__ == "__main__":
    unittest.main()
