# AniBeat Android (Java)

Нативное Android-приложение — перенос веб-клиента AniBeat 1:1. **Только Java**, минимум 23 API, Material 3 (тёмная монохромная тема), ExoPlayer/Media3, OkHttp.

## Сборка
```bash
# Требуется: Android Studio Ladybug+, Gradle JDK 17, SDK 35
./gradlew assembleDebug        # APK в app/build/outputs/apk/debug/
./gradlew installDebug         # установка на подключённый телефон
```

## Что внутри
| Слой | Классы |
|---|---|
| Сеть | `api/HttpClient` (OkHttp + 40 МБ дисковый кэш + дедуп + ретраи), `api/Api`, `api/AnisongDbApi`, `api/MetaApi` |
| Данные | `model/*`, `db/OfflineStore` (SQLite: офлайн/избранное/история/плейлисты) |
| Плеер | `player/PlayerController`, `player/PlaybackService` (MediaSession), `player/MediaButtonReceiver` |
| UI | `ui/MainActivity`, `HomeFragment`, `CatalogFragment`, `AnimeDetailActivity`, `PlayerActivity`, `TrackAdapter`, `TrackMenu`, `QueueSheet`, `Binders`, `Downloader` |
| Ресурсы | `res/layout/*`, `res/values/*`, `res/drawable/*`, `res/menu/*` |

## Ключевые правила
1. **Видео — только по кнопке.** Аудио-URL используется по умолчанию; при переключении видео позиция не сбрасывается; при сворачивании activity видео-поток останавливается.
2. **Никаких внешних ссылок и упоминаний источников** в UI, строках и шаринге. Адреса в коде хранятся перевёрнутыми (`HttpClient.rev`).
3. **Основной каталог не заменяется** дополнительным источником — только дополняется (вставки, редкие темы).
4. **Монохром:** чёрный фон, белый акцент, никаких градиентов и стекла.

## Дальше
Полное ТЗ, карта «web → android», чек-лист и план второй волны: см. `../ANDROID_PORT.md`.
