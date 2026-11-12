"""Mevcut becerileri (SKILL.md), ajan kancalarını ve proje MCP ayarlarını denetler.

Yalnız okur; hiçbir betik, kanca ya da kod çalıştırmaz.

Ön bilgi kuralları doğrulanmış kaynaklardan:
- anthropics/skills 2c5958e, skills/skill-creator/scripts/quick_validate.py: izinli anahtarlar, name
  biçimi ve ≤ 64, description ≤ 1024 ve `<` `>` yasak, compatibility ≤ 500.
- anomalyco/opencode 12a661e, packages/web/src/content/docs/skills.mdx: name = klasör adı, tek tire.
- openclaw/openclaw 7c78826, docs/tools/creating-skills.md: description tek satır, < 160 karakter önerisi.
- anthropics/skills skill-creator SKILL.md: gövde 500 satırın altında kalmalı.
- obra/superpowers 22f0b46, skills/writing-skills/SKILL.md: açıklama "ne zaman kullanılır"ı söylemeli.
Risk kalıpları affaan-m/ECC d2ef268 the-security-guide.md "Sanitization" bölümünden uyarlandı; görünmez
karakter listesi, ağaç dışına çıkan sembolik bağ ve dosya boyutu denetimi NousResearch/hermes-agent 8c1a9c0
tools/skills_guard.py'deki karşılıklarına benzer. Proje ayarındaki model uç noktası (ANTHROPIC_BASE_URL) ve MCP
onayı ECC rehberinin "Claude Code CVEs" bölümünden.
"""

from __future__ import annotations

import json
import os
import re
import stat
from dataclasses import asdict, dataclass
from pathlib import Path

IZINLI_ANAHTARLAR = {"name", "description", "license", "allowed-tools", "metadata", "compatibility"}
AD_KALIBI = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
METIN_UZANTILARI = {".md", ".txt", ".sh", ".bash", ".py", ".js", ".mjs", ".cjs", ".ts", ".json", ".yaml", ".yml",
                    ".toml", ".ps1", ".cmd", ".bat"}
ATLANAN = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", "target"}
KANCA_DOSYALARI = (".claude/settings.json", ".claude/settings.local.json", "hooks/hooks.json")
AYAR_ADLARI = {"settings.json", "settings.local.json", "hooks.json"}
AZAMI_BAYT = 1024 * 1024  # dosya başına taranan en büyük boyut; kötü niyetli dev dosya denetimi kilitlemesin
KANCA_SABLONU = (Path(__file__).parent / "sablonlar" / "guvenlik_kancasi.py").read_text(encoding="utf-8")
# Sıfır genişlikli ve yön değiştiren karakterler, görünmez işleçler ve Unicode etiket karakterleri (U+E0000-E007F).
GIZLI_UNICODE = r"[\u200b\u200c\u200d\u2060\u2062-\u2064\ufeff\u202a-\u202e\u2066-\u2069\U000e0000-\U000e007f]"

# (kural, seviye, kalıp, açıklama). Ağ komutu becerilerde UYARI, kancalarda HATA'dır (kanca kendiliğinden koşar).
RISKLER = [
    ("gizli-unicode", "HATA", GIZLI_UNICODE, "görünmez ya da yön değiştiren Unicode: insan görmez, model okur"),
    ("uzak-betik", "HATA", r"\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b|\biwr\b[^\n|]*\|\s*iex\b",
     "internetten indirilen betiği doğrudan çalıştırma"),
    ("guvenlik-kapatma", "HATA",
     r"(?i)\b(ignore|disregard)\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions|rules)"
     r"|--dangerously-skip-permissions|bypassPermissions|dangerouslyDisableSandbox"
     r"|\bdisable\s+(the\s+)?(sandbox|safety|guardrails|hooks)\b"
     r"|\b(önceki|yukarıdaki)\s+(tüm\s+|bütün\s+)?(talimatları|talimatlarını|kuralları|kurallarını|yönergeleri"
     r"|yönergelerini)\s+(yok\s+say|unut|görmezden\s+gel|dikkate\s+alma)"
     r"|\b(güvenliği|(güvenlik|izin)\s+(önlemlerini|kontrollerini|kancalarını|kancasını|denetimlerini|ayarlarını)"
     r"|kum\s+havuzunu|kancaları|korumaları)\s+(kapat|devre\s+dışı)",
     "güvenlik önlemlerini kapatmaya ya da önceki talimatları yok saymaya çağırıyor"),
    ("gizli-dosya", "HATA", r"~/\.ssh|\bid_(rsa|ed25519)\b|\.aws/credentials|\bprintenv\b"
     r"|\b(cat|less|head|tail)\s+[^\n]*\.env\b(?!\.example)", "gizli anahtar ya da kimlik dosyasına erişim"),
    ("yikici-silme", "HATA", r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+(/|~|\$HOME)(\s|$)", "kök ya da ev dizinini silme"),
    ("dogrulama-atlama", "UYARI", r"--no-verify\b", "git kancalarını atlıyor"),
    ("zorla-push", "UYARI", r"\bgit\s+push\b[^\n]*\s(--force|-f)\b", "zorla push uzak geçmişi siler"),
    ("model-ucnoktasi", "UYARI", r"ANTHROPIC_BASE_URL|OPENAI_BASE_URL|enableAllProjectMcpServers",
     "model uç noktasını ya da MCP onayını değiştiriyor"),
    ("gizli-html", "UYARI", r"<!--|<script\b|data:text/html|base64,", "gizli HTML yorumu, betik ya da gömülü veri"),
    ("genis-izin", "UYARI", r"\bchmod\s+(-R\s+)?777\b", "herkese yazma izni"),
    ("ag-komutu", "UYARI", r"\b(curl|wget|nc|ncat|scp|ssh|rsync|Invoke-WebRequest|iwr)\b",
     "ağ komutu: veri dışarı gönderilebilir"),
]
RISKLER = [(kural, seviye, re.compile(kalip), aciklama) for kural, seviye, kalip, aciklama in RISKLER]
# Ayar dosyasının `env` bloğunda: model/API uç noktası yönlendirmesi ve depoya yazılmış gizli değerler.
# Ad sonuna bakılır: CLAUDE_CODE_MAX_OUTPUT_TOKENS gibi sayısal ayarlar gizli değer sayılmasın.
UC_NOKTA_ANAHTARI = re.compile(r"(?i)^[A-Z0-9_]*(BASE_URL|API_URL)$")
GIZLI_ANAHTAR = re.compile(r"(?i)(API_?KEY|TOKEN|SECRET|PASSWORD|PAROLA)$")
BETIK_UZANTILARI = {".sh", ".bash", ".py", ".js", ".mjs", ".cjs", ".ts", ".ps1", ".cmd", ".bat"}
BETIK_YOLU = re.compile(r"[\w./-]+\.(?:sh|bash|py|js|mjs|cjs|ts|ps1)\b")
KABUL = "ajankur: kabul"  # satır sonu işareti: bu satır insan tarafından incelendi (bandit'teki nosec gibi)
YAML_KACIS = {"0": "\0", "a": "\a", "b": "\b", "t": "\t", "\t": "\t", "n": "\n", "v": "\v", "f": "\f", "r": "\r",
              "e": "\x1b", " ": " ", '"': '"', "/": "/", "\\": "\\", "N": "\x85", "_": "\xa0", "L": "\u2028",
              "P": "\u2029"}


@dataclass
class Bulgu:
    seviye: str  # HATA | UYARI | BILGI
    dosya: str
    kural: str
    mesaj: str
    satir: int | None = None


def _goreli(yol: Path, kok: Path) -> str:
    return yol.relative_to(kok).as_posix() if yol.is_relative_to(kok) else str(yol)


def _metni_oku(yol: Path) -> tuple[str, int]:
    """(metin, okunan bayt). En fazla AZAMI_BAYT + 1 bayt okunur; fazlası taranmaz."""
    with yol.open("rb") as dosya:
        veri = dosya.read(AZAMI_BAYT + 1)
    return veri[:AZAMI_BAYT].decode("utf-8", errors="replace"), len(veri)


def _yaml_cift_tirnak(icerik: str) -> str:
    """YAML çift tırnaklı metnin kaçışlarını çözer (\\xHH, \\uHHHH, \\e, \\_ ... JSON'da olmayanlar dahil)."""
    kacis = r"\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|[0abt\tnvfre \"/\\N_LP])"
    if re.search(r"\\", re.sub(kacis, "", icerik)):
        raise ValueError("geçersiz kaçış dizisi")
    return re.sub(kacis, lambda m: chr(int(m.group(1)[1:], 16)) if m.group(1)[0] in "xuU" else YAML_KACIS[m.group(1)],
                  icerik)


def _skaler(deger: str) -> str:
    """Tek bir YAML değeri: tırnaklı (kaçışlar çözülür) ya da düz (sondaki ` # yorum` atılır)."""
    deger = deger.strip()
    if deger.startswith('"'):
        eslesme = re.match(r'"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$', deger)
        if not eslesme:
            raise ValueError("kapanmamış çift tırnak")
        return _yaml_cift_tirnak(eslesme.group(1))
    if deger.startswith("'"):
        eslesme = re.match(r"'((?:[^']|'')*)'\s*(?:#.*)?$", deger)
        if not eslesme:
            raise ValueError("kapanmamış tek tırnak")
        return eslesme.group(1).replace("''", "'")
    return re.sub(r"\s+#.*$", "", deger)


def onbilgi_ayir(metin: str) -> tuple[dict[str, object] | None, str, list[str]]:
    """SKILL.md ön bilgisini (YAML alt kümesi) ayırır: (alanlar, gövde, hatalar).

    Desteklenen: `ad: değer`, tırnaklı değerler (çok satırlı olanlar dahil), `|` ve `>` blokları, `[a, b]`
    listeleri ve iç içe blokların ham metni (metadata gibi). Tam YAML değildir; stdlib'de YAML ayrıştırıcı yok.
    """
    satirlar = metin.lstrip("\ufeff").splitlines()
    if not satirlar or satirlar[0].strip() != "---":
        return None, metin, ["SKILL.md '---' ile başlayan YAML ön bilgisiyle başlamalı"]
    try:
        bitis = next(i for i in range(1, len(satirlar)) if satirlar[i].strip() == "---")
    except StopIteration:
        return None, metin, ["ön bilgi kapanmamış: ikinci '---' satırı yok"]
    alanlar: dict[str, object] = {}
    hatalar: list[str] = []
    i, govde = 1, "\n".join(satirlar[bitis + 1:])
    while i < bitis:
        satir = satirlar[i]
        i += 1
        if not satir.strip() or satir.lstrip().startswith("#"):
            continue
        eslesme = re.match(r"^([A-Za-z0-9_-]+):(?:\s+(.*))?$", satir)
        if not eslesme or satir[0].isspace():
            hatalar.append(f"ön bilgi satırı anlaşılamadı: {satir.strip()[:60]!r}")
            continue
        anahtar, deger = eslesme.group(1), (eslesme.group(2) or "").strip()
        if anahtar in alanlar:
            hatalar.append(f"'{anahtar}' anahtarı iki kez yazılmış")
        alt = []
        while i < bitis and (not satirlar[i].strip() or satirlar[i][0].isspace()):
            alt.append(satirlar[i])
            i += 1
        if deger in ("|", "|-", ">", ">-"):
            parcalar = [s.strip() for s in alt]
            alanlar[anahtar] = ("\n" if deger.startswith("|") else " ").join(p for p in parcalar if p)
        elif not deger:
            alanlar[anahtar] = {"_ham": "\n".join(alt)}  # iç içe blok (metadata)
        elif deger.startswith("["):
            alanlar[anahtar] = [re.sub(r"^(['\"])(.*)\1$", r"\2", x.strip()) for x in deger.strip("[]").split(",")
                                if x.strip()]
        else:
            try:  # çok satırlı değer: devam satırları tek boşlukla birleşir (YAML katlama)
                alanlar[anahtar] = _skaler(" ".join([deger] + [s.strip() for s in alt if s.strip()]))
            except ValueError:
                hatalar.append(f"'{anahtar}' değeri geçersiz tırnaklı metin")
    return alanlar, govde, hatalar


def _risk_tara(metin: str, dosya: str, kanca_mi: bool = False) -> list[Bulgu]:
    """Satır satır risk kalıpları. Sonunda `ajankur: kabul` yazan satır incelenmiş sayılır ve atlanır;
    atlanan eşleşmeler BİLGİ olarak sayılır, görünmez karakter için bu işaret hiç geçmez."""
    bulgular, kabul = [], 0
    metin = metin.removeprefix("\ufeff")  # dosya başındaki BOM zararsızdır (Windows düzenleyicileri, .ps1)
    for no, satir in enumerate(metin.splitlines(), 1):
        kabul_edildi = KABUL in satir
        for kural, seviye, kalip, aciklama in RISKLER:
            eslesme = kalip.search(satir)
            if not eslesme:
                continue
            if kabul_edildi and kural != "gizli-unicode":
                kabul += 1
                continue
            if kanca_mi and kural == "ag-komutu":
                seviye = "HATA"
            ayrinti = f" (U+{ord(eslesme.group(0)):04X})" if kural == "gizli-unicode" else ""
            bulgular.append(Bulgu(seviye, dosya, kural, aciklama + ayrinti, no))
    if kabul:
        bulgular.append(Bulgu("BILGI", dosya, "kabul", f"{kabul} eşleşme '{KABUL}' işaretiyle atlandı"))
    return bulgular


def _dosya_tara(yol: Path, kok: Path, kanca_mi: bool = False) -> list[Bulgu]:
    """Tek bir düzenli dosyayı boyut sınırıyla okuyup risk kalıplarına bakar."""
    goreli = _goreli(yol, kok)
    try:
        if not stat.S_ISREG(os.stat(yol).st_mode):  # FIFO ya da aygıt dosyası okunurken takılırdı
            return [Bulgu("UYARI", goreli, "dosya-turu", "düzenli dosya değil; taranmadı")]
        metin, boyut = _metni_oku(yol)
    except OSError as hata:
        return [Bulgu("UYARI", goreli, "okunamadi", f"okunamadı: {hata.strerror or hata}")]
    if kanca_mi and metin.replace("\r\n", "\n") == KANCA_SABLONU:
        return []  # ajankur'un kendi kancası: engellediği kalıpları içerir, taranması yanlış alarm üretir
    bulgular = _risk_tara(metin, goreli, kanca_mi)
    if boyut > AZAMI_BAYT:
        mesaj = f"{AZAMI_BAYT // 2**20} MB sınırını aşıyor; yalnız ilk kısmı tarandı"
        bulgular.append(Bulgu("UYARI", goreli, "boyut", mesaj))
    return bulgular


def _bag_denetle(yol: Path, sinir: Path, kok: Path) -> list[Bulgu]:
    """Sembolik bağ: `sinir` dışına işaret ediyorsa izlenmez, HATA olarak raporlanır."""
    try:
        hedef = yol.resolve(strict=True)
    except (OSError, RuntimeError):
        return [Bulgu("UYARI", _goreli(yol, kok), "sembolik-bag", "kırık ya da döngülü sembolik bağ")]
    if hedef.is_relative_to(sinir.resolve()):
        return []
    return [Bulgu("HATA", _goreli(yol, kok), "sembolik-bag", f"klasörün dışına işaret ediyor ({hedef}); izlenmedi")]


def beceri_denetle(skill_md: Path, kok: Path) -> list[Bulgu]:
    dosya = _goreli(skill_md, kok)
    try:
        metin = _metni_oku(skill_md)[0]
    except OSError as hata:
        return [Bulgu("HATA", dosya, "okunamadi", f"SKILL.md okunamadı: {hata.strerror or hata}")]
    alanlar, govde, hatalar = onbilgi_ayir(metin)
    bulgular = [Bulgu("HATA", dosya, "onbilgi", h) for h in hatalar]
    if alanlar is not None:
        bulgular += _alanlari_denetle(alanlar, govde, skill_md.parent.name, dosya)
    klasor = skill_md.parent
    for ust, dizinler, dosyalar in os.walk(klasor):  # followlinks=False: bağlı klasörlere girilmez
        dizinler.sort()
        for ad in sorted([*dizinler, *dosyalar]):
            yol = Path(ust) / ad
            if yol.is_symlink():
                bulgular += _bag_denetle(yol, klasor, kok)
            elif ad in dosyalar and yol.suffix.lower() in METIN_UZANTILARI:
                bulgular += _dosya_tara(yol, kok)
    return bulgular


def _alanlari_denetle(alanlar: dict, govde: str, klasor_adi: str, dosya: str) -> list[Bulgu]:
    b: list[Bulgu] = []
    ad, aciklama = alanlar.get("name"), alanlar.get("description")
    if not isinstance(ad, str) or not ad.strip():
        b.append(Bulgu("HATA", dosya, "name", "'name' alanı zorunlu"))
    else:
        if not AD_KALIBI.match(ad) or len(ad) > 64:
            b.append(Bulgu("HATA", dosya, "name", f"'{ad}': küçük harf, rakam ve tek tire; en fazla 64 karakter"))
        if ad != klasor_adi:
            b.append(Bulgu("UYARI", dosya, "name", f"'{ad}' klasör adıyla ('{klasor_adi}') aynı olmalı"))
    if not isinstance(aciklama, str) or not aciklama.strip():
        b.append(Bulgu("HATA", dosya, "description", "'description' alanı zorunlu"))
    else:
        if len(aciklama) > 1024:
            b.append(Bulgu("HATA", dosya, "description", f"açıklama {len(aciklama)} karakter (en fazla 1024)"))
        if "<" in aciklama or ">" in aciklama:
            b.append(Bulgu("HATA", dosya, "description", "açıklamada '<' ya da '>' olamaz"))
        if len(aciklama) > 160 or "\n" in aciklama:
            b.append(Bulgu("BILGI", dosya, "description", "OpenClaw tek satır ve 160 karakterden kısa öneriyor"))
        if not re.search(r"(?i)\bwhen\b|kullan|durumunda|zaman|sırasında|önce", aciklama):
            b.append(Bulgu("BILGI", dosya, "description", "açıklama ne zaman kullanılacağını söylemiyor"))
    for anahtar, deger in alanlar.items():  # "\u200b" gibi kaçışla yazılan görünmez karakter ham metinde görünmez
        eslesme = re.search(GIZLI_UNICODE, deger) if isinstance(deger, str) else None
        if eslesme:
            b.append(Bulgu("HATA", dosya, "gizli-unicode",
                           f"'{anahtar}' değerinde kaçışla yazılmış görünmez karakter (U+{ord(eslesme.group(0)):04X})"))
    uyumluluk = alanlar.get("compatibility")
    if isinstance(uyumluluk, str) and len(uyumluluk) > 500:
        b.append(Bulgu("HATA", dosya, "compatibility", "compatibility en fazla 500 karakter"))
    fazla = sorted(set(alanlar) - IZINLI_ANAHTARLAR)
    if fazla:
        b.append(Bulgu("UYARI", dosya, "anahtarlar", f"spec dışı anahtar: {', '.join(fazla)} (Anthropic doğrulayıcısı "
                                                       "reddeder; OpenClaw/Hermes'e özgü olabilir)"))
    satir_sayisi = len(govde.splitlines())
    if satir_sayisi > 500:
        b.append(Bulgu("UYARI", dosya, "uzunluk", f"gövde {satir_sayisi} satır; 500'ün altı ve references/ önerilir"))
    return b


def _json_nesnesi(yol: Path, dosya: str) -> tuple[dict | None, list[Bulgu]]:
    try:
        veri = json.loads(_metni_oku(yol)[0])
    except OSError as hata:
        return None, [Bulgu("UYARI", dosya, "okunamadi", f"okunamadı: {hata.strerror or hata}")]
    except ValueError as hata:
        return None, [Bulgu("HATA", dosya, "json", f"geçersiz JSON: {hata}")]
    if not isinstance(veri, dict):
        return None, [Bulgu("HATA", dosya, "json", "JSON nesnesi bekleniyordu")]
    return veri, []


def _sozluk(veri: object, anahtar: str) -> dict:
    deger = veri.get(anahtar) if isinstance(veri, dict) else None
    return deger if isinstance(deger, dict) else {}


def _liste(veri: object, anahtar: str) -> list:
    deger = veri.get(anahtar) if isinstance(veri, dict) else None
    return deger if isinstance(deger, list) else []


def _ortam_denetle(ortam: dict, dosya: str, kim: str) -> list[Bulgu]:
    b = []
    for anahtar, deger in ortam.items():
        anahtar, deger = str(anahtar), str(deger)
        if UC_NOKTA_ANAHTARI.match(anahtar):
            b.append(Bulgu("HATA", dosya, "model-ucnoktasi",
                           f"{kim} `{anahtar}` ile model/API uç noktasını değiştiriyor; anahtar başkasına gidebilir"))
        elif GIZLI_ANAHTAR.search(anahtar) and deger and not deger.startswith("$"):
            b.append(Bulgu("HATA", dosya, "gizli-deger", f"{kim} `{anahtar}` için depoya yazılmış gizli değer"))
    return b


def _komuttaki_betikler(komut: str, kok: Path, eklenti_koku: Path) -> set[Path]:
    """Kanca komutunun çalıştırdığı, depo içindeki betik dosyaları ($CLAUDE_PROJECT_DIR/... gibi)."""
    temiz = re.sub(r"\"?\$\{?(CLAUDE_PROJECT_DIR|CLAUDE_PLUGIN_ROOT)\}?\"?/?", "", komut)
    yollar = set()
    for aday in BETIK_YOLU.findall(temiz):
        for taban in (kok, eklenti_koku):
            yol = (taban / aday.lstrip("/")).resolve()
            if yol.is_relative_to(kok.resolve()) and yol.is_file():
                yollar.add(yol)
    return yollar


def kancalari_denetle(yol: Path, kok: Path) -> list[Bulgu]:
    dosya = _goreli(yol, kok)
    veri, b = _json_nesnesi(yol, dosya)
    if veri is None:
        return b
    betikler: set[Path] = set()
    for olay, kayitlar in _sozluk(veri, "hooks").items():
        for kayit in kayitlar if isinstance(kayitlar, list) else []:
            for kanca in _liste(kayit, "hooks"):
                komut = str(kanca.get("command", "")) if isinstance(kanca, dict) else ""
                for bulgu in _risk_tara(komut, dosya, kanca_mi=True):
                    bulgu.mesaj = f"{olay} kancası: {bulgu.mesaj}"
                    bulgu.satir = None
                    b.append(bulgu)
                betikler |= _komuttaki_betikler(komut, kok, yol.parent.parent)
    for betik in sorted(betikler):  # asıl iş çoğu zaman komutun çağırdığı betiktedir
        b += _dosya_tara(betik, kok, kanca_mi=True)
    izinler = _sozluk(veri, "permissions")
    if izinler.get("defaultMode") == "bypassPermissions":
        b.append(Bulgu("HATA", dosya, "izin", "defaultMode bypassPermissions: tüm onaylar kapalı"))
    if any(k in ("Bash", "Bash(*)", "Bash(*:*)") for k in _liste(izinler, "allow")):
        b.append(Bulgu("UYARI", dosya, "izin", "kabuk komutlarının tamamı onaysız izinli"))
    if veri.get("enableAllProjectMcpServers") is True:
        b.append(Bulgu("UYARI", dosya, "mcp", "projedeki tüm MCP sunucuları otomatik onaylı"))
    return b + _ortam_denetle(_sozluk(veri, "env"), dosya, "proje ayarı")


def mcp_denetle(yol: Path, kok: Path) -> list[Bulgu]:
    """`.mcp.json`: depoyla gelen MCP sunucuları ajan açıldığında çalışabilir; tedarik zinciri parçasıdır."""
    dosya = _goreli(yol, kok)
    veri, b = _json_nesnesi(yol, dosya)
    if veri is None:
        return b
    for ad, sunucu in _sozluk(veri, "mcpServers").items():
        if not isinstance(sunucu, dict):
            continue
        komut = " ".join(str(x) for x in [sunucu.get("command") or "", *_liste(sunucu, "args")] if x)
        b.append(Bulgu("BILGI", dosya, "mcp", f"proje MCP sunucusu '{ad}': {(komut or str(sunucu.get('url')))[:80]}"))
        for bulgu in _risk_tara(komut, dosya, kanca_mi=True):
            bulgu.mesaj, bulgu.satir = f"MCP '{ad}': {bulgu.mesaj}", None
            b.append(bulgu)
        if re.match(r"(npx|bunx)\b", komut) and not re.search(r"@\d", komut):
            b.append(Bulgu("UYARI", dosya, "mcp", f"MCP '{ad}': paket sürümü sabitlenmemiş (paket@1.2.3 gibi yazın)"))
        b += _ortam_denetle(_sozluk(sunucu, "env"), dosya, f"MCP '{ad}'")
    return b


def denetle(hedef: str | Path) -> list[Bulgu]:
    """Bir depo kökünü, beceri klasörünü, tek bir SKILL.md'yi ya da bir ayar dosyasını denetler."""
    hedef = Path(hedef)
    if not hedef.exists():
        raise FileNotFoundError(f"Denetlenecek yol bulunamadı: {hedef}")
    hedef = hedef.resolve()
    if hedef.is_file():
        if hedef.name == ".mcp.json":
            return mcp_denetle(hedef, hedef.parent)
        if hedef.name in AYAR_ADLARI:
            return kancalari_denetle(hedef, hedef.parent.parent)
        return beceri_denetle(hedef, hedef.parent.parent)
    if (hedef / "SKILL.md").is_file():
        return beceri_denetle(hedef / "SKILL.md", hedef.parent)
    bulgular: list[Bulgu] = []
    denetlenen = 0
    for ust, dizinler, dosyalar in os.walk(hedef):  # followlinks=False
        dizinler[:] = sorted(d for d in dizinler if d not in ATLANAN)
        for ad in dizinler:
            bag = Path(ust) / ad
            if bag.is_symlink():  # bağlı klasörün içi bu taramada görülmez: depo dışındaysa söyle
                bulgular += [Bulgu("UYARI", b.dosya, b.kural, f"{b.mesaj}; içindekiler ayrıca denetlenmeli")
                             for b in _bag_denetle(bag, hedef, hedef) if b.seviye == "HATA"]
        if "SKILL.md" in dosyalar:
            skill_md = Path(ust) / "SKILL.md"
            sorun = _bag_denetle(skill_md, hedef, hedef) if skill_md.is_symlink() else []
            bulgular += sorun if sorun else beceri_denetle(skill_md, hedef)
            denetlenen += 1
    for ad in KANCA_DOSYALARI:
        if (hedef / ad).is_file():
            bulgular += kancalari_denetle(hedef / ad, hedef)
            denetlenen += 1
    if (hedef / ".claude" / "hooks").is_dir():
        for betik in sorted((hedef / ".claude" / "hooks").iterdir()):
            if betik.is_file() and not betik.is_symlink() and betik.suffix.lower() in BETIK_UZANTILARI:
                bulgular += [b for b in _dosya_tara(betik, hedef, kanca_mi=True) if b not in bulgular]
    if (hedef / ".mcp.json").is_file():
        bulgular += mcp_denetle(hedef / ".mcp.json", hedef)
        denetlenen += 1
    if not denetlenen:
        bulgular.append(Bulgu("BILGI", ".", "bos", "denetlenecek SKILL.md, kanca ya da MCP ayarı bulunamadı"))
    return bulgular


def rapor(bulgular: list[Bulgu], json_mu: bool = False) -> str:
    if json_mu:
        return json.dumps([asdict(b) for b in bulgular], ensure_ascii=False, indent=2)
    if not bulgular:
        return "Bulgu yok."
    satirlar = [f"{b.seviye:<5} {b.dosya}{f':{b.satir}' if b.satir else ''}  [{b.kural}] {b.mesaj}" for b in bulgular]
    sayim = {s: sum(b.seviye == s for b in bulgular) for s in ("HATA", "UYARI", "BILGI")}
    satirlar.append(f"Toplam: {sayim['HATA']} hata, {sayim['UYARI']} uyarı, {sayim['BILGI']} bilgi")
    return "\n".join(satirlar)
