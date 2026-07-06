import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration — Alister Bank Android app.
 *
 * - webDir points at the Vite production build (`dist`). Always run
 *   `npm run build && npx cap sync android` before building the APK.
 * - webContentsDebuggingEnabled is FALSE: WebView remote debugging is
 *   disabled so the app cannot be inspected via chrome://inspect in
 *   production builds. Flip to true ONLY temporarily for local debugging.
 * - androidScheme 'https' keeps the WebView origin as https://localhost,
 *   which the backend CORS allowlist explicitly permits.
 */
const config: CapacitorConfig = {
  appId: 'online.alisterbank.app',
  appName: 'Alister Bank',
  webDir: 'dist',
  android: {
    // Never allow WebView debugging in shipped builds (banking-grade).
    webContentsDebuggingEnabled: false,
    // HTTPS only — no cleartext traffic from the WebView.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PrivacyScreen: {
      // FLAG_SECURE: blocks screenshots/screen recording and hides app
      // content in the recent-apps switcher on Android.
      enable: true,
      imageName: '',
    },
  },
};

export default config;
