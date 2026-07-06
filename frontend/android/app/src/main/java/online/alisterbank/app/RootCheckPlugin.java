package online.alisterbank.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.scottyab.rootbeer.RootBeer;

import android.os.Build;
import android.provider.Settings;

/**
 * Root / jailbreak detection bridge, backed by the RootBeer library.
 * Called from the login page (src/services/biometric.js → isDeviceRooted).
 * On a rooted device the Android Keystore and FLAG_SECURE guarantees do not
 * hold, so the web layer blocks login entirely.
 */
@CapacitorPlugin(name = "RootCheck")
public class RootCheckPlugin extends Plugin {

    @PluginMethod
    public void isRooted(PluginCall call) {
        RootBeer rootBeer = new RootBeer(getContext());
        // check() runs the standard detectors (su binary, test-keys, dangerous
        // props, RW system paths, root management apps) WITHOUT the BusyBox
        // check, which false-positives on some stock OEM ROMs.
        boolean rooted = rootBeer.isRooted();

        JSObject result = new JSObject();
        result.put("rooted", rooted);
        call.resolve(result);
    }

    /**
     * Emulator detection via Build-fingerprint heuristics. Banking sessions
     * should not run inside emulators (Frida/instrumentation risk); the JS
     * layer treats an emulator exactly like a rooted device and blocks login.
     */
    @PluginMethod
    public void isEmulator(PluginCall call) {
        boolean emulator =
            Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.FINGERPRINT.contains("emulator")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MANUFACTURER.contains("Genymotion")
                || Build.HARDWARE.contains("goldfish")
                || Build.HARDWARE.contains("ranchu")
                || Build.PRODUCT.contains("sdk_gphone")
                || Build.PRODUCT.contains("vbox86p")
                || (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"));

        JSObject result = new JSObject();
        result.put("emulator", emulator);
        call.resolve(result);
    }

    /**
     * Developer-options / USB-debugging detection. Like other banking apps,
     * the app refuses to run while Developer Mode is enabled: ADB access
     * allows runtime inspection and input injection that undermine the
     * app's security guarantees. The JS layer shows a blocking screen until
     * the user turns Developer Options off.
     */
    @PluginMethod
    public void isDeveloperModeEnabled(PluginCall call) {
        boolean devOptions = Settings.Global.getInt(
            getContext().getContentResolver(),
            Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1;
        boolean adbEnabled = Settings.Global.getInt(
            getContext().getContentResolver(),
            Settings.Global.ADB_ENABLED, 0) == 1;

        JSObject result = new JSObject();
        result.put("enabled", devOptions || adbEnabled);
        call.resolve(result);
    }
}
