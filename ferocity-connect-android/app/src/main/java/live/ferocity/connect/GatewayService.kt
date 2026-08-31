package live.ferocity.connect

import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.telephony.SmsManager
import kotlinx.coroutines.*
import org.json.JSONObject
import java.util.UUID

class GatewayService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    override fun onCreate() {
        super.onCreate()
        startForeground(4107, NotificationSupport.foreground(this, "Securely waiting for authorized messages"))
        scope.launch { gatewayLoop() }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onDestroy() { scope.cancel(); super.onDestroy() }

    private suspend fun gatewayLoop() {
        val api = ApiClient(this)
        var lastHeartbeat = 0L
        while (currentCoroutineContext().isActive) {
            try {
                flushPending(api)
                if (System.currentTimeMillis() - lastHeartbeat > 60_000) { api.rotateCredentialIfNeeded(); api.heartbeat(); lastHeartbeat = System.currentTimeMillis() }
                api.nextJob()?.let { send(it) }
                delay(5_000)
            } catch (_: Exception) { delay(15_000) }
        }
    }
    private fun flushPending(api: ApiClient) {
        val store = EventStore(this)
        store.pending().forEach { event -> runCatching { api.postEvent(event.path, event.payload); store.acknowledge(event.id) }.onFailure { store.failed(event.id); return } }
    }
    private fun send(job: JSONObject) {
        val jobId = job.getString("id")
        val to = job.getString("recipient")
        val body = job.getString("body")
        val subscriptionId = if (job.isNull("sim_subscription_id")) SmsManager.getDefaultSmsSubscriptionId() else job.getInt("sim_subscription_id")
        @Suppress("DEPRECATION")
        val manager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(SmsManager::class.java).createForSubscriptionId(subscriptionId)
        } else {
            SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
        }
        val parts = manager.divideMessage(body)
        val sent = arrayListOf<PendingIntent?>().apply { repeat(parts.size) { index -> add(if (index == parts.lastIndex) statusIntent(SmsSentReceiver::class.java, jobId, subscriptionId) else null) } }
        val delivered = arrayListOf<PendingIntent?>().apply { repeat(parts.size) { index -> add(if (index == parts.lastIndex) statusIntent(SmsDeliveredReceiver::class.java, jobId, subscriptionId) else null) } }
        EventStore(this).enqueue("/api/ferocity-connect/device/jobs/$jobId/status", statusPayload("sending").toString())
        manager.sendMultipartTextMessage(to, null, parts, sent, delivered)
    }
    private fun statusIntent(receiver: Class<*>, jobId: String, subscriptionId: Int): PendingIntent = PendingIntent.getBroadcast(
        this, jobId.hashCode() xor receiver.hashCode(), Intent(this, receiver).putExtra("jobId", jobId).putExtra("subscriptionId", subscriptionId),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    companion object {
        fun statusPayload(status: String, code: String? = null, detail: String? = null) = JSONObject()
            .put("eventId", UUID.randomUUID().toString()).put("status", status).put("errorCode", code)
            .put("safeError", detail).put("occurredAt", java.time.Instant.now().toString())
    }
}
