package com.anibeat.app.ui;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.anibeat.app.R;
import com.anibeat.app.api.Api;
import com.anibeat.app.api.MetaApi;
import com.anibeat.app.model.Track;
import com.anibeat.app.player.PlayerController;
import com.google.android.material.chip.ChipGroup;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Главная: период (Сегодня/Неделя/Всё), живая лента новинок,
 * фильтр 18+, случайные темы и миксы (кнопками-пресетами).
 */
public class HomeFragment extends Fragment {

    private TrackAdapter adapter;
    private ProgressBar loading;
    private TextView empty;
    private ChipGroup periodChips, genreChips;
    private boolean allowMature = false;
    private String period = "all";
    private String genre = null;
    private final List<Track> all = new ArrayList<>();

    @Nullable @Override public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_home, container, false);
    }

    @Override public void onViewCreated(@NonNull View v, @Nullable Bundle savedInstanceState) {
        RecyclerView list = v.findViewById(R.id.list);
        loading = v.findViewById(R.id.loading);
        empty = v.findViewById(R.id.empty);
        periodChips = v.findViewById(R.id.period_chips);
        genreChips = v.findViewById(R.id.genre_chips);

        adapter = new TrackAdapter(requireActivity(), (track, anchor) -> TrackMenu.show(requireActivity(), track));
        list.setLayoutManager(new LinearLayoutManager(requireContext()));
        list.setAdapter(adapter);

        periodChips.setOnCheckedStateChangeListener((group, checked) -> {
            if (checked.isEmpty()) return;
            int id = checked.get(0);
            period = id == R.id.chip_today ? "today" : id == R.id.chip_week ? "week" : "all";
            load();
        });

        v.findViewById(R.id.mature_switch).setOnClickListener(x -> {
            allowMature = !allowMature;
            ((com.google.android.material.materialswitch.MaterialSwitch) x).setChecked(allowMature);
            apply();
        });

        v.findViewById(R.id.refresh).setOnClickListener(x -> load());
        v.findViewById(R.id.radio).setOnClickListener(x -> playRadio());
        v.findViewById(R.id.mix_shounen).setOnClickListener(x -> playMix(new String[]{"naruto", "bleach", "jujutsu_kaisen", "kimetsu_no_yaiba", "one_piece"}));
        v.findViewById(R.id.mix_epic).setOnClickListener(x -> playMix(new String[]{"shingeki_no_kyojin", "fullmetal_alchemist_brotherhood", "code_geass_hangyaku_no_lelouch", "vinland_saga", "death_note"}));
        v.findViewById(R.id.mix_chill).setOnClickListener(x -> playMix(new String[]{"toradora", "clannad", "horimiya", "sousou_no_frieren", "k_on"}));
        v.findViewById(R.id.mix_modern).setOnClickListener(x -> playMix(new String[]{"chainsaw_man", "oshi_no_ko", "dandadan", "bocchi_the_rock", "spy_x_family"}));
        v.findViewById(R.id.mix_classic).setOnClickListener(x -> playMix(new String[]{"cowboy_bebop", "neon_genesis_evangelion", "samurai_champloo", "serial_experiments_lain"}));

        buildGenreChips();
        load();
    }

    private void buildGenreChips() {
        String[] labels = {"Экшен", "Фэнтези", "Романтика", "Комедия", "Драма", "Музыка", "Спорт", "Триллер"};
        String[] ids = {"action", "fantasy", "romance", "comedy", "drama", "music", "sports", "thriller"};
        for (int i = 0; i < labels.length; i++) {
            final String id = ids[i];
            com.google.android.material.chip.Chip chip = new com.google.android.material.chip.Chip(requireContext());
            chip.setText(labels[i]);
            chip.setCheckable(true);
            chip.setTag(id);
            chip.setOnClickListener(x -> {
                genre = id.equals(genre) ? null : id;
                apply();
            });
            genreChips.addView(chip);
        }
    }

    private void load() {
        loading.setVisibility(View.VISIBLE);
        empty.setVisibility(View.GONE);
        Api.freshTracks(period, 30, new Api.TracksCb() {
            @Override public void ok(List<Track> tracks) {
                all.clear();
                all.addAll(tracks);
                warmMeta(tracks);
                apply();
            }
            @Override public void fail(String msg) {
                loading.setVisibility(View.GONE);
                empty.setText(msg);
                empty.setVisibility(View.VISIBLE);
            }
        });
    }

    /** Пакетный запрос RU-названий и HD-постеров (как warmMeta в веб-версии). */
    private void warmMeta(List<Track> tracks) {
        List<Integer> ids = new ArrayList<>();
        for (Track t : tracks) if (t.anime.malId != null) ids.add(t.anime.malId);
        MetaApi.load(ids, byMal -> requireActivity().runOnUiThread(() -> {
            for (Track t : tracks) {
                MetaApi.Meta m = byMal.get(t.anime.malId);
                if (m == null) continue;
                if (m.poster != null) t.cover = m.poster;
                if (m.ru != null) t.anime.name = m.ru;
                if (m.genres != null) t.anime.slug = t.anime.slug; // жанры берём из кэша MetaApi при фильтрации
            }
            adapter.notifyDataSetChanged();
        }));
    }

    private void apply() {
        loading.setVisibility(View.GONE);
        List<Track> shown = new ArrayList<>();
        for (Track t : all) {
            if (!com.anibeat.app.util.Formats.passesMature(t, allowMature)) continue;
            MetaApi.Meta m = MetaApi.cached(t.anime.malId);
            String genres = m == null ? null : m.genres;
            if (!com.anibeat.app.util.Formats.matchesGenre(genres, genre)) continue;
            shown.add(t);
        }
        adapter.submit(shown);
        empty.setVisibility(shown.isEmpty() ? View.VISIBLE : View.GONE);
        if (shown.isEmpty()) empty.setText(genre != null ? "Пусто с этим жанром" : "Смените период на «Всё»");
    }

    private void playRadio() {
        Api.randomTracks(40, null, new Api.TracksCb() {
            @Override public void ok(List<Track> tracks) {
                PlayerController.get().playTracks(tracks, 0, false);
                ((MainActivity) requireActivity()).openPlayer();
            }
            @Override public void fail(String msg) { }
        });
    }

    private void playMix(String[] slugs) {
        Api.tracksForSlugs(Arrays.asList(slugs), new Api.TracksCb() {
            @Override public void ok(List<Track> tracks) {
                if (tracks.isEmpty()) return;
                PlayerController.get().playTracks(tracks, 0, true);
                ((MainActivity) requireActivity()).openPlayer();
            }
            @Override public void fail(String msg) { }
        });
    }
}
