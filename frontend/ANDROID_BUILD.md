# Alister Bank — Android APK Build Guide

The Android app is a Capacitor wrapper around the same React frontend that runs on
Cloudflare. **Nothing about the website changes** — the APK is built from a separate
`.env.production.mobile` env and the native layer only activates inside the app
(`Capacitor.isNativePlatform()` guards everywhere).

## Prerequisites (your local machine — NOT the server)

- Node 20+, Java 17 (JDK), Android Studio (or just the Android SDK + `ANDROID_HOME`)
- One-time: clone the repo and `cd frontend && npm install`

## 1. Build the web assets for the mobile app

```bash
cd frontend
# API URL is baked in at build time; points the APK at the live AWS backend
VITE_API_URL=https://api.alisterbank.online/api npm run build
npx cap sync android
```

## 2. Create the signing keystore (FIRST TIME ONLY — keep it forever)

```bash
keytool -genkeypair -v -keystore alister-release.keystore \
  -alias alisterbank -keyalg RSA -keysize 4096 -validity 10000
```

Store `alister-release.keystore` and its passwords somewhere safe (password manager).
**Losing it means you can never publish an update that installs over the old app.**
Do NOT commit the keystore to git.

Then create `android/keystore.properties` (also git-ignored):

```properties
storeFile=/absolute/path/to/alister-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=alisterbank
keyPassword=YOUR_KEY_PASSWORD
```

And add this to `android/app/build.gradle` inside the `android { }` block (one time):

```groovy
def keystoreProps = new Properties()
def keystorePropsFile = rootProject.file("keystore.properties")
if (keystorePropsFile.exists()) {
    keystoreProps.load(new FileInputStream(keystorePropsFile))
}
signingConfigs {
    release {
        if (keystorePropsFile.exists()) {
            storeFile file(keystoreProps['storeFile'])
            storePassword keystoreProps['storePassword']
            keyAlias keystoreProps['keyAlias']
            keyPassword keystoreProps['keyPassword']
        }
    }
}
```

and `signingConfig signingConfigs.release` inside `buildTypes { release { ... } }`.

## 3. Build the signed release APK

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

## 4. Publish the APK on your AWS server

```bash
scp -i ~/Downloads/Alister.pem \
  android/app/build/outputs/apk/release/app-release.apk \
  ubuntu@15.135.139.245:~/bank-test/backend/downloads/AlisterBank.apk
```

The backend serves it at `https://api.alisterbank.online/downloads/AlisterBank.apk`
with the correct `application/vnd.android.package-archive` MIME type. Users get it
from the website's `/download` page.

## 5. Shipping an update

1. Bump `versionCode` (+1) and `versionName` (e.g. `1.1.0`) in `android/app/build.gradle`.
2. Rebuild: step 1 → step 3, upload: step 4.
3. Tell existing apps about it — set on the AWS backend (`.env` + `pm2 restart`):

```bash
APP_LATEST_VERSION=1.1.0
APP_APK_URL=https://api.alisterbank.online/downloads/AlisterBank.apk
APP_FORCE_UPDATE=false   # true = blocking dialog, app unusable until updated
```

The app calls `GET /api/version` on every launch and shows the update dialog
when the installed version is older.

## Security features baked into the APK

| Feature | Where |
|---|---|
| Tokens in Android Keystore-encrypted storage | `src/services/appStorage.js` |
| Biometric login (opt-in, Settings → Security) | `src/services/biometric.js` |
| Root detection — login blocked on rooted devices | `RootCheckPlugin.java` (RootBeer) |
| Screenshot/recents blocking (FLAG_SECURE) | `@capacitor-community/privacy-screen` |
| Auto-lock after 1 min in background | `src/hooks/useSessionTimeout.js` |
| WebView debugging disabled in release | `MainActivity.java` |
| HTTPS-only, system CAs only | `res/xml/network_security_config.xml` |
| No adb/cloud backup of app data | `AndroidManifest.xml` (`allowBackup=false`) |
| Code shrinking + obfuscation | `build.gradle` (`minifyEnabled true`) |
