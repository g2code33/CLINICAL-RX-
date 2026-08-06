# 📱 Building the CLINICAL Rx Android App (Capacitor)

The app is a Vite + React PWA that is also wrapped as a native Android app
with **Capacitor** (`@capacitor/core` + `@capacitor/android`). The native
`android/` project is committed, so opening it in Android Studio is enough.

---

## One-time setup

1. Install **Android Studio** (with the Android SDK).
2. From Android Studio: **SDK Manager** → install
   - *Android SDK Platform 35* (or the version in `android/variables.gradle`)
   - *Android SDK Build-Tools*
   - Accept the licenses when prompted.

---

## Build the app

From the repo root:

```bash
npm install
npm run mobile:build     # vite build + `cap sync android` (copies dist → android)
npm run mobile:open      # opens the android/ folder in Android Studio
```

Or run the whole flow with one command:

```bash
npm run mobile:android
```

In Android Studio:

1. **Open** `android/` (File → Open → select the `android` folder).
2. Wait for Gradle sync to finish.
3. Pick a device/emulator, then **Run ▶** (or *Build → Build App Bundle(s) / APK(s)*).

Your debug APK lands in:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

For a **release APK/AAB** (Play Store / direct install):

```bash
cd android
./gradlew assembleRelease      # unsigned release APK (sign with your keystore)
./gradlew bundleRelease        # Android App Bundle (.aab) for Play Store
```

---

## Updating the app after code changes

```bash
npm run build:web        # rebuild the renderer
npx cap sync android     # copy new web assets + plugins into android/
```

Then re-run in Android Studio. Nothing else changes — the WebView loads the
fresh bundle from `android/app/src/main/assets/public`.

---

## Notes

- **Offline-first**: all data lives in `localStorage`/IndexedDB inside the
  WebView — the Android app works fully offline, same as the web/desktop
  builds.
- **AI keys** are entered in Settings → AI and stored locally (or synced if
  you use a cloud account).
- **Service worker** is intentionally disabled inside Capacitor (a cache-first
  SW would serve stale assets after updates). The app loads straight from the
  bundled assets.
- **App icon + splash** were generated from `resources/icon.png` (512px logo)
  into the `mipmap-*` / `drawable-*` folders. To re-brand, replace
  `resources/icon.png` (1024×1024) and re-run:
  ```bash
  npx @capacitor/assets generate --android
  ```
- **AndroidManifest** already includes the `INTERNET` permission (needed for
  AI calls + optional cloud sync).

---

## Troubleshooting

- *Gradle sync fails on SDK version* → open `android/variables.gradle` and set
  `compileSdkVersion` / `targetSdkVersion` to a platform you have installed.
- *`cap` command not found* → `npm install` first, or use `npx cap ...`.
- *WebView shows blank screen* → run `npm run mobile:build` again (stale
  `android/app/src/main/assets/public` is gitignored and must be re-copied).
