package live.ferocity.connect

import android.Manifest
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONArray
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

class MainActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private lateinit var token: EditText
    private lateinit var pairButton: Button
    private lateinit var scheduleSection: LinearLayout
    private lateinit var recipient: EditText
    private lateinit var messageBody: EditText
    private lateinit var scheduleTime: Button
    private lateinit var scheduleButton: Button
    private lateinit var scheduleStatus: TextView
    private lateinit var upcomingMessages: LinearLayout
    private var selectedSchedule: ZonedDateTime = defaultSchedule()
    private val requiredPermissions = buildList {
        add(Manifest.permission.SEND_SMS); add(Manifest.permission.RECEIVE_SMS); add(Manifest.permission.READ_PHONE_STATE)
        if (android.os.Build.VERSION.SDK_INT >= 26) add(Manifest.permission.READ_PHONE_NUMBERS)
        if (android.os.Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
    }.toTypedArray()
    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { refresh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad) }
        layout.addView(TextView(this).apply { text = "Ferocity Connect"; textSize = 28f })
        layout.addView(TextView(this).apply { text = "Turns this phone and SIM into an authorized Ferocity SMS gateway. Consent, STOP rules, pacing, and workspace controls remain enforced by Ferocity."; textSize = 16f })
        status = TextView(this).apply { setPadding(0, pad, 0, pad); textSize = 17f }
        layout.addView(status)
        token = EditText(this).apply { hint = "One-time pairing token"; inputType = InputType.TYPE_CLASS_TEXT; isSingleLine = true }
        layout.addView(token, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        pairButton = Button(this).apply { text = "Pair this phone"; setOnClickListener { pair() } }
        layout.addView(pairButton)
        layout.addView(Button(this).apply { text = "Grant required permissions"; setOnClickListener { permissions.launch(requiredPermissions) } })
        layout.addView(Button(this).apply { text = "Open Android app settings"; setOnClickListener {
            startActivity(android.content.Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:$packageName")))
        } })
        layout.addView(Button(this).apply { text = "Start / refresh gateway"; setOnClickListener { if (canRun()) GatewayServiceStarter.start(this@MainActivity); refresh() } })
        scheduleSection = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, pad, 0, pad)
            addView(TextView(this@MainActivity).apply { text = "Schedule a text"; textSize = 22f })
            addView(TextView(this@MainActivity).apply {
                text = "Write it now and Ferocity will send it at the right time. Consent, opt-outs, quiet hours, and delivery tracking are checked again before sending."
                textSize = 15f
            })
        }
        recipient = EditText(this).apply {
            hint = "Phone number (+17155551234)"
            inputType = InputType.TYPE_CLASS_PHONE
            isSingleLine = true
        }
        scheduleSection.addView(recipient, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        messageBody = EditText(this).apply {
            hint = "Message"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 3
            maxLines = 8
        }
        scheduleSection.addView(messageBody, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        scheduleTime = Button(this).apply { setOnClickListener { pickSchedule() } }
        scheduleSection.addView(scheduleTime)
        scheduleButton = Button(this).apply { text = "Schedule message"; setOnClickListener { scheduleMessage() } }
        scheduleSection.addView(scheduleButton)
        scheduleStatus = TextView(this).apply { setPadding(0, pad / 2, 0, pad / 2); textSize = 15f }
        scheduleSection.addView(scheduleStatus)
        scheduleSection.addView(TextView(this).apply { text = "Upcoming"; textSize = 20f })
        upcomingMessages = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        scheduleSection.addView(upcomingMessages)
        layout.addView(scheduleSection)
        setContentView(ScrollView(this).apply { addView(layout) })
        intent?.data?.getQueryParameter("token")?.takeIf { it.isNotBlank() }?.let { token.setText(it) }
        refreshScheduleLabel()
        refresh()
    }

    private fun pair() {
        if (!canRun()) { permissions.launch(requiredPermissions); return }
        val pairingToken = token.text.toString().trim()
        if (pairingToken.isBlank()) { status.text = "Enter the one-time token shown in Ferocity."; return }
        pairButton.isEnabled = false
        Thread {
            val result = runCatching { ApiClient(this).pair(pairingToken, "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}") }
            runOnUiThread {
                pairButton.isEnabled = true
                result.onSuccess { token.setText(""); GatewayServiceStarter.start(this); status.text = "Paired. Secure gateway is running." }
                    .onFailure { status.text = "Pairing failed: ${it.message ?: "unknown error"}" }
                refresh()
            }
        }.start()
    }
    private fun canRun() = requiredPermissions.all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }
    private fun refresh() {
        val paired = SecureStore(this).isPaired()
        status.text = when { !canRun() -> "Android still needs SMS, phone/SIM, and notification permission. If SMS remains denied, open Android app settings, allow restricted settings for Ferocity Connect, return here, and tap Grant required permissions again."; paired -> "Paired and ready. Ferocity sends approved work automatically while this phone has power, internet, and mobile service."; else -> "Not paired. Open the one-time pairing link from Ferocity." }
        token.isEnabled = !paired
        pairButton.isEnabled = !paired
        scheduleSection.visibility = if (paired) View.VISIBLE else View.GONE
        if (paired) loadScheduledMessages()
    }

    private fun defaultSchedule(): ZonedDateTime = ZonedDateTime.now().plusDays(1).withHour(8).withMinute(30).withSecond(0).withNano(0)

    private fun refreshScheduleLabel() {
        scheduleTime.text = "Send ${selectedSchedule.format(DateTimeFormatter.ofPattern("EEE, MMM d 'at' h:mm a"))}"
    }

    private fun pickSchedule() {
        val current = selectedSchedule
        DatePickerDialog(this, { _, year, month, day ->
            TimePickerDialog(this, { _, hour, minute ->
                selectedSchedule = ZonedDateTime.of(year, month + 1, day, hour, minute, 0, 0, ZoneId.systemDefault())
                refreshScheduleLabel()
            }, current.hour, current.minute, false).show()
        }, current.year, current.monthValue - 1, current.dayOfMonth).show()
    }

    private fun scheduleMessage() {
        val to = recipient.text.toString().trim().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        val body = messageBody.text.toString().trim()
        if (!to.matches(Regex("^\\+[1-9]\\d{7,14}$"))) {
            scheduleStatus.text = "Use the full phone number with country code, such as +17155551234."
            return
        }
        if (body.isBlank()) { scheduleStatus.text = "Write the message first."; return }
        if (body.length > 1600) { scheduleStatus.text = "Keep the message under 1,600 characters."; return }
        if (!selectedSchedule.toInstant().isAfter(java.time.Instant.now())) {
            scheduleStatus.text = "Choose a future send time."
            return
        }
        scheduleButton.isEnabled = false
        scheduleStatus.text = "Scheduling…"
        Thread {
            val result = runCatching {
                ApiClient(this).scheduleText(to, body, selectedSchedule.toInstant().toString(), ZoneId.systemDefault().id)
            }
            runOnUiThread {
                scheduleButton.isEnabled = true
                result.onSuccess {
                    recipient.setText("")
                    messageBody.setText("")
                    selectedSchedule = defaultSchedule()
                    refreshScheduleLabel()
                    scheduleStatus.text = "Scheduled. Ferocity will recheck safety and authorization before sending."
                    loadScheduledMessages()
                }.onFailure { scheduleStatus.text = "Could not schedule: ${it.message ?: "unknown error"}" }
            }
        }.start()
    }

    private fun loadScheduledMessages() {
        upcomingMessages.removeAllViews()
        upcomingMessages.addView(TextView(this).apply { text = "Loading…" })
        Thread {
            val result = runCatching { ApiClient(this).scheduledTexts() }
            runOnUiThread {
                result.onSuccess { renderScheduledMessages(it) }
                    .onFailure {
                        upcomingMessages.removeAllViews()
                        upcomingMessages.addView(TextView(this).apply { text = "Could not load scheduled texts: ${it.message ?: "unknown error"}" })
                    }
            }
        }.start()
    }

    private fun renderScheduledMessages(messages: JSONArray) {
        upcomingMessages.removeAllViews()
        if (messages.length() == 0) {
            upcomingMessages.addView(TextView(this).apply { text = "Nothing scheduled yet." })
            return
        }
        for (index in 0 until messages.length()) {
            val item = messages.getJSONObject(index)
            val scheduled = runCatching {
                java.time.Instant.parse(item.getString("scheduledFor")).atZone(ZoneId.systemDefault())
                    .format(DateTimeFormatter.ofPattern("EEE, MMM d 'at' h:mm a"))
            }.getOrDefault(item.optString("scheduledFor"))
            upcomingMessages.addView(LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(0, 16, 0, 16)
                addView(TextView(this@MainActivity).apply { text = item.optString("body"); textSize = 16f })
                addView(TextView(this@MainActivity).apply {
                    text = "${item.optString("recipient")} • $scheduled • ${item.optString("status").replace('_', ' ')}"
                    textSize = 13f
                })
                addView(Button(this@MainActivity).apply {
                    text = "Cancel"
                    setOnClickListener { confirmCancel(item.getString("id")) }
                })
            })
        }
    }

    private fun confirmCancel(messageId: String) {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Cancel scheduled text?")
            .setMessage("It will not be sent.")
            .setNegativeButton("Keep", null)
            .setPositiveButton("Cancel text") { _, _ -> cancelMessage(messageId) }
            .show()
    }

    private fun cancelMessage(messageId: String) {
        scheduleStatus.text = "Canceling…"
        Thread {
            val result = runCatching { ApiClient(this).cancelScheduledText(messageId) }
            runOnUiThread {
                result.onSuccess { scheduleStatus.text = "Scheduled text canceled."; loadScheduledMessages() }
                    .onFailure { scheduleStatus.text = "Could not cancel: ${it.message ?: "unknown error"}" }
            }
        }.start()
    }
}
