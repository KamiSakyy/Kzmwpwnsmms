package com.anibeat.app.ui;

import android.app.Activity;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.media3.common.Player;
import androidx.media3.ui.PlayerView;
import androidx.recyclerview.widget.RecyclerView;

import com.anibeat.app.R;
import com.anibeat.app.model.Track;
import com.anibeat.app.player.PlayerController;
import com.anibeat.app.util.Formats;
import com.bumptech.glide.Glide; // если не подключаете Glide — замените на Coil/Picasso
import com.google.gson.Gson;

import java.util.ArrayList;
import java.util.List;

/**
 * Адаптер строки трека (порт TrackRow из веб-версии):
 * обложка → тап = играть; ⋮ = меню действий; активный трек подсвечивается.
 */
public class TrackAdapter extends RecyclerView.Adapter<TrackAdapter.VH> {

    public interface MenuListener { void onMenu(Track track, View anchor); }

    private final List<Track> items = new ArrayList<>();
    private final Activity host;
    private final MenuListener menuListener;
    private PlayerController.Listener listener;

    public TrackAdapter(Activity host, MenuListener menuListener) {
        this.host = host;
        this.menuListener = menuListener;
        setHasStableIds(true);
    }

    @Override public long getItemId(int position) { return items.get(position).id.hashCode(); }

    public void submit(List<Track> list) {
        items.clear();
        if (list != null) items.addAll(list);
        notifyDataSetChanged();
    }

    public List<Track> items() { return items; }

    @NonNull @Override public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_track, parent, false);
        return new VH(v);
    }

    @Override public void onBindViewHolder(@NonNull VH h, int position) {
        Track t = items.get(position);
        h.title.setText(t.title);
        h.meta.setText(t.artistsLine() + " · " + t.anime.name);
        h.tag.setText(t.themeSlug);
        h.tag.setBackgroundResource("OP".equals(t.type) ? R.drawable.tag_op : "ED".equals(t.type) ? R.drawable.tag_ed : R.drawable.tag_in);
        h.nsfw.setVisibility(t.nsfw ? View.VISIBLE : View.GONE);
        h.index.setText(String.valueOf(position + 1));

        Glide.with(host).load(t.coverSmall != null ? t.coverSmall : t.cover).into(h.cover);

        boolean active = PlayerController.get().isCurrent(t.id);
        h.itemView.setBackgroundResource(active ? R.drawable.row_active : R.drawable.row_normal);
        h.equalizer.setVisibility(active ? View.VISIBLE : View.GONE);
        h.playIcon.setVisibility(active ? View.GONE : View.VISIBLE);

        h.itemView.setOnClickListener(v -> PlayerController.get().playTrack(t, items));
        h.more.setOnClickListener(v -> menuListener.onMenu(t, v));
        h.itemView.setOnLongClickListener(v -> { menuListener.onMenu(t, v); return true; });
    }

    @Override public int getItemCount() { return items.size(); }

    static class VH extends RecyclerView.ViewHolder {
        final ImageView cover, playIcon, equalizer;
        final TextView title, meta, tag, index, nsfw;
        final View more;
        VH(@NonNull View v) {
            super(v);
            cover = v.findViewById(R.id.cover);
            playIcon = v.findViewById(R.id.play_icon);
            equalizer = v.findViewById(R.id.equalizer);
            title = v.findViewById(R.id.title);
            meta = v.findViewById(R.id.meta);
            tag = v.findViewById(R.id.tag);
            index = v.findViewById(R.id.index);
            nsfw = v.findViewById(R.id.nsfw);
            more = v.findViewById(R.id.more);
        }
    }
}
