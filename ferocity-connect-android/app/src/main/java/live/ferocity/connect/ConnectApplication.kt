package live.ferocity.connect

import android.app.Application

class ConnectApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        NotificationSupport.createChannel(this)
    }
}
