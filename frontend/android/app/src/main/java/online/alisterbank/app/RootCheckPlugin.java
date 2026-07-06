package online.alisterbank.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.scottyab.rootbeer.RootBeer;

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
}
