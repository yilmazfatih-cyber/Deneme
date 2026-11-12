import json
import tempfile
import unittest
from pathlib import Path

from baslangic_kancasi import ETIKET, kanca_ciktisi, oturum_basi
from kos import KLASOR

BOOT = KLASOR / 'beceri-kullanimi'


class KancaBicimiTesti(unittest.TestCase):
    def test_harnesse_gore_alan(self):
        durumlar = {
            'cursor': ({'CURSOR_PLUGIN_ROOT': '/e', 'CLAUDE_PLUGIN_ROOT': '/e'}, ['additional_context']),
            'claude': ({'CLAUDE_PLUGIN_ROOT': '/e'}, ['hookSpecificOutput']),
            'copilot': ({'CLAUDE_PLUGIN_ROOT': '/e', 'COPILOT_CLI': '1'}, ['additionalContext']),
            'muse': ({'MUSE_PLUGIN_ROOT': '/e'}, ['hookSpecificOutput']),
            'bilinmeyen': ({}, ['additionalContext']),
        }
        for ad, (ortam, alanlar) in durumlar.items():
            with self.subTest(ad=ad):
                self.assertEqual(list(kanca_ciktisi('x', ortam)), alanlar)
        ic = kanca_ciktisi('x', {'CLAUDE_PLUGIN_ROOT': '/e'})['hookSpecificOutput']
        self.assertEqual(ic, {'hookEventName': 'SessionStart', 'additionalContext': 'x'})

    def test_govde_sarilir_onbilgi_atilir(self):
        veri = json.loads(oturum_basi(BOOT, {'CLAUDE_PLUGIN_ROOT': '/e'}))
        baglam = veri['hookSpecificOutput']['additionalContext']
        self.assertTrue(baglam.startswith(f'<{ETIKET}>'))
        self.assertIn('"beceri-kullanimi"', baglam)
        self.assertNotIn('description:', baglam)  # ön bilgi değil gövde enjekte edilir

    def test_alt_ajana_enjekte_edilmez(self):
        self.assertIsNone(oturum_basi(BOOT, {}, {'parentID': 'ust'}))

    def test_kacis_ve_sinir(self):
        with tempfile.TemporaryDirectory() as td:
            dizin = Path(td) / 'b'
            dizin.mkdir()
            govde = 'Tırnak " ve ters bölü \\ ve sekme\t.\n' + 'uzun satır\n' * 2000
            (dizin / 'SKILL.md').write_text(f'---\nname: b\ndescription: x\n---\n{govde}', encoding='utf-8')
            cikti = oturum_basi(dizin, {}, sinir=500)
        baglam = json.loads(cikti)['additionalContext']  # geçerli JSON: kaçışlar doğru
        self.assertLessEqual(len(baglam), 500)
        self.assertIn('[kesildi:', baglam)
        self.assertTrue(baglam.endswith(f'</{ETIKET}>'))


if __name__ == '__main__':
    unittest.main()
