package online.alisterbank.app;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the custom RootCheck plugin BEFORE super.onCreate so the
        // Capacitor bridge picks it up during initialization.
        registerPlugin(RootCheckPlugin.class);
        super.onCreate(savedInstanceState);

        // ── Banking-app hardening ────────────────────────────────────────────
        // FLAG_SECURE: blocks screenshots, screen recording, and hides app
        // content in the recent-apps switcher. Non-negotiable for banking.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // WebView remote debugging must be OFF in production builds — with it
        // on, anyone with adb access can inspect the session, DOM, and JS heap.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    }
}
