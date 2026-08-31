package live.ferocity.connect

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

class ApiClient(private val context: Context) {
    private val secure = SecureStore(context)
    private fun baseUrl() = (secure.get("baseUrl") ?: BuildConfig.DEFAULT_API_BASE_URL).trimEnd('/')

    fun pair(pairingToken: String, displayName: String): JSONObject {
        val payload = JSONObject().put("pairingToken", pairingToken).put("displayName", displayName)
            .put("installationFingerprint", installationFingerprint()).put("appVersion", BuildConfig.VERSION_NAME)
            .put("androidVersion", android.os.Build.VERSION.RELEASE ?: "unknown")
            .put("manufacturer", android.os.Build.MANUFACTURER).put("model", android.os.Build.MODEL)
            .put("sims", SimSupport.readSims(context))
        val result = request("POST", "/api/ferocity-connect/device/pair", payload, authenticated = false)
        secure.put("accessToken", result.getString("accessToken"))
        secure.put("deviceId", result.getString("deviceId"))
        secure.put("credentialExpiresAt", result.getString("expiresAt"))
        return result
    }

    fun heartbeat(): JSONObject = request("POST", "/api/ferocity-connect/device/heartbeat", JSONObject()
        .put("appVersion", BuildConfig.VERSION_NAME).put("androidVersion", android.os.Build.VERSION.RELEASE ?: "unknown")
        .put("batteryPercent", DeviceHealth.batteryPercent(context)).put("charging", DeviceHealth.isCharging(context))
        .put("networkType", DeviceHealth.networkType(context)).put("sims", SimSupport.readSims(context)))

    fun nextJob(): JSONObject? {
        val result = request("GET", "/api/ferocity-connect/device/jobs/next", null)
        return if (result.isNull("job")) null else result.getJSONObject("job")
    }
    fun postEvent(path: String, payload: String) = request("POST", path, JSONObject(payload))
    fun postEvent(path: String, payload: JSONObject) = request("POST", path, payload)
    fun rotateCredentialIfNeeded() {
        val expiry = secure.get("credentialExpiresAt")?.let { runCatching { java.time.Instant.parse(it) }.getOrNull() } ?: return
        if (expiry.isAfter(java.time.Instant.now().plus(java.time.Duration.ofDays(7)))) return
        val result = request("POST", "/api/ferocity-connect/device/rotate-credential", JSONObject())
        secure.put("accessToken", result.getString("accessToken"))
        secure.put("credentialExpiresAt", result.getString("expiresAt"))
    }

    private fun request(method: String, path: String, body: JSONObject?, authenticated: Boolean = true): JSONObject {
        val connection = URL(baseUrl() + path).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 10_000
        connection.readTimeout = 35_000
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("Content-Type", "application/json")
        if (authenticated) {
            connection.setRequestProperty("Authorization", "Bearer ${secure.get("accessToken") ?: error("Device is not paired")}")
            connection.setRequestProperty("X-Ferocity-Device-Nonce", UUID.randomUUID().toString())
            connection.setRequestProperty("X-Ferocity-Device-Timestamp", (System.currentTimeMillis() / 1000).toString())
        }
        if (body != null) { connection.doOutput = true; connection.outputStream.use { it.write(body.toString().toByteArray()) } }
        val code = connection.responseCode
        val text = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
        val json = if (text.isBlank()) JSONObject() else JSONObject(text)
        if (code !in 200..299) error(json.optString("error", "Ferocity returned HTTP $code"))
        return json
    }

    private fun installationFingerprint(): String {
        secure.get("installationFingerprint")?.let { return it }
        return UUID.randomUUID().toString().also { secure.put("installationFingerprint", it) }
    }
}

object SimSupport {
    fun readSims(context: Context): JSONArray {
        val output = JSONArray()
        if (androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_PHONE_STATE) != android.content.pm.PackageManager.PERMISSION_GRANTED) return output
        val manager = context.getSystemService(android.telephony.SubscriptionManager::class.java)
        runCatching { manager.activeSubscriptionInfoList.orEmpty() }.getOrDefault(emptyList()).forEach { sim ->
            output.put(JSONObject().put("subscriptionId", sim.subscriptionId).put("slotIndex", sim.simSlotIndex)
                .put("carrierName", sim.carrierName?.toString()).put("phoneNumber", runCatching { sim.number }.getOrNull())
                .put("countryIso", sim.countryIso).put("available", true))
        }
        return output
    }
}

object DeviceHealth {
    fun batteryPercent(context: Context): Int? = context.registerReceiver(null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))?.let {
        val level = it.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1); val scale = it.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) null else level * 100 / scale
    }
    fun isCharging(context: Context): Boolean? = context.registerReceiver(null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))?.let {
        val status = it.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1)
        status == android.os.BatteryManager.BATTERY_STATUS_CHARGING || status == android.os.BatteryManager.BATTERY_STATUS_FULL
    }
    fun networkType(context: Context): String {
        val cm = context.getSystemService(android.net.ConnectivityManager::class.java)
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "offline"
        return when { caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"; caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"; else -> "other" }
    }
}
