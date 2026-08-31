package live.ferocity.connect

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SmsManager
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

class SmsSentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val jobId = intent.getStringExtra("jobId") ?: return
        val (status, code, detail) = when (resultCode) {
            Activity.RESULT_OK -> Triple("sent", null, null)
            SmsManager.RESULT_ERROR_NO_SERVICE -> Triple("failed_retryable", "no_service", "The device has no mobile service.")
            SmsManager.RESULT_ERROR_RADIO_OFF -> Triple("failed_retryable", "radio_off", "The mobile radio is off.")
            SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> Triple("failed_retryable", "device_limit", "Android temporarily limited SMS sending.")
            SmsManager.RESULT_ERROR_FDN_CHECK_FAILURE -> Triple("failed_terminal", "fdn_blocked", "The SIM fixed-dialing policy blocked this recipient.")
            else -> Triple("failed_retryable", "android_$resultCode", "Android could not send the SMS.")
        }
        EventStore(context).enqueue("/api/ferocity-connect/device/jobs/$jobId/status", GatewayService.statusPayload(status, code, detail).toString())
        GatewayServiceStarter.start(context)
    }
}

class SmsDeliveredReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val jobId = intent.getStringExtra("jobId") ?: return
        val payload = if (resultCode == Activity.RESULT_OK) GatewayService.statusPayload("delivered")
            else GatewayService.statusPayload("failed_terminal", "delivery_failed", "The carrier did not confirm delivery.")
        EventStore(context).enqueue("/api/ferocity-connect/device/jobs/$jobId/status", payload.toString())
        GatewayServiceStarter.start(context)
    }
}

class SmsInboundReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!SecureStore(context).isPaired()) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isEmpty()) return
        messages.groupBy { it.originatingAddress ?: "unknown" }.forEach { (sender, parts) ->
            val payload = JSONObject().put("eventId", UUID.randomUUID().toString()).put("sender", sender)
                .put("recipient", JSONObject.NULL).put("body", parts.joinToString("") { it.messageBody.orEmpty() })
                .put("receivedAt", Instant.ofEpochMilli(parts.minOf { it.timestampMillis }).toString())
                .put("subscriptionId", intent.getIntExtra("subscription", -1).takeIf { it >= 0 } ?: JSONObject.NULL)
            EventStore(context).enqueue("/api/ferocity-connect/device/inbound", payload.toString())
        }
        GatewayServiceStarter.start(context)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { if (SecureStore(context).isPaired()) GatewayServiceStarter.start(context) }
}

object GatewayServiceStarter {
    fun start(context: Context) = androidx.core.content.ContextCompat.startForegroundService(context, Intent(context, GatewayService::class.java))
}
