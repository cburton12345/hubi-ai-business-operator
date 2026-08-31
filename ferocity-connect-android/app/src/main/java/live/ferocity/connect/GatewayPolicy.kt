package live.ferocity.connect

object GatewayPolicy {
    fun retryDelaySeconds(attempt: Int): Long = minOf(300L, (1L shl attempt.coerceIn(0, 6)) * 5L)
    fun canSend(sendingEnabled: Boolean, deviceStatus: String, hasAvailableSim: Boolean) =
        sendingEnabled && deviceStatus in setOf("paired", "active") && hasAvailableSim
    private fun normalizedKeyword(body: String) = body.trim().uppercase().replace(Regex("[.!?,;:]+$"), "").replace(Regex("[\\s_-]+"), " ")
    fun isStopKeyword(body: String) = normalizedKeyword(body) in setOf("STOP", "STOP ALL", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPT OUT", "OPTOUT")
    fun isHelpKeyword(body: String) = normalizedKeyword(body) in setOf("HELP", "INFO", "SUPPORT")
}
