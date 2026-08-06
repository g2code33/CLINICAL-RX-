# 📱 Building the CLINICAL Rx Android App (Capacitor)

The app is a Vite + React PWA that is also wrapped as a native Android app
with **Capacitor** (`@capacitor/core` + `@capacitor/android`). The native
`android/` project is committed, so opening it in Android Studio is enough.

---

## 🚀 Easiest way: download the APK from GitHub Releases

Since **v1.4.3**, every push to `main` automatically builds an Android APK
and attaches it to the release:

1. Go to the latest release:
   https://github.com/g2code33/CLINICAL-RX-/releases/latest
2. Download **`clinical-rx-<version>.apk`**
3. Copy it to your phone (or download directly on the phone) and tap it to
   install. Allow *"install unknown apps"* for your browser/file manager.

No Android Studio, no local build needed. ✅

> ⚠️ Without signing secrets the APK is signed with the debug key — installing
> a newer debug-signed APK over an old one requires **uninstalling first**
> (your local data resets). Add the signing secrets (below) to enable proper
> in-place updates.

---

## One-time setup (local builds with Android Studio)

1. Install **Android Studio** (with the Android SDK).
2. From Android Studio: **SDK Manager** → install
   - *Android SDK Platform 36* (or the version in `android/variables.gradle`)
   - *Android SDK Build-Tools*
   - Accept the licenses when prompted.
3. **JDK 21** — Capacitor 8's Android build compiles with Java 21. Android
   Studio's bundled JBR is 21, or set `JAVA_HOME` to a JDK 21 install.

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
- *CI APK is missing from a release* → check the *Build & Release Desktop App*
  run for that push; the Android steps run on the `ubuntu-latest` leg and the
  APK upload prints what it did. Re-push (or re-run the workflow) to retry.

---

## Optional: signed release builds (recommended for updates)

Add these **repository secrets** (Settings → Secrets and variables → Actions)
on GitHub:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 of a PKCS12 keystore |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

When set, CI signs the release APK with that key — stable across versions,
so users can update in place without uninstalling.

Generate a keystore locally (needs a JDK — e.g. via Android Studio's built-in
JBR, or `brew install openjdk` / `apt install openjdk-17-jdk`):

```bash
keytool -genkey -v -keystore clinicalrx-release.jks \
  -alias clinicalrx -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "CHANGE_ME" -keypass "CHANGE_ME" \
  -dname "CN=ClinicalRx, O=ClinicalRx, C=GH"
base64 -w0 clinicalrx-release.jks   # → paste into ANDROID_KEYSTORE_BASE64
```

(For a PKCS12 `.p12` instead of `.jks`, add `-storetype PKCS12` — the CI
expects PKCS12.)
