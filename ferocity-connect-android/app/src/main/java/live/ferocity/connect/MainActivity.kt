package live.ferocity.connect

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private lateinit var token: EditText
    private lateinit var pairButton: Button
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
        setContentView(ScrollView(this).apply { addView(layout) })
        intent?.data?.getQueryParameter("token")?.takeIf { it.isNotBlank() }?.let { token.setText(it) }
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
    }
}
