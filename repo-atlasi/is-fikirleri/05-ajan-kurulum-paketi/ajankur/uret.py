"""Analiz sonucundan AGENTS.md, CLAUDE.md, başlangıç becerileri, güvenlik kancası ve ekip rehberi üretir.

Var olan dosyanın üzerine yazmaz (--uzerine-yaz verilmedikçe): yanına `<ad>.ajankur` öneri dosyası bırakır.
`.claude/settings.json` ve `opencode.json` zaten varsa öneri, var olan ayarla BİRLEŞTİRİLMİŞ hâlidir.
Becerilerin ön bilgisi kodda üretilir (Prettier'ın YAML biçimlemesi şablon yer tutucularını bozmasın diye);
`description` JSON tırnaklı yazılır, bu geçerli bir YAML çift tırnaklı metindir. Açıklama yalnız NE ZAMAN
kullanılacağını söyler, iş akışını özetlemez: obra/superpowers `skills/writing-skills` özet gören ajanın
beceriyi okumadan özeti izlediğini yazar. Komut da açıklamaya girmez (`2>&1` gibi `>` içeren bir komut
Anthropic doğrulayıcısının `<` `>` yasağına takılırdı).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

from .analiz import Analiz, guvenli_komut

SABLONLAR = Path(__file__).parent / "sablonlar"
BECERI_ADLARI = {
    "tr": {"tdd": "tdd", "hata": "hata-ayiklama", "inceleme": "kod-inceleme"},
    "en": {"tdd": "tdd", "hata": "debugging", "inceleme": "code-review"},
}
SABLON_DOSYASI = {"tdd": "tdd.md", "hata": "hata-ayiklama.md", "inceleme": "kod-inceleme.md"}
ACIKLAMALAR = {
    "tr": {
        "tdd": "Yeni davranış eklerken, hata düzeltirken ya da davranışı değiştiren bir yeniden düzenlemede, "
               "üretim kodu yazmadan önce kullan.",
        "hata": "Hata, başarısız test, beklenmeyen davranış ya da performans sorunu görüldüğünde, düzeltme "
                "önermeden önce kullan.",
        "inceleme": "İnceleme isteği (pull request) açmadan önce kendi farkını incelerken ya da bir ekip "
                    "arkadaşının değişikliğini incelerken kullan.",
    },
    "en": {
        "tdd": "Use when adding behaviour, fixing a bug or refactoring in a way that changes behaviour, before "
               "writing production code.",
        "hata": "Use when you hit a bug, a failing test, unexpected behaviour or a performance problem, before "
                "proposing a fix.",
        "inceleme": "Use before opening a pull request to review your own diff, or when reviewing a teammate's "
                    "change.",
    },
}
METINLER = {
    "tr": {"yok": "belirlenmedi", "ci_yok": "(CI dosyası bulunamadı)", "kaynak_yok": "(yok)", "temiz": "temiz",
           "rehber": "docs/ajan-rehberi.md", "is": "İş", "komut": "Komut",
           "satirlar": ("Kurulum", "Geliştirme", "Derleme", "Test", "Tek test", "Lint", "Biçim denetimi",
                        "Tip denetimi")},
    "en": {"yok": "not set", "ci_yok": "(no CI file found)", "kaynak_yok": "(none)", "temiz": "clean",
           "rehber": "docs/agent-guide.md", "is": "Task", "komut": "Command",
           "satirlar": ("Install", "Dev server", "Build", "Test", "Single test", "Lint", "Format check",
                        "Type check")},
}
HATA_ARACLARI = {
    "tr": {"javascript": "`node --inspect`, `console.trace()`", "typescript": "`node --inspect`, kaynak haritaları",
           "python": "`breakpoint()` ile pdb, `python -X faulthandler`", "go": "Delve (`dlv test`), `go test -v -run`",
           "rust": "`dbg!()`, `RUST_BACKTRACE=1 cargo test`"},
    "en": {"javascript": "`node --inspect`, `console.trace()`", "typescript": "`node --inspect`, source maps",
           "python": "pdb via `breakpoint()`, `python -X faulthandler`", "go": "Delve (`dlv test`), `go test -v -run`",
           "rust": "`dbg!()`, `RUST_BACKTRACE=1 cargo test`"},
}
KANCA_DOSYASI = "guvenlik_kancasi.py"
KANCA_KOMUTU = f'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/{KANCA_DOSYASI}"'
# PowerShell: Windows'taki kabuk aracı; NotebookEdit `notebook_path`, Grep `path` ile dosyaya dokunur.
KANCA_ESLESTIRICI = "Bash|PowerShell|Read|Edit|Write|MultiEdit|NotebookEdit|Grep"
# Kanca çalışmasa da (python3 yoksa) geçerli kalan Claude Code izin yasakları. Biçim klonlardaki örneklerle
# aynıdır: `Bash(<önek>:*)` react/react ve n8n-io/n8n `.claude/settings.json`; `Read(...)` desenleri affaan-m/ECC
# the-security-guide.md "Restrict tools and paths". Anthropic belgesinden doğrulanmadı.
IZIN_YASAKLARI = ("Bash(git push:*)", "Read(**/.env*)", "Read(~/.ssh/**)", "Read(~/.aws/**)")
# opencode: düz joker desenler (`*`, `?`), son eşleşen kural kazanır (permissions.mdx). Yasaklar en sonda.
OPENCODE_SERBEST = ("git status", "git diff", "git log")
OPENCODE_YASAK = (
    "git push*", "git reset --hard*", "git clean -f*", "git branch -D*", "git checkout .", "git restore .",
    "* --no-verify*", "rm -rf*", "npm publish*", "pnpm publish*", "yarn publish*", "bun publish*", "cargo publish*",
    "poetry publish*", "uv publish*", "twine upload*", "docker push*", "terraform apply*", "terraform destroy*",
    "kubectl apply*", "kubectl delete*", "helm install*", "helm upgrade*", "helm uninstall*", "chmod 777*",
)
OPENCODE_OKUMA = {"*.env": "deny", "*.env.*": "deny", "*.env.example": "allow", "*.env.sample": "allow",
                  "*.env.template": "allow"}


@dataclass
class Yazim:
    yol: str
    durum: str


def doldur(sablon: str, degerler: dict[str, str]) -> str:
    """{{AD}} yer tutucularını doldurur; bilinmeyen yer tutucu programcı hatasıdır."""

    def degistir(eslesme: re.Match) -> str:
        if eslesme.group(1) not in degerler:
            raise KeyError(f"Şablonda bilinmeyen yer tutucu: {eslesme.group(1)}")
        return degerler[eslesme.group(1)]

    return re.sub(r"\{\{([A-Z_]+)\}\}", degistir, sablon)


def _temiz(metin: str, sinir: int = 160) -> str:
    """Depodan gelen metni (paket adı, komut, yol) üretilen Markdown'a güvenle koymak için tek satıra indirir.

    AGENTS.md her ajanın talimatıdır: package.json adındaki bir satır sonu yeni bir başlık, görünmez bir karakter
    gizli bir talimat taşıyabilir. Yazdırılamayan her karakter boşluk olur, uzunluk sınırlanır.
    """
    metin = " ".join("".join(ch if ch.isprintable() else " " for ch in str(metin)).split())
    return metin if len(metin) <= sinir else metin[: sinir - 3] + "..."


def _kod(metin: str) -> str:
    """Satır içi kod; içinde ters tırnak varsa Markdown kuralına göre çift ters tırnakla sarılır."""
    metin = _temiz(metin)
    return f"`` {metin} ``" if "`" in metin else f"`{metin}`"


def tablo(basliklar: tuple[str, str], satirlar: list[tuple[str, str]]) -> str:
    """Sütunları hizalı iki sütunlu Markdown tablosu (Prettier'ın üreteceği biçimle aynı)."""
    satirlar = [(a, b.replace("|", "\\|")) for a, b in satirlar]  # hücredeki | tabloyu bozmasın
    gen = [max(len(s[i]) for s in [basliklar, *satirlar]) for i in (0, 1)]

    def satir(s: tuple[str, str]) -> str:
        return f"| {s[0].ljust(gen[0])} | {s[1].ljust(gen[1])} |"

    return "\n".join([satir(basliklar), f"| {'-' * gen[0]} | {'-' * gen[1]} |", *map(satir, satirlar)])


def _ana_dal(kok: Path) -> str:
    """Varsayılan dal: origin/HEAD > yerel ya da paketlenmiş main/master başvurusu > "main"."""
    git = kok / ".git"
    try:
        bas = (git / "refs" / "remotes" / "origin" / "HEAD").read_text(encoding="utf-8").strip()
        dal = bas.removeprefix("ref: refs/remotes/origin/")  # "release/2.0" gibi eğik çizgili adlar kalır
        if bas.startswith("ref: refs/remotes/origin/") and re.fullmatch(r"[\w./-]{1,100}", dal):
            return dal  # beceri metnine girer: depodan gelen tuhaf bir ad komut taşımasın
    except OSError:
        pass
    try:
        paketli = (git / "packed-refs").read_text(encoding="utf-8")
    except OSError:
        paketli = ""
    for ad in ("main", "master"):
        if (git / "refs" / "heads" / ad).is_file() or re.search(rf"\srefs/heads/{ad}$", paketli, re.M):
            return ad
    return "main"


def degerler(a: Analiz, dil: str, beceri_dizini: str) -> dict[str, str]:
    m = METINLER[dil]
    k = {tur: a.komutlar.get(tur, m["yok"]) for tur in ("kurulum", "gelistirme", "derleme", "test", "lint", "bicim",
                                                       "tip")}
    sira = [a.komutlar[t] for t in ("bicim", "lint", "tip", "test") if t in a.komutlar]
    adlar = BECERI_ADLARI[dil]
    kapilar = [a.komutlar[t] for t in ("lint", "tip", "test") if t in a.komutlar]
    ek = [f"{_kod(a.komutlar[t])} {m['temiz']}" for t in ("lint", "tip") if t in a.komutlar]
    # AGENTS.md'de gösterilecek CI komutları: kök dizinde koşan, tekrarsız, echo ve ${{ }} ifadesi olmayanlar.
    ci = [k for k in dict.fromkeys(k for d, liste in a.ci.items() if d not in a.ci_alt_dizin for k in liste)
          if "${{" not in k and not re.match(r"(echo|printf|cd|export|set|if|then|else|fi)\b", k)][:6]
    turler = ("kurulum", "gelistirme", "derleme", "test", "tek_test", "lint", "bicim", "tip")
    komut = {**k, "tek_test": a.tek_test or m["yok"]}
    hucre = {t: _kod(komut[t]) if komut[t] != m["yok"] else m["yok"] for t in turler}
    komut_tablosu = tablo((m["is"], m["komut"]), [(ad, hucre[t]) for ad, t in zip(m["satirlar"], turler, strict=True)])
    return {
        "PROJE": re.sub(r"[<>]", "", _temiz(a.ad or Path(a.kok).name, 80)),  # başlıkta gizli HTML yorumu olmasın
        "KOMUT_TABLOSU": komut_tablosu,
        "DILLER": ", ".join(a.diller) or m["yok"],
        "PAKET_YONETICISI": a.paket_yoneticisi or m["yok"],
        "CERCEVELER": ", ".join(a.cerceveler) or m["yok"],
        "TEST_DESENI": ", ".join(_kod(p.strip()) for p in (a.test_deseni or "").split(",") if p.strip()) or m["yok"],
        "TEST": _kod(k["test"]), "TEK_TEST": _kod(komut["tek_test"]),
        "DOGRULAMA_SIRASI": "\n".join(f"{no}. {_kod(c)}" for no, c in enumerate(sira, 1)) or f"1. ({m['yok']})",
        "CI_KOMUTLARI": ", ".join(_kod(c) for c in ci) or m["ci_yok"],
        "HATA_BECERISI": adlar["hata"], "INCELEME_BECERISI": adlar["inceleme"],
        "BECERI_LISTESI": "\n".join(f"- {_kod(f'{beceri_dizini}/{adlar[n]}/SKILL.md')}: {ACIKLAMALAR[dil][n]}"
                                    for n in adlar),
        "EK_KAPILAR": "".join(f", {e}" for e in ek),
        "HATA_ARACLARI": next((HATA_ARACLARI[dil][d] for d in a.diller if d in HATA_ARACLARI[dil]), m["yok"]),
        "ANA_DAL": _ana_dal(Path(a.kok)),
        "KAPILAR": ", ".join(_kod(c) for c in kapilar) or m["yok"],
        "BECERI_DIZINI": beceri_dizini,
        "BECERI_ADLARI": ", ".join(adlar.values()),
    }


def _beceri(ad: str, aciklama: str, govde: str) -> str:
    return f"---\nname: {ad}\ndescription: {json.dumps(aciklama, ensure_ascii=False)}\n---\n\n{govde}"


def _json_oku(yol: Path) -> dict | None:
    """Var olan JSON ayar dosyası; yoksa, okunamıyorsa ya da nesne değilse None."""
    try:
        veri = json.loads(yol.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return veri if isinstance(veri, dict) else None


def _sozluk(veri: dict, anahtar: str) -> dict:
    deger = veri.get(anahtar)
    return deger if isinstance(deger, dict) else {}


def _ayarlar(kok: Path) -> str:
    """Claude Code ayarı: kanca kaydı + izin yasakları, var olan `.claude/settings.json` ile birleştirilmiş."""
    veri = _json_oku(kok / ".claude" / "settings.json") or {}
    kancalar = _sozluk(veri, "hooks")
    kayitlar = kancalar.get("PreToolUse") if isinstance(kancalar.get("PreToolUse"), list) else []
    bizimkiler = [k for k in kayitlar if isinstance(k, dict) and KANCA_DOSYASI in json.dumps(k.get("hooks"))]
    for kayit in bizimkiler:  # eski sürümün kaydı: eşleştiriciyi güncelle
        kayit["matcher"] = KANCA_ESLESTIRICI
    if not bizimkiler:
        kayitlar.append({"matcher": KANCA_ESLESTIRICI, "hooks": [{"type": "command", "command": KANCA_KOMUTU}]})
    kancalar["PreToolUse"] = kayitlar
    veri["hooks"] = kancalar
    izinler = _sozluk(veri, "permissions")
    yasaklar = izinler.get("deny") if isinstance(izinler.get("deny"), list) else []
    yasaklar += [k for k in IZIN_YASAKLARI if k not in yasaklar]
    izinler["deny"] = yasaklar
    veri["permissions"] = izinler
    return json.dumps(veri, ensure_ascii=False, indent=2) + "\n"


def _opencode_kurallari(eski: object, bizim: dict[str, str], varsayilan: str) -> object:
    """opencode'da son eşleşen kural kazanır: önce '*', sonra ekibin kuralları, en sonda bizim kurallarımız.

    '*' için ekibin seçimi bizimkinden sıkıysa korunur; tek değerli 'deny' (aracın tümü kapalı) hiç değişmez.
    """
    if eski == "deny":
        return eski
    sira = {"allow": 0, "ask": 1, "deny": 2}
    eski_kurallar = eski if isinstance(eski, dict) else {}
    eski_yildiz = eski if isinstance(eski, str) else eski_kurallar.get("*")
    eski_yildiz = eski_yildiz if isinstance(eski_yildiz, str) else ""
    birlesik = {"*": eski_yildiz if sira.get(eski_yildiz, -1) > sira[varsayilan] else varsayilan}
    birlesik.update({k: v for k, v in eski_kurallar.items() if k != "*" and k not in bizim})
    birlesik.update(bizim)
    return birlesik


def _opencode(a: Analiz) -> str:
    """opencode izinleri: test/lint gibi yalın komutlar serbest, gerisi onaylı, yıkıcı olanlar yasak."""
    serbest = list(OPENCODE_SERBEST)
    serbest += [a.komutlar[t] for t in ("test", "lint", "bicim", "tip") if t in a.komutlar]
    bash: dict[str, str] = {}
    for komut in dict.fromkeys(serbest):
        if guvenli_komut(komut):  # boru, yönlendirme ve ağ komutu içeren CI satırı kendiliğinden onaylanmaz
            bash.update({komut: "allow", f"{komut} *": "allow"})  # "make test*" "make test-prod"u kapsamasın
    bash.update(dict.fromkeys(OPENCODE_YASAK, "deny"))
    veri = _json_oku(Path(a.kok) / "opencode.json") or {}
    veri = {"$schema": veri.get("$schema", "https://opencode.ai/config.json"), **veri}
    izin = _sozluk(veri, "permission")
    izin["bash"] = _opencode_kurallari(izin.get("bash"), bash, "ask")
    izin["read"] = _opencode_kurallari(izin.get("read"), OPENCODE_OKUMA, "allow")
    veri["permission"] = izin
    return json.dumps(veri, ensure_ascii=False, indent=2) + "\n"


def _mevcut_kaynaklar(a: Analiz, uretilen: dict[str, str]) -> list[str]:
    """Ekibin kendi talimat dosyaları; bizim daha önce ürettiklerimiz sayılmaz (yeniden üretim aynı sonucu versin)."""
    kok = Path(a.kok)

    def bizim_mi(yol: Path, beklenen: str | None) -> bool:
        try:
            return beklenen is not None and yol.read_text(encoding="utf-8") == beklenen
        except OSError:
            return False

    kaynaklar = [d for d in a.ajan_dosyalari if d != "AGENTS.md" and not bizim_mi(kok / d, uretilen.get(d))]
    bizim_beceriler = {Path(y).parent.name: icerik for y, icerik in uretilen.items() if y.endswith("/SKILL.md")}
    kaynaklar += [b for b in a.beceriler if not bizim_mi(kok / b / "SKILL.md", bizim_beceriler.get(Path(b).name))]
    return kaynaklar


def dosyalar(a: Analiz, dil: str = "tr", beceri_dizini: str = ".agents/skills") -> dict[str, str]:
    """Üretilecek dosyalar: {göreli yol: içerik}. Diske yazmaz (testler ve kuru çalıştırma için)."""
    if dil not in BECERI_ADLARI:
        raise ValueError(f"Desteklenmeyen dil: {dil} (tr ya da en)")
    d = degerler(a, dil, beceri_dizini)
    oku = (SABLONLAR / dil).joinpath
    cikti = {
        "CLAUDE.md": "@AGENTS.md\n",
        f".claude/hooks/{KANCA_DOSYASI}": (SABLONLAR / KANCA_DOSYASI).read_text(encoding="utf-8"),
        ".claude/settings.json": _ayarlar(Path(a.kok)),
        "opencode.json": _opencode(a),
        METINLER[dil]["rehber"]: doldur(oku("rehber.md").read_text(encoding="utf-8"), d),
    }
    for anahtar, ad in BECERI_ADLARI[dil].items():
        govde = doldur(oku(SABLON_DOSYASI[anahtar]).read_text(encoding="utf-8"), d)
        cikti[f"{beceri_dizini}/{ad}/SKILL.md"] = _beceri(ad, ACIKLAMALAR[dil][anahtar], govde)
    mevcut = _mevcut_kaynaklar(a, cikti)
    d["MEVCUT_KAYNAKLAR"] = "\n".join(f"- {_kod(k)}" for k in mevcut) or METINLER[dil]["kaynak_yok"]
    return {"AGENTS.md": doldur(oku("ajan-talimatlari.md").read_text(encoding="utf-8"), d), **cikti}


def _yaz(hedef: Path, goreli: str, icerik: str, uzerine_yaz: bool) -> Yazim:
    yol = hedef / goreli
    oneri = yol.with_name(yol.name + ".ajankur")
    kok = hedef.resolve()
    # Depodaki bir sembolik bağ (ör. docs -> /etc) yazımı depo dışına taşımasın.
    if not all(p.resolve().is_relative_to(kok) for p in (yol, oneri)):
        return Yazim(goreli, "atlandı: yol depo dışına çıkıyor (sembolik bağ); elle inceleyin")
    if yol.is_dir():
        return Yazim(goreli, "atlandı: bu adda bir klasör var")
    if yol.exists() and not uzerine_yaz:
        if yol.read_text(encoding="utf-8", errors="replace") == icerik:
            return Yazim(goreli, "aynı")
        oneri.write_text(icerik, encoding="utf-8")
        return Yazim(goreli, f"mevcut; öneri yazıldı: {oneri.relative_to(hedef).as_posix()}")
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(icerik, encoding="utf-8")
    if yol.suffix == ".py":
        yol.chmod(0o755)
    return Yazim(goreli, "yazıldı")


def uret(a: Analiz, hedef: str | Path | None = None, dil: str = "tr", beceri_dizini: str = ".agents/skills",
         uzerine_yaz: bool = False) -> list[Yazim]:
    hedef = Path(hedef or a.kok)
    hedef.mkdir(parents=True, exist_ok=True)
    sonuc = [_yaz(hedef, yol, icerik, uzerine_yaz) for yol, icerik in dosyalar(a, dil, beceri_dizini).items()]
    claude_skills = hedef / ".claude" / "skills"
    if beceri_dizini == ".agents/skills" and not claude_skills.exists() and not claude_skills.is_symlink():
        try:  # OpenClaw deposunun kendisi de böyle yapar: .claude/skills -> ../.agents/skills
            claude_skills.parent.mkdir(parents=True, exist_ok=True)
            os.symlink("../.agents/skills", claude_skills, target_is_directory=True)
            sonuc.append(Yazim(".claude/skills", "bağlantı: ../.agents/skills"))
        except OSError as hata:
            sonuc.append(Yazim(".claude/skills", f"bağlantı kurulamadı ({hata.strerror}); elle kopyalayın"))
    return sonuc
