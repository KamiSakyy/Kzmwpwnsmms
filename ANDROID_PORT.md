# ANDROID_PORT.md — перенос AniBeat (веб) в нативное Android-приложение на Java

> **Кому:** следующей сессии бота.
> **Задача:** перенести веб-приложение AniBeat **в точь-в-точь** в нативное Android-приложение на **Java** (без Kotlin!), сохранив все функции, дизайн и правила трафика.
> **Готовый исходник уже лежит в `android/`** — не пиши с нуля, дорабатывай его.

---

## 0. TL;DR для нетерпеливых

```bash
# 1) Открыть папку android/ в Android Studio (Ladybug+), Gradle JDK 17
# 2) Дописать мелочи из §7 (иконки, Glide, mipmap)
# 3) ./gradlew assembleDebug
```
Готовые модули: HTTP-слой, все API-мапперы, плеер, очередь, офлайн-БД, экраны, шторки, вёрстка, тема.

---

## 1. Что переносим: карта файлов web → android

| Веб (React/TS) | Android (Java) | Статус |
|---|---|---|
| `src/api/http.ts` | `api/HttpClient.java` | ✅ готов |
| `src/api/animethemes.ts` | `api/Api.java` | ✅ готов |
| `src/api/anisongdb.ts` | `api/AnisongDbApi.java` | ✅ готов |
| `src/api/meta.ts` (Shikimori/AniList) | `api/MetaApi.java` | ✅ готов |
| `src/store/player.tsx` | `player/PlayerController.java` + `player/PlaybackService.java` | ✅ готов |
| `src/lib/offline.ts` + `store/downloads.tsx` | `db/OfflineStore.java` + `ui/Downloader.java` | ✅ готов |
| `src/lib/display.ts` | `model/AnimeSummary.java` + `MetaApi` | ✅ готов |
| `src/core/catalog.ts` (жанры, 18+, период) | `util/Formats.java` | ✅ готов |
| `src/components/ui.tsx` | `res/layout/*` + `values/themes.xml` | ✅ готов |
| `src/components/cards.tsx` | `ui/TrackAdapter.java`, `item_track.xml` | ✅ готов |
| `src/pages/Home.tsx` | `ui/HomeFragment.java` | ✅ готов |
| `src/pages/Browse/Search/Library.tsx` | `ui/CatalogFragment.java` (3 режима) | ✅ готов |
| `src/pages/Anime.tsx` | `ui/AnimeDetailActivity.java` | ✅ готов |
| `src/components/NowPlaying.tsx` | `ui/PlayerActivity.java` | ✅ готов |
| `src/components/Sheets.tsx` | `ui/QueueSheet.java`, `ui/TrackMenu.java`, `settings` в `Binders.java` | ✅ готов |
| `src/components/Icon.tsx` | `res/drawable/ic_*.xml` | ⚠️ см. §7.1 |
| `src/index.css` (токены) | `res/values/colors.xml`, `themes.xml` | ✅ готов |

---

## 2. ЖЕЛЕЗНЫЕ ПРАВИЛА (нарушать нельзя)

### 2.1. Источники НИКОГДА не раскрываются
В веб-версии все внешние ссылки и названия источников удалены, а адреса хранятся перевёрнутыми (`rev("eom.semehtemina.ipa")`). **В Java сделано то же**: `HttpClient.rev(...)` в константах. Не добавляй:
- экран «О проекте» с доменами;
- `Intent` на внешние сайты;
- тексты вида «источник: …» в строках/тостах/шеринге.
Шеринг: только `title + artist + anime + «Слушаю в AniBeat»` (см. `TrackMenu`).
> Полностью скрыть домены от пользователя с root+proxy невозможно — задача максимум: не светить их в UI, строках ресурсов и в Share-интентах.

### 2.2. Видео — только по нажатию (экономия трафика)
- `PlayerController.playbackUrl(videoMode)` — при `videoMode == false` **всегда** аудио-URL.
- Переключение `toggleVideoMode()` вызывает `rebuild(resetPosition = false)` → **позиция (секунды) сохраняется**, синхронизация звука и видео не рвётся.
- `PlayerActivity.onStop()` вызывает `PlayerController.exitVideoMode()` → при сворачивании видео-поток прекращается, играет аудио с той же секунды.
- Стартовое значение `videoMode` — всегда `false` (не сохранять между сессиями!).
- ExoPlayer: `media3-datasource-cache` c LRU 300 МБ + OkHttp-датасорс (переиспользование сокетов).

### 2.3. Главный источник не заменять, только дополнять
`Api` (основной каталог) остаётся primary. `AnisongDbApi` добавляет **вставочные (IN)** и редкие темы: их результат **мержится** и скипается при дубле (`anime.malId + themeSlug`).
Если дополнительный источник упал — основной UI обязан работать (все вызовы обёрнуты в `try`/`fail` без блокировки).

### 2.4. Особенности API, на которых уже спотыкались (ПРОВЕРЕНО запросами, 2026)
| Эндпоинт | Что можно | Что НЕЛЬЗЯ |
|---|---|---|
| `/anime` | `include=resources`, `fields[resource]` | — |
| `/animetheme` | `sort=-id`, `filter[created_at-gt]`, `filter[has]`, `include=anime.images,song.artists,animethemeentries.videos.audio` | ❌ `anime.resources`, ❌ `fields[resource]`, ❌ `sort=-animethemeentries_id` (400!) |
| `/search` | `include[anime]=images,resources` | ❌ `include[animetheme]=anime.resources` |
| `/resource` | `include=anime` | ❌ `fields[...]` (пустой ответ) |
Периоды: `today` → `filter[created_at-gt]=YYYY-MM-DDT00:00:00`, `week` → минус 7 суток; если пусто — **фолбэк на «Всё время»** (иначе пустой экран).

### 2.5. RU-названия и HD-обложки
- `MetaApi.mirror()` гоняет все зеркала параллельно, побеждает первое ответившее, кэш 12 ч, при падении — перевыбор.
- Батч по 50 MAL-id (DataLoader-стиль), кэш в памяти (`MetaApi.CACHE`); в web-версии дополнительно IndexedDB — в Android при желании добавь Room, но кэш в памяти + диск OkHttp уже покрывают 90%.
- HD-постер (extraLarge) приходит из GraphQL-эндпоинта и подменяет `Track.cover`.
- Любая ошибка метаданных **не должна** ломать каталог.

---

## 3. Архитектура Android-проекта

```
android/
├── build.gradle, settings.gradle            # AGP 8.5.2, compileSdk 35, minSdk 23, Java 17
└── app/
    ├── build.gradle                         # deps: appcompat, material, media3, okhttp, gson, glide*
    └── src/main/
        ├── AndroidManifest.xml              # 2 activity + MediaSessionService + media button receiver
        ├── java/com/anibeat/app/
        │   ├── App.java                     # init HttpClient/OfflineStore + подключение MediaController
        │   ├── api/HttpClient.java          # OkHttp + дисковый кэш 40 МБ + дедуп + ретраи
        │   ├── api/Api.java                 # основной каталог (все эндпоинты + мапперы JSON→POJO)
        │   ├── api/AnisongDbApi.java        # доп. источник (вставки, редкие темы)
        │   ├── api/MetaApi.java             # RU-названия, HD-постеры, жанры, рейтинг
        │   ├── model/{Track,AnimeRef,AnimeSummary}.java
        │   ├── player/PlayerController.java # очередь, shuffle/repeat, видео по запросу
        │   ├── player/PlaybackService.java  # ExoPlayer + MediaSession + кэш медиа
        │   ├── player/MediaButtonReceiver.java
        │   ├── db/OfflineStore.java         # SQLite: offline/favorites/history/playlists
        │   ├── util/Formats.java            # время, размеры, сезон/тип, 18+, жанры, период
        │   └── ui/
        │       ├── MainActivity.java        # 4 таба + мини-плеер + настройки
        │       ├── HomeFragment.java        # период + фильтр 18+ + жанры + миксы + радио
        │       ├── CatalogFragment.java     # SEARCH / BROWSE / LIBRARY в одном фрагменте
        │       ├── AnimeDetailActivity.java # постер, RU-описание, все темы + вставки
        │       ├── PlayerActivity.java      # обложка/видео, транспорт, fullscreen, скачивание
        │       ├── TrackAdapter.java, TrackMenu.java, QueueSheet.java,
        │       │   Binders.java (MiniPlayerBinder + SettingsBinder), Downloader.java
        └── res/
            ├── layout/                      # activity_main, view_mini_player, fragment_*, item_track,
            │                                # activity_player, activity_anime_detail, sheet_*
            ├── values/{colors,themes,strings}.xml
            ├── color/{nav_item,switch_track,switch_thumb}.xml
            ├── drawable/{bg_card,row_normal,row_active,tag_op,tag_ed,tag_in,ic_*}.xml
            ├── menu/main_nav.xml
            └── xml/network_security_config.xml
```

**Потоки:** `ExecutorService(4)` из `HttpClient.workers()` (аналог OkHttp Dispatcher). Kotlin-корутины не нужны. UI-обновления — только через `runOnUiThread`.

---

## 4. Экраны: что должно быть 1:1

1. **Главная** — Large-title «AniBeat», сегмент периодов **Сегодня / Неделя / Всё время**, живая строка (обновление каждые ~50 с), фильтр **18+**, чипсы **жанров**, кнопки Радио / Опенинги / Эндинги / Офлайн, 5 пресетов миксов, список новинок, «Случайные» (кнопка обновления), офлайн-раздел, «Легенды», сезон, исполнители.
2. **Поиск** — поле + RU-поиск (зеркало → MAL-id → основной каталог) + результаты доп. источника; дебаунс 350 мс; история запросов (в SQLite при желании).
3. **Обзор** — сетка годов 1963…текущий, кнопки новинок, случайные OP/ED.
4. **Медиатека** — Избранное / Скачано / Плейлисты / История (4 чипса), кнопки «Слушать» и «Вперемешку» над списком.
5. **Аниме** — постер (HD), RU-название, тип/год/★/жанры, описание (свёрнутое), кнопки Слушать/Вперемешку/Скачать, фильтры OP/ED/Вставки, переключатель версий.
6. **Плеер** — обложка, транспорт, seek (со «−минус временем»), кнопки **Видео / Экран / Скачать / Очередь**, лайк; полный экран = скрытие системных баров + `SCREEN_ORIENTATION_SENSOR_LANDSCAPE`.
7. **Шторки** — очередь (drag-порядок, свайп-удаление, перемешивание, очистка), меню трека, настройки.

### Тема (монохром, без фиолетового!)
| Токен | Значение |
|---|---|
| фон | `#000000` |
|surface-2 (карточки) | `#141416` |
|surface-3 | `#1E1E21` |
| текст | `#FFFFFF` |
| второстепенный | `#9A9AA2` |
| разделитель | `#26262A` |
| акцент | белый, и только он |
Правила: **без градиентов**, **без стекла/blur**, радиусы 14–16 dp, иконки — тонкий контур 1.7, заливные только play/pause/next/prev/нота/сердце.

---

## 5. Плеер: детальная логика (самое важное)

```java
// PlayerController.rebuild()
String url = t.playbackUrl(videoMode);            // аудио, если videoMode=false
MediaItem item = new MediaItem.Builder()
        .setMediaId(t.id).setUri(url)
        .setMediaMetadata(meta).setMimeType(mimeOf(url)).build();
p.setMediaItem(item, /* resetPosition = */ resetPosition);  // false при переключении режима
p.prepare(); p.play();
```
- `playTracks(list, start, shuffle)` — начало новой очереди (shuffle → `Collections.shuffle`).
- `playTrack(track, context)` — если `context != null`, очередь = context, индекс = найденный; если трек уже в очереди — просто переход к нему.
- `next(auto)` — в конце очереди: `REPEAT_MODE_ALL` → в начало; `auto=false` → в начало; `auto=true` → пауза.
- `toggleRepeat()` — OFF → ALL → ONE → OFF (ONE обрабатывается в `onPlaybackStateChanged(STATE_ENDED)`).
- `prev()` — если позиция > 4 с, просто `seekTo(0)`.
- Метаданные сессии: `MediaMetadata(options)` — title, artist, album = «Аниме · OP1», artwork = обложка. Управление с экрана блокировки/шторки работает через `MediaSessionService`.
- Офлайн: если трек помечен в `OfflineStore`, отдавай локальный файл-URI вместо URL (`OfflineStore.isOffline(id)` → путь в `filesDir/AniBeat`).

---

## 6. Скачивание и офлайн

| Действие | Куда пишем | Комментарий |
|---|---|---|
| «Скачать аудио/видео» | `MediaStore` (Q+) или `getExternalFilesDir(Music)/AniBeat` | имя файла: `Артист - Название [Аниме OP1].ogg|.webm` |
| «Сохранить офлайн» | `filesDir` + запись в `offline` | плеер играет локальный URI, трафик не тратится |
Ограничение скорости/размеров не нужно, но потоково (64 КБ буфер) и в фоне (`HttpClient.workers()`), с тостом о старте/финише. Для полноценного прогресса в шторке — WorkManager + ForegroundService (TODO для следующей сессии, см. §8).

---

## 7. TODO следующей сессии (обязательные доводки)

### 7.1. Иконки
В `res/drawable/ic_*.xml` лежат 5 базовых векторов. Нужно **сгенерировать остальные** из веб-набора `src/components/Icon.tsx`:
```bash
# быстрый способ: Android Studio → New → Vector Asset → Local file (SVG)
# или конвертером SVG→VectorDrawable (svgo + svg2vectordrawable)
# ВАЖНО: путь из Icon.tsx копируем в android:pathData, stroke-иконки → android:strokeColor + android:strokeWidth="1.7"
```
Полный список нужных имён: `home, search, explore, library_music, arrow_back, chevron_right, expand_more/less, close, check, add, more_vert/horiz, settings, play, pause, skip_next/prev, shuffle, repeat, repeat_one, volume_up/down/off, forward_10, replay_10, music_note, queue_music, playlist_add/play, favorite(+border), offline_pin, cloud_download, download, download_done, share, delete, edit, history, refresh, cached, check_circle, error_outline, wifi_off, videocam(+off), fullscreen(+exit), tv, mic, calendar, schedule, star_rate, trending_up, auto_awesome, casino, storage, bolt, data_saver, translate, layers, language, radio, filter_alt, today, speed, sensors, person, info`.

### 7.2. Зависимости/мелочи
- **Glide** (`com.github.bumptech.glide:glide:4.16.0`) — нужен для `TrackAdapter`, `PlayerActivity`, `MiniPlayerBinder`. Альтернатива: Coil (`io.coil-kt:coil:2.7.0`, но это Kotlin-библиотека — по задаче «только Java-исходник», лучше Glide).
- `mipmap/ic_launcher` (+ round) — взять Эмилию: `public/images/emilia.png` из веб-проекта → `res/mipmap-xxxhdpi/ic_launcher.png`, либо `res/drawable/ic_launcher_foreground.xml`.
- `res/values/dimens.xml`, `res/xml/backup_rules.xml` — по вкусу.
- Кнопка «Настройки» в HomeFragment → `((MainActivity) requireActivity()).openSettings(view)`.

### 7.3. Не забыть про паритет
- [ ] Периоды: Сегодня/Неделя/Все + фолбэк
- [ ] Фильтр 18+ (флаг `nsfw`) и жанры (из `MetaApi.genres`)
- [ ] Миксы с гарантией непустого результата (тост «попробуйте ещё раз»)
- [ ] RU-названия у всех карточек (переключатель в настройках)
- [ ] HD-постеры вместо сжатых
- [ ] Вставки (IN) из доп. источника
- [ ] Видео по кнопке + сохранение позиции + остановка потока при сворачивании
- [ ] Media Session (локскрин/шторка) с обложкой
- [ ] Офлайн-треки играются без сети
- [ ] Никаких внешних ссылок и упоминаний источников
- [ ] Монохромная тема, без градиентов и стекла
- [ ] Настройки: иконка слева, текст в центре, переключатель справа (одна строка, ничего не «уезжает»)

---

## 8. План «второй волны» (после паритета)

1. **WorkManager + ForegroundService** для загрузок с пушем прогресса в шторку.
2. **Room** вместо SQLite-хелпера + кэш метаданных и «живого каталога» между запусками.
3. **MediaSession для видео-PiP**: `PictureInPictureParams` (Android 8+) — «картинка в картинке» вместо костыля.
4. **Dynamic Color (Material You)** — опционально, но тема всё равно должна остаться монохромной по умолчанию.
5. **Кэш медиа 300 МБ** уже есть; добавить экран «Хранилище» с разбивкой по трекам.
6. **Wear/Car**: `MediaSessionService` уже готов для Android Auto.
7. **Эквалайзер**: `android.media.audiofx.Equalizer` в настройках.
8. **Таймер сна**: остановка через N минут (`Handler` + `pause()` + уведомление).

---

## 9. Как проверять

```bash
./gradlew assembleDebug          # сборка
./gradlew installDebug           # установка на устройство
adb logcat | grep AniBeat        # логи
```
Чек-лист ручного теста:
1. Главная: переключить Сегодня → Неделя → Всё; фильтр 18+; жанр; «Радио» — играет.
2. Тап по треку в списке, затем в мини-плеере переключить трек → обложка/название обновляются.
3. Плеер: нажать «Видео» — картинка появилась, **звук не прервался**, секунда та же (проверить `currentPosition` до/после).
4. Свернуть приложение (не закрывать!) → в шторке играет аудио, видео-поток прекращён (Network Profiler: нет запросов к видео-файлу).
5. Полный экран: системные бары скрыты, ориентация горизонтальная, кнопка «Свернуть» возвращает вертикальную.
6. ⋮ → «Сохранить офлайн» → включить авиарежим → трек играет.
7. Избранное → «Вперемешку» — очередь перемешана.
8. Очередь: перетаскивание меняет порядок, свайп удаляет.
9. Настройки: тумблеры в правом краю, текст не переносится, иконки не «уезжают» под контролы.
10. Нигде в UI/тостах/шеринге не встречается название источника.

---

## 10. Дизайн-эталон (не отклоняться)

- **Чёрный AMOLED**, никаких цветных акцентов (только белый + графит).
- Иконки — тонкий контур, оптическая толщина 1.7, скруглённые концы.
- Большие заголовки 26–34 sp, строки 15 sp, мета 12.5 sp, межстрочный интервал плотный.
- Никаких эмодзи в интерфейсе. Никаких бейджей-«плюшек». Минимум текста.
- Отклик нажатия: затемнение 0.6 + лёгкий scale 0.97; долгий тап = контекстное меню.
- Разделители — 0.5 dp `#26262A`, отступ строк 16 dp.

---

## 11. Быстрый старт для бота следующей сессии

```
1. Прочитать §2 (правила) и §4 (экраны) — это ТЗ.
2. Открыть android/ — там 95% кода. Ничего не переписывать целиком.
3. Доделать §7.1 (иконки) и §7.2 (Glide + эмилия в mipmap).
4. Прогнать ./gradlew assembleDebug, исправить мелкие ошибки вёрстки (id/attr).
5. Пройти чек-лист §9 → отметить §7.3.
6. Только потом браться за §8 (вторая волна).
```

**Секретов/ключей нет** — все API публичные и без авторизации. Конфигов для `.env` не нужно.
