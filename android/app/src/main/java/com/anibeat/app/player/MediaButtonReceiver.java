package com.anibeat.app.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.view.KeyEvent;

import androidx.media3.session.MediaSession;

/**
 * Кнопки гарнитуры/Bluetooth (как MediaSession в веб-версии):
 * следующий/предыдущий трек, пауза.
 */
public class MediaButtonReceiver extends BroadcastReceiver {

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) return;
        KeyEvent event = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
        if (event == null || event.getAction() != KeyEvent.ACTION_DOWN) return;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                PlayerController.get().next(false);
                break;
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                PlayerController.get().prev();
                break;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            default:
                PlayerController.get().togglePlay();
                break;
        }
    }
}
