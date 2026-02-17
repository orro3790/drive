package com.orro.drive;

import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * MainActivity with edge-to-edge inset handling.
 *
 * Capacitor 8's SystemBars CSS variable injection is broken on Android 15 and below.
 * This native fix applies proper margins to the WebView using WindowInsets.
 *
 * @see https://github.com/ionic-team/capacitor/issues/7951
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyEdgeToEdgeInsets();
    }

    /**
     * Apply system bar insets as margins on the WebView.
     * Capacitor's CSS variable injection is broken on Android 15 and below.
     * Android 16 (API 36+) should handle this automatically via WebView env() support.
     */
    private void applyEdgeToEdgeInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() |
                WindowInsetsCompat.Type.displayCutout() |
                WindowInsetsCompat.Type.ime()
            );

            // Apply margins on API <= 35 (Android 15 and below) where CSS injection is broken.
            // Android 16 (API 36+) reportedly has proper WebView support for env() values.
            if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
                mlp.leftMargin = insets.left;
                mlp.topMargin = insets.top;
                mlp.rightMargin = insets.right;
                mlp.bottomMargin = insets.bottom;
                v.setLayoutParams(mlp);
            }

            return WindowInsetsCompat.CONSUMED;
        });
    }
}
