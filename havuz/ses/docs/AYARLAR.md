# Ayarlar (ortam değişkenleri)

Bütün ayarlar ortam değişkeniyle verilir (`.env` dosyası kullanılmaz; sırrı dosyaya yazmayın). Kod:
`ses/ayar.py` — yeni ayar ekleyince bu tabloya da satır ekleyin.

| Değişken | Varsayılan | Ne işe yarar |
| --- | --- | --- |
| `SES_MODEL_DIZINI` | kaynak klasöründen çalışıyorsa `<temel>/modeller`, değilse `~/.cache/havuz-ses/modeller` | İndirilen modellerin klasörü (`.gitignore`'da) |
| `SES_STT_MODELI` | `base` | Varsayılan Whisper boyutu: `tiny`, `base`, `small`, `medium` |
| `SES_TTS_SESI` | `tr_TR-dfki-medium` | Varsayılan Piper sesi (ticari kullanıma kapalı — docs/LISANSLAR.md) |
| `SES_IS_PARCACIGI` | `2` | Model başına CPU iş parçacığı (paylaşımlı makinede düşük tutun) |
| `SES_ADRES` | `127.0.0.1` | Sunucunun dinlediği adres; başka adres API anahtarı ister |
| `SES_KAPI` | `8460` | Sunucu kapısı |
| `SES_SUNUCU_ANAHTARI` | (yok) | Verilirse her API isteği `Authorization: Bearer <anahtar>` ya da `X-API-Key` ister; yoksa yalnız bu bilgisayardan erişilir |
| `SES_IZINLI_KOKENLER` | (yok) | Virgülle ayrılmış köken listesi (ör. `https://uygulamam.example`): tarayıcıdan çağrı + CORS |
| `SES_AZAMI_YUKLEME_MB` | `25` | Yüklenen ses dosyası sınırı (OpenAI ile aynı) |
| `SES_AZAMI_SURE_SN` | `1800` | Yazıya çevrilecek sesin en uzun süresi (30 dk) |
| `SES_ES_ZAMANLI_IS` | `1` | Aynı anda çalışan iş |
| `SES_BEKLEYEN_IS` | `4` | Sırada bekleyebilecek iş; fazlası 503 alır |
| `SES_FFMPEG` | PATH'teki `ffmpeg` | ffmpeg programının yolu (Windows'ta işe yarar) |
| `SES_KATALOG` | `katalog/modeller.yaml` | Başka bir model kataloğu |
| `SES_AG` | (yok) | `1`: ağ isteyen testler ve gidiş-dönüş betiğinde indirme açık |
| `SES_MODEL` | (yok) | `1`: gerçek model isteyen testler (`tests/test_gercek_model.py`) açık |

Örnek (Linux/macOS kabuğu):

```bash
export SES_MODEL_DIZINI="$HOME/ses-modelleri"
export SES_SUNUCU_ANAHTARI="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
.venv/bin/python -m ses sun --adres 0.0.0.0
```

Hugging Face'ten başka araçla (huggingface_hub, `hf download`) indirecekseniz bu ortamda `HF_HUB_DISABLE_XET=1`
verin (Xet aktarımı takılabiliyor). `python -m ses indir` buna gerek duymaz (düz HTTPS).
