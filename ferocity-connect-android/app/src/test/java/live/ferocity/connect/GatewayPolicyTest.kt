package live.ferocity.connect

import org.junit.Assert.*
import org.junit.Test

class GatewayPolicyTest {
    @Test fun stopKeywordsAreCaseAndWhitespaceInsensitive() {
        assertTrue(GatewayPolicy.isStopKeyword("  stop "))
        assertTrue(GatewayPolicy.isStopKeyword("Unsubscribe"))
        assertFalse(GatewayPolicy.isStopKeyword("please stop by tomorrow"))
    }
    @Test fun sendingRequiresEverySafetyCondition() {
        assertTrue(GatewayPolicy.canSend(true, "active", true))
        assertFalse(GatewayPolicy.canSend(false, "active", true))
        assertFalse(GatewayPolicy.canSend(true, "paused", true))
        assertFalse(GatewayPolicy.canSend(true, "active", false))
    }
    @Test fun retriesBackOffAndCapAtFiveMinutes() {
        assertEquals(10L, GatewayPolicy.retryDelaySeconds(1))
        assertEquals(300L, GatewayPolicy.retryDelaySeconds(20))
    }
}
