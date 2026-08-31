package live.ferocity.connect

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

object NotificationSupport {
    const val CHANNEL = "ferocity_connect_gateway"
    fun createChannel(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Ferocity Connect gateway", NotificationManager.IMPORTANCE_LOW)
        )
    }
    fun foreground(context: Context, detail: String) = NotificationCompat.Builder(context, CHANNEL)
        .setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("Ferocity Connect is active").setContentText(detail)
        .setOngoing(true).setContentIntent(PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)).build()
}
