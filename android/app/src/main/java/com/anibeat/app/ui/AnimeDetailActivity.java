package com.anibeat.app.ui;

import android.os.Bundle;
import android.view.View;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.anibeat.app.R;
import com.anibeat.app.api.AnisongDbApi;
import com.anibeat.app.api.Api;
import com.anibeat.app.api.MetaApi;
import com.anibeat.app.model.Track;
import com.anibeat.app.player.PlayerController;
import com.anibeat.app.util.Formats;
import com.bumptech.glide.Glide;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Страница аниме: HD-постер, RU-название, описание, все темы + вставки из доп. источника. */
public class AnimeDetailActivity extends AppCompatActivity {

    public static final String EXTRA_SLUG = "slug";

    private final List<Track> all = new ArrayList<>();
    private TrackAdapter adapter;
    private ProgressBar loading;
    private TextView title, sub, desc, empty;
    private ImageView poster;

    @Override protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_anime_detail);
        String slug = getIntent().getStringExtra(EXTRA_SLUG);
        if (slug == null) { finish(); return; }

        title = findViewById(R.id.title);
        sub = findViewById(R.id.sub);
        desc = findViewById(R.id.description);
        poster = findViewById(R.id.poster);
        loading = findViewById(R.id.loading);
        empty = findViewById(R.id.empty);

        RecyclerView list = findViewById(R.id.list);
        adapter = new TrackAdapter(this, (track, anchor) -> TrackMenu.show(this, track));
        list.setLayoutManager(new LinearLayoutManager(this));
        list.setAdapter(adapter);

        findViewById(R.id.back).setOnClickListener(v -> finish());
        findViewById(R.id.play_all).setOnClickListener(v -> {
            if (all.isEmpty()) return;
            PlayerController.get().playTracks(all, 0, false);
            startActivity(new android.content.Intent(this, PlayerActivity.class));
        });
        findViewById(R.id.shuffle_all).setOnClickListener(v -> {
            if (all.isEmpty()) return;
            PlayerController.get().playTracks(all, 0, true);
            startActivity(new android.content.Intent(this, PlayerActivity.class));
        });

        load(slug);
    }

    private void load(String slug) {
        loading.setVisibility(View.VISIBLE);
        Api.animeDetail(slug, new Api.DetailCb() {
            @Override public void ok(JsonObject anime, List<Track> tracks) {
                all.clear();
                all.addAll(tracks);
                bindHeader(anime);
                adapter.submit(tracks);

                // RU-метаданные + HD-постер
                Integer mal = null;
                for (Track t : tracks) if (t.anime.malId != null) { mal = t.anime.malId; break; }
                if (mal != null) {
                    final Integer malId = mal;
                    MetaApi.load(Arrays.asList(malId), byMal -> runOnUiThread(() -> {
                        MetaApi.Meta m = byMal.get(malId);
                        if (m == null) return;
                        if (m.ru != null) title.setText(m.ru);
                        if (m.poster != null) Glide.with(AnimeDetailActivity.this).load(m.poster).into(poster);
                        if (m.score != null) sub.setText(Formats.kindRu(m.kind) + " · ★ " + String.format(java.util.Locale.US, "%.2f", m.score));
                    }));
                    // Дополнительный источник: вставки и редкие темы (не заменяет основной!)
                    AnisongDbApi.forAnime(malId, Arrays.asList(tracks.isEmpty() ? "" : tracks.get(0).anime.name), new AnisongDbApi.Cb() {
                        @Override public void ok(List<Track> extra) {
                            for (Track t : extra) {
                                boolean dup = false;
                                for (Track e : all) if (e.themeSlug.equals(t.themeSlug) && "IN".equals(t.type) == false) { dup = true; break; }
                                if (!dup) all.add(t);
                            }
                            adapter.submit(all);
                        }
                        @Override public void fail(String msg) { }
                    });
                }
                loading.setVisibility(View.GONE);
                empty.setVisibility(tracks.isEmpty() ? View.VISIBLE : View.GONE);
            }
            @Override public void fail(String msg) {
                loading.setVisibility(View.GONE);
                empty.setText("Ошибка: " + msg);
                empty.setVisibility(View.VISIBLE);
            }
        });
    }

    private void bindHeader(JsonObject anime) {
        title.setText(Api.str(anime, "name"));
        sub.setText(Formats.seasonRu(Api.str(anime, "season")) + " " + (Api.inum(anime, "year") == null ? "" : Api.inum(anime, "year")) + " · " + Api.str(anime, "media_format"));
        String syn = Api.str(anime, "synopsis");
        if (syn != null) desc.setText(syn.replace("[Written by MAL Rewrite]", "").trim());
        Glide.with(this).load(Api.str(anime, "cover")).into(poster);
    }
}
