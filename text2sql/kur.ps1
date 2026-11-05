# text2sql kurulumu (Windows PowerShell 5.1 ve PowerShell 7). Tekrar tekrar çalıştırılabilir.
#
#   powershell -ExecutionPolicy Bypass -File .\kur.ps1
#   powershell -ExecutionPolicy Bypass -File .\kur.ps1 -Profil slm-sql   (qwen | slm-sql | prem | buyuk; ya da $env:MODEL_PROFIL)
#   powershell -ExecutionPolicy Bypass -File .\kur.ps1 -Ollamasiz        (yalnızca Python kısmı)
#   powershell -ExecutionPolicy Bypass -File .\kur.ps1 -Evet             (soruları "evet" say)
#
# Çıkış kodları: 0 tamam · 10 Python yok/eski · 11 sanal ortam/pip hatası · 12 Ollama yok
#                13 Ollama sunucusu başlamadı · 14 model indirme/oluşturma hatası · 15 örnek veritabanı hatası
#                20 deneme sorusu başarısız · 2 yanlış argüman
# Not: Bu dosya UTF-8 (BOM'lu) kaydedilmiştir; Windows PowerShell 5.1 Türkçe karakterleri ancak böyle doğru okur.

param(
    [string]$Profil = "",
    [switch]$Ollamasiz,
    [switch]$Evet
)

# "Stop" kullanılmaz: Windows PowerShell 5.1, yönlendirilen yerel komut stderr çıktısını hataya çevirir.
# Her yerel komuttan sonra $LASTEXITCODE denetlenir.
$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot -ErrorAction Stop
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

if (-not $Profil) { $Profil = $env:MODEL_PROFIL }
if (-not $Profil) { $Profil = "qwen" }

function Adim([string]$Metin) { Write-Host ""; Write-Host "== $Metin" }
function Hata([string]$Metin, [int]$Kod) { Write-Host "HATA: $Metin" -ForegroundColor Yellow; exit $Kod }
function Sor([string]$Soru) {
    if ($Evet) { return $true }
    $yanit = Read-Host "$Soru [e/H]"
    return ($yanit -match '^(e|evet|y|yes)$')
}

# 1) Python ------------------------------------------------------------------
Adim "1/6 Python denetleniyor"
$PyExe = $null
$PyEk = @()
foreach ($aday in @("py -3", "python", "python3")) {
    $parca = $aday.Split(" ")
    if (-not (Get-Command $parca[0] -ErrorAction SilentlyContinue)) { continue }
    $ek = @($parca | Select-Object -Skip 1)
    # Microsoft Store'un "python" kısayolu gerçek Python değildir; sürüm denetimi bunu da eler.
    & $parca[0] @ek -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>$null
    if ($LASTEXITCODE -eq 0) { $PyExe = $parca[0]; $PyEk = $ek; break }
}
if (-not $PyExe) {
    Hata "Python 3.10 ya da üstü bulunamadı. Kurun: https://www.python.org/downloads/ (kurulumda 'Add python.exe to PATH' seçin) ya da: winget install Python.Python.3.12" 10
}
Write-Host ("Bulundu: " + (& $PyExe @PyEk --version))

# 2) Sanal ortam ve paket -------------------------------------------------------
Adim "2/6 Sanal ortam (.venv) ve paket"
$Py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$T2S = Join-Path $PSScriptRoot ".venv\Scripts\text2sql.exe"
if (Test-Path ".venv") {
    $VenvSaglam = $false
    if (Test-Path $Py) {
        & $Py -m pip --version *> $null
        $VenvSaglam = ($LASTEXITCODE -eq 0)
    }
    if (-not $VenvSaglam) {
        Write-Host "Yarım kalmış .venv bulundu (pip çalışmıyor); silinip yeniden oluşturuluyor."
        Remove-Item -Recurse -Force ".venv"
    }
}
if (-not (Test-Path $Py)) {
    & $PyExe @PyEk -m venv .venv
    if ($LASTEXITCODE -ne 0) { Hata "Sanal ortam oluşturulamadı." 11 }
    & $Py -m pip --version *> $null
    if ($LASTEXITCODE -ne 0) {
        Remove-Item -Recurse -Force ".venv"
        Hata "Sanal ortamda pip yok. Python'u python.org'dan yeniden kurup betiği yeniden çalıştırın." 11
    }
}
$Isaret = Join-Path $PSScriptRoot ".venv\.kurulu"
$Gerekli = (-not (Test-Path $Isaret)) -or ((Get-Item "pyproject.toml").LastWriteTime -gt (Get-Item $Isaret -ErrorAction SilentlyContinue).LastWriteTime)
if ($Gerekli) {
    & $Py -m pip install --quiet --upgrade pip
    if ($LASTEXITCODE -ne 0) { Hata "pip güncellenemedi (internet bağlantısını denetleyin)." 11 }
    & $Py -m pip install --quiet -e .
    if ($LASTEXITCODE -ne 0) { Hata "Paket kurulamadı: pip install -e ." 11 }
    New-Item -ItemType File -Force -Path $Isaret | Out-Null
} else {
    Write-Host "Paket zaten kurulu."
}

function Ayar([string]$Anahtar) {
    $deger = & $Py -m text2sql.config --profil $Profil $Anahtar
    if ($LASTEXITCODE -ne 0) { Hata "Profil tanınmadı: $Profil (qwen, slm-sql, prem, buyuk)" 2 }
    return ($deger | Out-String).Trim()
}
$Model = Ayar "model"
$Base = Ayar "base_model"
$Gguf = Ayar "gguf_path"
$OllamaHost = Ayar "ollama_host"
if ($Base) { $TabanMetni = $Base } else { $TabanMetni = "yerel GGUF ($Gguf)" }
Write-Host "Profil: $Profil · Ollama modeli: $Model · taban: $TabanMetni"

# 3) Örnek veritabanı ----------------------------------------------------------
Adim "3/6 Örnek veritabanı"
& $T2S ornek-db
if ($LASTEXITCODE -ne 0) { Hata "Örnek veritabanı oluşturulamadı." 15 }

if ($Ollamasiz) {
    Adim "Ollama adımları atlandı (-Ollamasiz)"
    & $T2S bilgi --backend sahte
    & $T2S sor --backend sahte --db ornek\dukkan.sqlite "Kaç müşteri var?"
    if ($LASTEXITCODE -ne 0) { Hata "Deneme sorusu çalışmadı." 20 }
    Write-Host ""
    Write-Host "Python kısmı hazır. llama.cpp için: .venv\Scripts\pip install -e "".[gguf]"" (README: Model değiştirme)"
    exit 0
}

# 4) Ollama --------------------------------------------------------------------
Adim "4/6 Ollama denetleniyor"
function Bul-Ollama {
    $c = Get-Command ollama -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $yerel = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"  # winget/kurulum sonrası PATH bu oturumda yenilenmez
    if (Test-Path $yerel) { return $yerel }
    return $null
}
$Ollama = Bul-Ollama
if (-not $Ollama) {
    Write-Host "Ollama kurulu değil. İndirme sayfası: https://ollama.com/download"
    Write-Host "Önerilen komut: winget install Ollama.Ollama"
    if ((Get-Command winget -ErrorAction SilentlyContinue) -and (Sor "winget ile şimdi kurulsun mu?")) {
        winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
        $Ollama = Bul-Ollama
    }
    if (-not $Ollama) { Hata "Ollama kurulduktan sonra bu betiği yeni bir PowerShell penceresinde yeniden çalıştırın." 12 }
}
Write-Host "Bulundu: $Ollama"

function Ollama-Hazir {
    try {
        Invoke-RestMethod -Uri "$OllamaHost/api/version" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop | Out-Null
        return $true
    } catch { return $false }
}
if (-not (Ollama-Hazir)) {
    Write-Host "Ollama sunucusu çalışmıyor; arka planda başlatılıyor."
    Start-Process -FilePath $Ollama -ArgumentList "serve" -WindowStyle Hidden
    for ($i = 0; $i -lt 30; $i++) {
        if (Ollama-Hazir) { break }
        Start-Sleep -Seconds 1
    }
    if (-not (Ollama-Hazir)) { Hata "Ollama sunucusu başlamadı. Başlat menüsünden Ollama'yı açın ya da: ollama serve" 13 }
}
Write-Host "Ollama sunucusu hazır: $OllamaHost"

# 5) Model ---------------------------------------------------------------------
Adim "5/6 Model ($Model)"
if ($Base) {
    & $Ollama show $Base *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Taban model zaten var: $Base"
    } else {
        Write-Host "İndiriliyor: $Base (bir kez; boyut README'deki tabloda)"
        & $Ollama pull $Base
        if ($LASTEXITCODE -ne 0) { Hata "İndirilemedi: $Base" 14 }
    }
} else {
    if (-not (Test-Path $Gguf)) {
        Write-Host "Bu profil yerel bir GGUF dosyası ister: $Gguf"
        Write-Host ("Kaynak: " + (Ayar "gguf_source"))
        Hata "Dosyayı indirip bu yola koyun (ya da TEXT2SQL_GGUF ile yolunu, TEXT2SQL_BASE_MODEL ile bir Ollama etiketi verin), sonra yeniden çalıştırın." 14
    }
    Write-Host "Yerel GGUF: $Gguf"
}
$Metin = (& $Py -m text2sql.config --profil $Profil modelfile_text | Out-String)
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot ".Modelfile.olusan"), $Metin, $Utf8)
# Model aynı Modelfile ile zaten oluşturulduysa atla (yerel GGUF'ta her seferinde GB'larca kopya oluşmasın)
$IsaretAdi = ".olusan-" + ($Model -replace '[^A-Za-z0-9._-]', '_') + ".Modelfile"
$IsaretYolu = Join-Path $PSScriptRoot $IsaretAdi
& $Ollama show $Model *> $null
$ModelVar = ($LASTEXITCODE -eq 0)
if ($ModelVar -and (Test-Path $IsaretYolu) -and ([System.IO.File]::ReadAllText($IsaretYolu) -eq $Metin)) {
    Write-Host "Ollama modeli güncel: $Model"
} else {
    & $Ollama create $Model -f .Modelfile.olusan
    if ($LASTEXITCODE -ne 0) { Hata "ollama create başarısız (Modelfile: .Modelfile.olusan)" 14 }
    [System.IO.File]::WriteAllText($IsaretYolu, $Metin, $Utf8)
}

# 6) Deneme --------------------------------------------------------------------
Adim "6/6 Deneme"
& $T2S bilgi --profil $Profil
Write-Host ""
& $T2S sor --profil $Profil --db ornek\dukkan.sqlite "Kaç müşteri var?"
if ($LASTEXITCODE -ne 0) { Hata "Deneme sorusu çalışmadı. 'text2sql bilgi' çıktısına ve README'deki Sorun giderme bölümüne bakın." 20 }

Write-Host ""
Write-Host "Kurulum tamam. Kullanmak için (ayar değiştirmeden, doğrudan):"
Write-Host "  .\.venv\Scripts\text2sql.exe sor --db ornek\dukkan.sqlite ""İstanbul'daki müşteriler kimler?"""
Write-Host "  .\.venv\Scripts\text2sql.exe sohbet --db ornek\dukkan.sqlite"
Write-Host ""
Write-Host "Kısaca 'text2sql' yazmak için her yeni pencerede ortamı etkinleştirin:"
Write-Host "  cmd'de:         .venv\Scripts\activate.bat"
Write-Host "  PowerShell'de:  .\.venv\Scripts\Activate.ps1"
Write-Host "  (PowerShell 'running scripts is disabled' derse bir kez: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned)"
if ($Profil -ne "qwen") { Write-Host "  (profil seçimi kalıcı olsun diye: `$env:TEXT2SQL_PROFIL = ""$Profil"")" }
exit 0
