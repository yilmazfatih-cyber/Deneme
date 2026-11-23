# Ayarlar (ortam değişkenleri)

Depoya `.env` dosyası konmaz; değerler komut satırında, `eas.json`'da ya da CI ayarlarında verilir.

| Değişken                         | Nerede okunur                    | Ne işe yarar                                                                    |
| -------------------------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| `API_URL`                        | `app.config.ts` → `extra.apiUrl` | API adresi. Boş ya da `none` → hesapsız kip (hesap ekranları gizlenir)          |
| `APP_VARIANT`                    | `app.config.ts`                  | `development` → ad "(Geliştirme)" ekli, kimlik `.dev` ekli (iki sürüm yan yana) |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE` | `playwright.config.ts`           | Önceden kurulu Chromium (bu ortamda `/opt/pw-browsers/chromium`)                |
| `MOBIL_API_URL`                  | `test/integration/`              | Gerçek API'ye karşı uygunluk testleri (`npm run e2e:api` kendisi verir)         |
| `EXPO_PUBLIC_USE_RN_FETCH`       | Expo                             | Yalnız bütünleşme testinde `1` (jest-expo'nun sahte fetch'i yerine Node'unki)   |
| `EXPO_OFFLINE`                   | Expo CLI                         | `1` → Expo sunucusuna sormadan çalış (ağ kapalı ortamlar)                       |

## API adresi örnekleri

```bash
# Hesapsız (varsayılan)
npm start

# Telefondan bilgisayardaki API'ye (aynı Wi-Fi; bilgisayarın yerel ağ adresi). API'yi tüm arabirimlerde açın:
#   cd ../uygulama && HOST=0.0.0.0 npm start
API_URL=http://192.168.1.20:8310 npx expo start --clear

# Android öykünücüsünden bilgisayara: 10.0.2.2 (öykünücünün "bilgisayar" adresi; denenmedi)
API_URL=http://10.0.2.2:8310 npx expo start --clear

# Tarayıcıda (npm run web, kaynak http://localhost:8081) API başka kökende: API'ye izin verin
#   cd ../uygulama && ALLOWED_ORIGINS=http://localhost:8081 npm start
API_URL=http://127.0.0.1:8310 npx expo start --web --clear
```

- `API_URL` değişince Expo'yu yeniden başlatın ve `--clear` verin (web derlemesi değeri koda gömer; Metro önbelleği
  eskisini tutabilir).
- Geçersiz değer (`ftp://…`, adres olmayan metin) `app.config.ts`'te Türkçe hatayla durdurur.
- Telefon uygulaması `Origin` başlığı göndermez; API'nin CORS/CSRF ayarı yalnız web derlemesi için gerekir.
