package com.anibeat.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.MenuItem;
import android.view.View;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentTransaction;

import com.anibeat.app.R;
import com.anibeat.app.player.PlayerController;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.bottomsheet.BottomSheetDialog;

/**
 * Главная активность: 4 вкладки (Главная / Поиск / Обзор / Медиатека)
 * + мини-плеер поверх таб-бара (как в веб-версии).
 */
public class MainActivity extends AppCompatActivity {

    private MiniPlayerBinder mini;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        BottomNavigationView nav = findViewById(R.id.bottom_nav);
        nav.setOnItemSelectedListener(this::onTab);

        mini = new MiniPlayerBinder(findViewById(R.id.mini_player), this);
        mini.bind();

        if (savedInstanceState == null) show(new HomeFragment());
    }

    private boolean onTab(@NonNull MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.tab_home) show(new HomeFragment());
        else if (id == R.id.tab_search) show(new CatalogFragment().mode(CatalogFragment.MODE_SEARCH));
        else if (id == R.id.tab_browse) show(new CatalogFragment().mode(CatalogFragment.MODE_BROWSE));
        else show(new CatalogFragment().mode(CatalogFragment.MODE_LIBRARY));
        return true;
    }

    private void show(Fragment f) {
        FragmentTransaction tx = getSupportFragmentManager().beginTransaction();
        tx.replace(R.id.container, f);
        tx.commit();
    }

    /** Настройки: bottom-sheet, как в веб-версии. */
    public void openSettings(View anchor) {
        BottomSheetDialog sheet = new BottomSheetDialog(this, R.style.Theme_AniBeat_BottomSheet);
        sheet.setContentView(R.layout.sheet_settings);
        SettingsBinder.bind(sheet, this);
        sheet.show();
    }

    @Override protected void onResume() {
        super.onResume();
        if (mini != null) mini.refresh();
        // при выходе из полноэкранного плеера видео-поток прекращается
        if (!PlayerActivity.isVisible) PlayerController.get().exitVideoMode();
    }

    public void openPlayer() {
        startActivity(new Intent(this, PlayerActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }
}
