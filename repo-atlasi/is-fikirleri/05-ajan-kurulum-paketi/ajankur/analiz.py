"""Bir depoyu okuyup yığını (stack) ve komutları tespit eder. Hiçbir şey çalıştırmaz, yalnız dosya okur.

Kaynak öncelikleri: CI dosyalarında gerçekten koşan komutlar > Makefile hedefleri > paket
yöneticisi betikleri > dilin varsayılan komutları. Tespit edilemeyen alan boş kalır;
uydurma komut yazılmaz. CI satırlarındaki parola ve belirteçler maskelenir ([GİZLİ]); boru,
yönlendirme, zincir ya da ağ komutu içeren CI satırları komut tablosuna ve izinlere taşınmaz.
"""

from __future__ import annotations

import json
import re
import tomllib
from dataclasses import asdict, dataclass, field
from pathlib import Path

KOMUT_TURLERI = ("kurulum", "gelistirme", "derleme", "test", "lint", "bicim", "tip")
AJAN_DOSYALARI = (
    "AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules", ".windsurfrules", ".github/copilot-instructions.md",
    "opencode.json", "opencode.jsonc", ".claude/settings.json", ".mcp.json",
)
BECERI_DIZINLERI = (".claude/skills", ".agents/skills", ".opencode/skills", ".hermes/skills", "skills")
NODE_CERCEVELER = ("react", "vue", "next", "nuxt", "svelte", "@angular/core", "vite", "express", "@nestjs/core",
                   "vitest", "jest", "@playwright/test", "eslint", "prettier", "typescript")
PY_CERCEVELER = ("django", "flask", "fastapi", "pytest", "ruff", "mypy", "black", "numpy", "pandas")
CALISTIR = {"npm": "npm run", "pnpm": "pnpm run", "yarn": "yarn", "bun": "bun run"}
# CI satırı ancak bir test/lint ARACININ çağrısıysa komut sayılır ("uv sync --group=test" bir kurulumdur).
ON_EK = r"^(?:\w+=\S*\s+)*(?:(?:(?:uv|poetry|pdm|hatch)\s+run|uvx|npx)\s+(?:-\S+\s+)*)?"
CI_KALIPLARI = {
    "test": re.compile(ON_EK + r"(?:pytest|python3?\s+-m\s+(?:pytest|unittest)|go\s+test|cargo\s+(?:test|nextest)"
                       r"|make\s+(?:test|check)|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|vitest|jest|tox|nox)\b"),
    "lint": re.compile(ON_EK + r"(?:ruff\s+check|cargo\s+clippy|go\s+vet|golangci-lint\s+run|eslint|flake8|pylint"
                       r"|make\s+lint|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?lint)\b"),
}
GIZLI = "[GİZLİ]"
GIZLI_DEGERLER = (
    (re.compile(r"(?i)\b(bearer|basic|token)(\s+)(?!\$)[A-Za-z0-9._~+/=-]{12,}"), rf"\1\2{GIZLI}"),
    (re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|glpat-[\w-]{20,}|sk-[\w-]{20,}"
                r"|xox[abpr]-[\w-]{10,}|AKIA[0-9A-Z]{16})\b"), GIZLI),
    (re.compile(r"(?i)\b([\w.-]*(?:password|passwd|parola|secret|token|api[_-]?key)[\w.-]*\s*[=:]\s*)"
                r"(?![\"']?\$)(\"[^\"]*\"|'[^']*'|[^\s'\"]+)"), rf"\1{GIZLI}"),
)
# Kendiliğinden onaylanmaması gerekenler: boru, yönlendirme, zincir, alt kabuk, yorum, ağ, yetki ve silme
# komutları ve maskelenmiş (artık gerçek olmayan) satırlar.
TEHLIKELI = re.compile(
    r"[|;&<>`$\\\n#]|\b(curl|wget|nc|ncat|scp|ssh|rsync|sudo|rm|chmod|chown|dd|eval)\b|" + re.escape(GIZLI)
)


@dataclass
class Analiz:
    kok: str
    ad: str = ""
    diller: list[str] = field(default_factory=list)
    paket_yoneticisi: str | None = None
    cerceveler: list[str] = field(default_factory=list)
    komutlar: dict[str, str] = field(default_factory=dict)
    test_deseni: str | None = None
    tek_test: str | None = None  # tek testi çalıştırma kalıbı (yer tutucular İngilizce: kod geleneği)
    ci: dict[str, list[str]] = field(default_factory=dict)
    ci_alt_dizin: list[str] = field(default_factory=list)  # `working-directory` kullanan CI dosyaları
    make_hedefleri: list[str] = field(default_factory=list)
    ajan_dosyalari: list[str] = field(default_factory=list)
    beceriler: list[str] = field(default_factory=list)
    notlar: list[str] = field(default_factory=list)

    def sozluk(self) -> dict:
        return asdict(self)


def gizle(metin: str) -> str:
    """Komut satırındaki parola, belirteç ve API anahtarlarını [GİZLİ] ile değiştirir (`$DEGISKEN` kalır)."""
    for kalip, yerine in GIZLI_DEGERLER:
        metin = kalip.sub(yerine, metin)
    return metin


def guvenli_komut(komut: str) -> bool:
    """Ajana kendiliğinden onaylatılabilecek yalın komut mu (`pnpm test`, `cargo clippy ...`)?"""
    return bool(komut.strip()) and len(komut) < 100 and komut.isprintable() and not TEHLIKELI.search(komut)


def _ad(deger: object) -> str:
    """Paket adı: yalnız yazdırılabilir karakterler, en fazla 80 (terminale ve AGENTS.md'ye gider)."""
    if not isinstance(deger, str):
        return ""
    return " ".join("".join(ch if ch.isprintable() else " " for ch in deger).split())[:80]


def _oku(yol: Path) -> str:
    try:
        return yol.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _sozluk(veri: dict, anahtar: str) -> dict:
    deger = veri.get(anahtar)
    return deger if isinstance(deger, dict) else {}


def _ekle(a: Analiz, tur: str, komut: str | None) -> None:
    """Daha güvenilir kaynak önce yazar; sonradan gelen varsayılan, var olanı ezmez."""
    if komut and tur not in a.komutlar:
        a.komutlar[tur] = komut


def ci_komutlari(metin: str) -> list[str]:
    """GitHub Actions `run:` (tek satır ya da `|` bloğu) ve GitLab `script:` listelerindeki komutlar.

    Tam bir YAML ayrıştırıcısı değildir; girintiye bakan küçük bir okuyucudur (stdlib'de YAML yok).
    GitLab'ın `- |` maddeleri ve `\\` ile süren satırlar birleştirilir; gizli değerler maskelenir.
    """
    komutlar: list[str] = []
    blok: tuple[str, int] | None = None  # ("run" | "script", anahtarın girintisi)
    madde: int | None = None  # GitLab'da `- |` ile açılan çok satırlı maddenin girintisi
    for satir in metin.splitlines():
        if not satir.strip() or satir.lstrip().startswith("#"):
            continue
        girinti = len(satir) - len(satir.lstrip())
        if blok and girinti > blok[1]:
            icerik = satir.strip()
            if blok[0] == "run" or (madde is not None and girinti > madde):
                komutlar.append(icerik)
                continue
            madde = None
            if icerik.startswith("- "):
                deger = icerik[2:].strip()
                if deger in ("|", ">", "|-", ">-"):
                    madde = girinti
                else:
                    komutlar.append(_duz_deger(deger))
            continue
        blok, madde = None, None
        eslesme = re.match(r"\s*(?:-\s*)?(run|script):\s*(.*)$", satir)
        if not eslesme:
            continue
        deger = eslesme.group(2).strip()
        if deger in ("|", ">", "|-", ">-") or (deger == "" and eslesme.group(1) == "script"):
            blok = (eslesme.group(1), girinti)  # boş `run:` GitHub'da `defaults.run` eşlemesidir, komut değil
        elif deger.startswith("["):
            komutlar += [x.strip(" '\"") for x in deger.strip("[]").split(",") if x.strip()]
        else:
            komutlar.append(_duz_deger(deger))
    birlesik: list[str] = []
    for komut in komutlar:
        if birlesik and birlesik[-1].endswith("\\"):
            birlesik[-1] = f"{birlesik[-1][:-1].rstrip()} {komut}"
        else:
            birlesik.append(komut)
    # Yazdırılamayan karakterler (sekme, görünmez Unicode, terminal kaçışları) boşluk olur.
    return [gizle("".join(ch if ch.isprintable() else " " for ch in k)) for k in birlesik if k]


def _duz_deger(deger: str) -> str:
    """Tek satırlık YAML değeri: tırnaklıysa tırnakları, tırnaksızsa ` # yorum` kısmını atar."""
    if len(deger) >= 2 and deger[0] == deger[-1] and deger[0] in "'\"":
        return deger[1:-1]
    return re.sub(r"\s+#.*$", "", deger)


def _ci(kok: Path, a: Analiz) -> None:
    dosyalar = sorted((kok / ".github" / "workflows").glob("*.y*ml")) + [kok / ".gitlab-ci.yml"]
    for dosya in dosyalar:
        if dosya.is_file():
            metin, ad = _oku(dosya), dosya.relative_to(kok).as_posix()
            a.ci[ad] = ci_komutlari(metin)[:30]
            if re.search(r"^\s*working-directory:", metin, re.M):
                a.ci_alt_dizin.append(ad)


def _node(kok: Path, a: Analiz) -> None:
    paket = kok / "package.json"
    if not paket.is_file():
        return
    try:
        veri = json.loads(_oku(paket))
    except ValueError:
        a.notlar.append("package.json okunamadı (geçersiz JSON)")
        return
    if not isinstance(veri, dict):
        a.notlar.append("package.json okunamadı (JSON nesnesi değil)")
        return
    a.diller.append("typescript" if (kok / "tsconfig.json").is_file() else "javascript")
    a.ad = a.ad or _ad(veri.get("name"))
    kilitler = {"pnpm-lock.yaml": "pnpm", "yarn.lock": "yarn", "bun.lockb": "bun", "bun.lock": "bun",
                "package-lock.json": "npm"}
    alan = veri.get("packageManager")
    pm = alan.split("@")[0].strip() if isinstance(alan, str) else ""
    if pm and pm not in CALISTIR:
        a.notlar.append(f"packageManager tanınmadı ({pm[:30]}); kilit dosyasına bakıldı")
        pm = ""
    pm = pm or next((y for dosya, y in kilitler.items() if (kok / dosya).is_file()), "npm")
    a.paket_yoneticisi = a.paket_yoneticisi or pm
    bagimliliklar = {**_sozluk(veri, "dependencies"), **_sozluk(veri, "devDependencies")}
    a.cerceveler += [c for c in NODE_CERCEVELER if c in bagimliliklar]
    calistir = CALISTIR[pm]
    betikler = {ad: govde for ad, govde in _sozluk(veri, "scripts").items() if isinstance(govde, str)}

    def betik(*adlar: str) -> str | None:
        ad = next((x for x in adlar if x in betikler and "no test specified" not in betikler[x]), None)
        return f"{calistir} {ad}" if ad else None

    _ekle(a, "kurulum", "npm ci" if pm == "npm" and (kok / "package-lock.json").is_file() else f"{pm} install")
    _ekle(a, "gelistirme", betik("dev", "start", "serve"))
    _ekle(a, "derleme", betik("build"))
    _ekle(a, "test", betik("test", "test:unit"))
    _ekle(a, "lint", betik("lint", "lint:check"))
    # Yalnız denetleyen betik: "format" ve "prettier" çoğu depoda dosyaları yeniden yazar, denetim değildir.
    _ekle(a, "bicim", betik("format:check", "fmt:check", "prettier:check", "check-format", "format-check"))
    tip = betik("typecheck", "type-check", "tsc", "check-types")
    if not tip and "typescript" in bagimliliklar:
        tip = "npx tsc --noEmit"
    _ekle(a, "tip", tip)
    if "vitest" in bagimliliklar:
        a.test_deseni, a.tek_test = "*.test.ts, *.spec.ts", "npx vitest run <path> -t '<test-name>'"
    elif "jest" in bagimliliklar:
        a.test_deseni, a.tek_test = "*.test.js, *.spec.js", "npx jest <path> -t '<test-name>'"
    else:
        a.test_deseni, a.tek_test = a.test_deseni or "*.test.js", a.tek_test or "node --test <path>"


def _python(kok: Path, a: Analiz) -> None:
    pyproject = kok / "pyproject.toml"
    gereksinimler = sorted(kok.glob("requirements*.txt"))
    if not pyproject.is_file() and not gereksinimler and not (kok / "setup.py").is_file():
        return
    a.diller.append("python")
    metin = " ".join(_oku(g) for g in gereksinimler).lower()
    araclar: set[str] = set()
    if pyproject.is_file():
        try:
            veri = tomllib.loads(_oku(pyproject))
        except tomllib.TOMLDecodeError:
            veri = {}
            a.notlar.append("pyproject.toml okunamadı (geçersiz TOML)")
        metin += json.dumps(veri, default=str).lower()  # TOML tarihleri JSON'a doğrudan girmez
        araclar = set(_sozluk(veri, "tool"))
        a.ad = a.ad or _ad(_sozluk(veri, "project").get("name"))
    yonetici = "uv" if (kok / "uv.lock").is_file() else "poetry" if (kok / "poetry.lock").is_file() else "pip"
    a.paket_yoneticisi = a.paket_yoneticisi or yonetici
    on = {"uv": "uv run ", "poetry": "poetry run ", "pip": ""}[yonetici]
    a.cerceveler += [c for c in PY_CERCEVELER if re.search(rf"\b{c}\b", metin)]
    if (kok / "requirements.txt").is_file():
        istek = "requirements.txt"
    else:  # yalnız requirements-dev.txt gibi bir dosya varsa onu kur
        istek = gereksinimler[0].name if gereksinimler else ""
    kurulum = {"uv": "uv sync", "poetry": "poetry install", "pip": f"pip install -r {istek}"}[yonetici]
    _ekle(a, "kurulum", kurulum if istek or yonetici != "pip" else "pip install -e .")
    pytest_var = "pytest" in a.cerceveler or "pytest" in araclar
    _ekle(a, "test", f"{on}pytest -q" if pytest_var else f"{on}python -m unittest discover")
    _ekle(a, "lint", f"{on}ruff check ." if "ruff" in a.cerceveler or "ruff" in araclar else None)
    if "ruff" in a.cerceveler or "ruff" in araclar:
        _ekle(a, "bicim", f"{on}ruff format --check .")
    elif "black" in a.cerceveler or "black" in araclar:
        _ekle(a, "bicim", f"{on}black --check .")
    _ekle(a, "tip", f"{on}mypy ." if "mypy" in a.cerceveler or "mypy" in araclar else None)
    if not a.test_deseni:
        a.test_deseni = "tests/test_*.py"
        tek = "pytest <path>::<test_name> -q" if pytest_var else "python -m unittest <module.Class.test>"
        a.tek_test = on + tek


def _go(kok: Path, a: Analiz) -> None:
    gomod = kok / "go.mod"
    if not gomod.is_file():
        return
    a.diller.append("go")
    modul = re.search(r"^module\s+(\S+)", _oku(gomod), re.M)
    a.ad = a.ad or (_ad(modul.group(1).rsplit("/", 1)[-1]) if modul else "")
    surum = re.search(r"^go\s+(\S+)", _oku(gomod), re.M)
    if surum:
        a.notlar.append(f"go.mod Go sürümü: {surum.group(1)}")
    a.paket_yoneticisi = a.paket_yoneticisi or "go"
    for tur, komut in (("kurulum", "go mod download"), ("derleme", "go build ./..."), ("test", "go test ./..."),
                       ("lint", "go vet ./..."), ("bicim", "test -z \"$(gofmt -l .)\"")):
        _ekle(a, tur, komut)
    if (kok / ".golangci.yml").is_file() or (kok / ".golangci.yaml").is_file():
        a.komutlar["lint"] = "golangci-lint run"
    a.test_deseni = a.test_deseni or "*_test.go"
    a.tek_test = a.tek_test or "go test ./<pkg> -run '^TestName$'"


def _rust(kok: Path, a: Analiz) -> None:
    cargo = kok / "Cargo.toml"
    if not cargo.is_file():
        return
    a.diller.append("rust")
    try:
        veri = tomllib.loads(_oku(cargo))
    except tomllib.TOMLDecodeError:
        veri = {}
        a.notlar.append("Cargo.toml okunamadı (geçersiz TOML)")
    a.ad = a.ad or _ad(_sozluk(veri, "package").get("name"))
    if "workspace" in veri:
        a.notlar.append("Cargo çalışma alanı (workspace): komutlara --workspace eklemeyi düşünün")
    a.paket_yoneticisi = a.paket_yoneticisi or "cargo"
    for tur, komut in (("kurulum", "cargo fetch"), ("derleme", "cargo build"), ("test", "cargo test"),
                       ("lint", "cargo clippy --all-targets -- -D warnings"), ("bicim", "cargo fmt --check")):
        _ekle(a, tur, komut)
    a.test_deseni = a.test_deseni or "#[cfg(test)] mod tests, tests/*.rs"
    a.tek_test = a.tek_test or "cargo test <test_name>"


def _make(kok: Path, a: Analiz) -> None:
    for ad in ("Makefile", "makefile", "GNUmakefile"):
        if (kok / ad).is_file():
            hedefler = re.findall(r"^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?!=)", _oku(kok / ad), re.M)
            a.make_hedefleri = sorted(set(hedefler))
            break
    eslesme = {"test": ("test", "check"), "lint": ("lint",), "bicim": ("fmt", "format"), "derleme": ("build",)}
    for tur, adlar in eslesme.items():
        hedef = next((h for h in adlar if h in a.make_hedefleri), None)
        if hedef:
            a.komutlar[tur] = f"make {hedef}"  # Makefile ekibin ortak giriş noktasıdır: dil varsayılanını ezer


def _ci_komutlari_one_al(a: Analiz) -> None:
    """CI'de koşan test komutu, tahmin ettiğimizden daha güvenilirdir; yeter ki yalın bir komut olsun."""
    # Alt klasörde koşan (working-directory) bir işin komutu depo kökünün komutu değildir.
    tum = [k for dosya, liste in a.ci.items() if dosya not in a.ci_alt_dizin for k in liste]
    for tur, kalip in CI_KALIPLARI.items():
        aday = next((k for k in tum if guvenli_komut(k) and kalip.match(k)), None)  # önce uzunluk sınırı
        if aday and not a.komutlar.get(tur, "").startswith("make "):
            a.komutlar[tur] = aday


def analiz_et(kok: str | Path) -> Analiz:
    kok = Path(kok).resolve()
    if not kok.is_dir():
        raise FileNotFoundError(f"Depo klasörü bulunamadı: {kok}")
    a = Analiz(kok=str(kok))
    _ci(kok, a)
    for tespit in (_node, _python, _go, _rust, _make):
        tespit(kok, a)
    _ci_komutlari_one_al(a)
    a.ajan_dosyalari = [d for d in AJAN_DOSYALARI if (kok / d).exists()]
    if (kok / ".cursor" / "rules").is_dir():
        a.ajan_dosyalari.append(".cursor/rules/")
    for dizin in BECERI_DIZINLERI:
        a.beceriler += sorted(p.parent.relative_to(kok).as_posix() for p in (kok / dizin).glob("*/SKILL.md"))
    if (kok / ".env").is_file():
        a.notlar.append(".env dosyası var: ajanların okumasını güvenlik kancasıyla engelleyin")
    if (kok / ".mcp.json").is_file():
        a.notlar.append(".mcp.json var: proje MCP sunucuları kendiliğinden çalışabilir; `denetle` ile inceleyin")
    if not a.diller:
        a.notlar.append("Bilinen bir yığın bulunamadı; komutları ekip olarak elle doldurun")
    a.komutlar = {t: a.komutlar[t] for t in KOMUT_TURLERI if t in a.komutlar}
    a.ad = a.ad or kok.name
    return a


def rapor(a: Analiz) -> str:
    satirlar = [f"Depo: {a.kok} ({a.ad})", f"Diller: {', '.join(a.diller) or '-'}",
                f"Paket yöneticisi: {a.paket_yoneticisi or '-'}", f"Çerçeve/araçlar: {', '.join(a.cerceveler) or '-'}",
                "Komutlar:"]
    satirlar += [f"  {tur:<11} {a.komutlar.get(tur, '(tespit edilemedi)')}" for tur in KOMUT_TURLERI]
    satirlar.append(f"Test deseni: {a.test_deseni or '-'} | tek test: {a.tek_test or '-'}")
    for dosya, komutlar in a.ci.items():
        satirlar.append(f"CI {dosya}: {'; '.join(komutlar[:6]) or '-'}")
    satirlar.append(f"Ajan dosyaları: {', '.join(a.ajan_dosyalari) or '-'}")
    satirlar.append(f"Mevcut beceriler: {', '.join(a.beceriler) or '-'}")
    satirlar += [f"Not: {n}" for n in a.notlar]
    return "\n".join(satirlar)
