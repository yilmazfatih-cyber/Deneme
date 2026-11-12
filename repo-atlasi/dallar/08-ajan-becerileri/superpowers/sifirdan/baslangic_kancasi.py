"""Oturum başı (SessionStart) kancası: önyükleme becerisini bağlama enjekte eder.

superpowers'ta "önyükleme tüm entegrasyondur" (docs/porting-to-a-new-harness.md): her oturumun
başında using-superpowers/SKILL.md'nin tamamı bağlama konur; bu metin modele becerilerin var
olduğunu ve önce beceriye bakması gerektiğini öğretir. Önyükleme olmadan beceri dosyaları
diskte durur ama hiç çağrılmaz.

hooks/session-start betiği (22f0b46) çıktıyı harness'e göre üç farklı JSON biçiminde yazar;
aşağıdaki kanca_ciktisi() aynı ortam değişkeni kurallarını izler:
  - CURSOR_PLUGIN_ROOT varsa            → {"additional_context": ...}
  - CLAUDE_PLUGIN_ROOT var, COPILOT_CLI ve MUSE_PLUGIN_ROOT yoksa
                                         → {"hookSpecificOutput": {"hookEventName": "SessionStart",
                                                                     "additionalContext": ...}}
  - MUSE_PLUGIN_ROOT varsa              → Claude biçimiyle aynı iç içe yapı
  - diğerleri (Copilot CLI vb.)         → {"additionalContext": ...}
Betik "Claude Code iki alanı da okur ve tekilleştirmez" diye yalnızca tek alan yazar; aynısını
yapıyoruz. Alt ajan oturumlarına enjekte etmiyoruz (OpenCode eklentisi parentID'ye bakar;
SKILL.md'deki <SUBAGENT-STOP> bloğu da aynı amaca hizmet eder).
"""

from __future__ import annotations

import json
from pathlib import Path

import _cekirdek  # noqa: F401  (çekirdeği sys.path'e ekler)
from beceri_kiti.onbilgi import oku

VARSAYILAN_SINIR = 8000  # ECC README: ECC_SESSION_START_MAX_CHARS varsayılanı 8000 karakter
ETIKET = 'COK_ONEMLI'


def baglam_metni(govde: str, ad: str) -> str:
    return (
        f'<{ETIKET}>\nBeceri sistemin var.\n\n'
        f'Aşağıda "{ad}" becerisinin tam metni var; diğer beceriler için beceri aracını kullan:\n\n'
        f'{govde.strip()}\n</{ETIKET}>'
    )


def kanca_ciktisi(baglam: str, ortam: dict[str, str]) -> dict:
    """Harness'e göre doğru JSON biçimini seçer (hooks/session-start ile aynı karar ağacı)."""
    if ortam.get('CURSOR_PLUGIN_ROOT'):
        return {'additional_context': baglam}
    if ortam.get('CLAUDE_PLUGIN_ROOT') and not ortam.get('COPILOT_CLI') and not ortam.get('MUSE_PLUGIN_ROOT'):
        return {'hookSpecificOutput': {'hookEventName': 'SessionStart', 'additionalContext': baglam}}
    if ortam.get('MUSE_PLUGIN_ROOT'):
        return {'hookSpecificOutput': {'hookEventName': 'SessionStart', 'additionalContext': baglam}}
    return {'additionalContext': baglam}


def oturum_basi(
    beceri_dizini: str | Path, ortam: dict[str, str], oturum: dict | None = None, sinir: int = VARSAYILAN_SINIR
) -> str | None:
    """Kancanın stdout'a yazacağı JSON metni; alt ajan oturumunda None (hiçbir şey enjekte edilmez)."""
    oturum = oturum or {}
    if oturum.get('parentID'):
        return None
    dizin = Path(beceri_dizini)
    onbilgi = oku((dizin / 'SKILL.md').read_text(encoding='utf-8'))
    baglam = baglam_metni(onbilgi.govde, onbilgi.veri.get('name', dizin.name))
    if len(baglam) > sinir:
        not_ = f'\n[kesildi: {len(baglam)} karakterden {sinir} karaktere]\n</{ETIKET}>'
        baglam = baglam[: sinir - len(not_)] + not_
    # json.dumps kaçışları doğru yapar; bash betiği aynı işi ${s//\"/\\\"} gibi değiştirmelerle yapıyor.
    return json.dumps(kanca_ciktisi(baglam, ortam), ensure_ascii=False)
