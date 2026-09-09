package com.vimai.maimai;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Theme must be applied BEFORE AppCompatActivity.onCreate, otherwise the
        // launch/post-splash theme (AppTheme → DarkActionBar) inflates a native
        // ActionBar titled "Maimai" with an indeterminate progress strip.
        // BridgeActivity also calls setTheme(NoActionBar), but only AFTER super.onCreate
        // — too late to prevent ActionBar creation.
        setTheme(R.style.AppTheme_NoActionBar);

        // Request non-overlay layout before Capacitor bridge inflates the WebView.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.parseColor("#fdf2f8"));

        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
    }
}
