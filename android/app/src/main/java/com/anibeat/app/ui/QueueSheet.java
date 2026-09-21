package com.anibeat.app.ui;

import android.app.Activity;
import android.view.View;
import android.widget.TextView;

import androidx.recyclerview.widget.ItemTouchHelper;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.anibeat.app.R;
import com.anibeat.app.model.Track;
import com.anibeat.app.player.PlayerController;
import com.google.android.material.bottomsheet.BottomSheetDialog;

import java.util.List;

/** Шторка очереди: перетаскивание для смены порядка, удаление, очистка, перемешивание. */
public final class QueueSheet {

    private QueueSheet() { }

    public static void show(Activity host) {
        BottomSheetDialog sheet = new BottomSheetDialog(host, R.style.Theme_AniBeat_BottomSheet);
        sheet.setContentView(R.layout.sheet_queue);

        RecyclerView list = sheet.findViewById(R.id.queue_list);
        TextView counter = sheet.findViewById(R.id.queue_count);
        TrackAdapter adapter = new TrackAdapter(host, (track, anchor) -> { });
        list.setLayoutManager(new LinearLayoutManager(host));
        list.setAdapter(adapter);
        adapter.submit(PlayerController.get().queue());
        counter.setText(String.valueOf(PlayerController.get().queue().size()));

        ItemTouchHelper helper = new ItemTouchHelper(new ItemTouchHelper.SimpleCallback(
                ItemTouchHelper.UP | ItemTouchHelper.DOWN, ItemTouchHelper.END) {
            @Override public boolean onMove(RecyclerView rv, RecyclerView.ViewHolder a, RecyclerView.ViewHolder b) {
                PlayerController.get().move(a.getAdapterPosition(), b.getAdapterPosition());
                adapter.submit(PlayerController.get().queue());
                return true;
            }
            @Override public void onSwiped(RecyclerView.ViewHolder vh, int direction) {
                PlayerController.get().removeAt(vh.getAdapterPosition());
                adapter.submit(PlayerController.get().queue());
                counter.setText(String.valueOf(PlayerController.get().queue().size()));
            }
        });
        helper.attachToRecyclerView(list);

        sheet.findViewById(R.id.queue_clear).setOnClickListener(v -> {
            PlayerController.get().clearQueue();
            sheet.dismiss();
        });
        sheet.findViewById(R.id.queue_shuffle).setOnClickListener(v -> PlayerController.get().toggleShuffle());
        sheet.show();
    }
}
