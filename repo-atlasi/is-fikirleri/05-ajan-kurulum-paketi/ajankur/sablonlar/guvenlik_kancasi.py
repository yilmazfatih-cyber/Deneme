#!/usr/bin/env python3
"""Claude Code PreToolUse güvenlik kancası (ajankur ile üretildi; ekibinize göre düzenleyin).

Protokol: Claude Code araç çağrısını stdin'e JSON olarak verir ({"tool_name": ..., "tool_input": {...}}).
Çıkış kodu 2 aracı engeller ve stderr'deki mesaj ajana gösterilir; 0 izin verir. 2 dışındaki sıfır olmayan
kodlar (ör. betik çökerse) aracı ENGELLEMEZ; bu yüzden beklenmeyen her durumda 2 ile çıkılır (güvenli taraf).
Bu bir emniyet kemeridir, kum havuzu değildir: kararlı biri atlatabilir. Asıl sınır izinler ve yalıtımdır.
"""

from __future__ import annotations  # macOS'taki eski python3 (3.9) için

import json
import re
import sys

# `git` ile alt komut arasındaki genel seçenekler (-C dizin, -c a=b, --no-pager...). Desen bilerek
# belirsizlikten arındırıldı: uzun ve kötü niyetli bir komut düzenli ifadeyi kilitleyemesin.
GIT = r"\bgit(?:\s+-\S*(?:\s+(?!-)\S+)?)*\s+"
# Komutta bir .env dosyası adı geçiyor mu (.env.example, .env.sample, .env.template serbest)?
ENV_DOSYASI = r"""(?:^|[\s'"=<>:;&|(/\\])\.env(?:\.(?!example\b|sample\b|template\b)[\w.-]+)?(?=$|[\s'";&|)<>*])"""

# (kalıp, neden). Büyük/küçük harf duyarlıdır: "git branch -d" serbest, "-D" engelli. Sonunda `ajankur: kabul`
# yazan satırlar engellenen kalıbı TANIMLAR; `python3 -m ajankur denetle` bunları incelenmiş sayar.
UZAK_BETIK = "internetten indirilen betiği doğrudan çalıştırma"
KOMUT_KURALLARI = [
    (GIT + r"push\b", "uzak depoya gönderme (push) insan onayı ister"),
    (GIT + r"reset\b[^;&|]*\s--hard\b", "reset --hard yerel değişiklikleri kalıcı siler"),
    (GIT + r"clean\b[^;&|]*\s-[a-zA-Z]*f", "git clean izlenmeyen dosyaları kalıcı siler"),
    (GIT + r"branch\b[^;&|]*\s-D\b", "dalı zorla silmek insan onayı ister"),
    (GIT + r"(checkout|restore)\s+(--\s+)?\.(\s|$)", "tüm yerel değişiklikleri geri alır"),
    (r"--no-verify\b", "git kancalarını atlamak yasak"),  # ajankur: kabul
    (r"""\brm\s+(-\S+\s+)*(/|~|"?\$\{?HOME\}?"?)/?\*?(\s|$)""", "kök ya da ev dizinini silme"),
    (r"\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?((ba|z|da)?sh|python3?|node|perl)\b", UZAK_BETIK),  # ajankur: kabul
    (r"\b(ba|z)?sh\s+<\(\s*(curl|wget)\b", UZAK_BETIK),  # ajankur: kabul
    (r"(?i)\b(iwr|irm|invoke-webrequest|invoke-restmethod)\b"  # ajankur: kabul
     r"[^|]*\|\s*(iex|invoke-expression)\b", UZAK_BETIK),
    (r"\b(npm|pnpm|yarn|bun)\s+publish\b|\b(cargo|poetry|uv)\s+publish\b|\btwine\s+upload\b|\bdocker\s+push\b",
     "paket ya da imaj yayınlama insan işidir"),
    (r"\bterraform\s+(apply|destroy)\b|\bkubectl\s+(apply|delete)\b|\bhelm\s+(install|upgrade|uninstall)\b",
     "dağıtım insan işidir"),
    (ENV_DOSYASI, ".env dosyalarına dokunulamaz"),
    (r"~/\.ssh|\bid_(rsa|ed25519)\b|\.aws/credentials|\bprintenv\b", "kimlik ve ortam sırları yasak"),  # ajankur: kabul
    (r"\bchmod\s+(-R\s+)?777\b", "herkese yazma izni verilemez"),
]
KOMUT_KURALLARI = [(re.compile(kalip), neden) for kalip, neden in KOMUT_KURALLARI]
KOMUT_ARACLARI = {"Bash", "PowerShell"}  # PowerShell aracı Windows'ta kullanılır; girdisi de `command`
# Dosya araçları için: .env ve anahtarlar yasak; .env.example gibi örnek dosyalar serbest. Windows ve macOS
# dosya sistemleri büyük/küçük harfe duyarsız olduğundan eşleşme de duyarsızdır.
GIZLI_DOSYA = re.compile(
    r"(?i)(^|/)\.env(\.(?!example$|sample$|template$)[\w.-]+)?$|(^|/)id_(rsa|ed25519)$|\.(pem|key|p12|pfx)$"
    r"|(^|/)\.aws/credentials$|(^|/)\.ssh/"  # ajankur: kabul
)
GIZLI_DESEN = re.compile(r"(?i)\.env(?![\w-])(?!\.(example|sample|template)\b)")  # Grep `glob`; .environment serbest
DOSYA_ARACLARI = {"Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "Grep"}
YOL_ALANLARI = ("file_path", "notebook_path", "path")


def _yollar(parametre: dict) -> list:
    """Araç girdisindeki tüm dosya yolları; MultiEdit'te her düzenlemenin kendi `file_path`'i de sayılır."""
    adaylar = [parametre.get(alan) for alan in YOL_ALANLARI]
    duzenlemeler = parametre.get("edits")
    if isinstance(duzenlemeler, list):
        adaylar += [d.get("file_path") for d in duzenlemeler if isinstance(d, dict)]
    return [y.replace("\\", "/") for y in adaylar if isinstance(y, str) and y]


def karar(girdi: object) -> str | None:
    """Engelleme nedenini ya da izin için None döndürür. Biçimi bozuk girdi engellenir."""
    if not isinstance(girdi, dict):
        return "girdi beklenen biçimde değil"
    arac = girdi.get("tool_name")
    parametre = girdi.get("tool_input")
    parametre = {} if parametre is None else parametre
    if not isinstance(parametre, dict):
        return "araç girdisi beklenen biçimde değil"
    if arac in KOMUT_ARACLARI:
        komut = parametre.get("command", "")
        if not isinstance(komut, str):
            return "komut metin değil"
        komut = " ".join(komut.split())
        return next((neden for kalip, neden in KOMUT_KURALLARI if kalip.search(komut)), None)
    if arac in DOSYA_ARACLARI:
        if any(GIZLI_DOSYA.search(yol) for yol in _yollar(parametre)):
            return "gizli dosyaya erişim yasak"
        desen = parametre.get("glob")
        if isinstance(desen, str) and GIZLI_DESEN.search(desen):
            return "gizli dosyaya erişim yasak"
    return None


def main() -> int:
    try:
        neden = karar(json.loads(sys.stdin.read()))
    except Exception:  # bozuk JSON dahil her beklenmeyen durum: 2 dışındaki kodlar engellemez
        neden = "kanca girdiyi değerlendiremedi; güvenli tarafta kalıp engelliyorum"
    if neden:
        try:  # mesaj yazılamasa da (kapalı stderr vb.) karar değişmez
            print(f"ENGELLENDİ: {neden}. Gerekliyse bu komutu bir insan çalıştırsın.", file=sys.stderr)
        except Exception:
            pass
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
