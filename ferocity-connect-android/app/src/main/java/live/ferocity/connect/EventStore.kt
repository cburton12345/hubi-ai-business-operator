package live.ferocity.connect

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class PendingEvent(val id: Long, val path: String, val payload: String)

class EventStore(context: Context) : SQLiteOpenHelper(context, "ferocity-connect-events.db", null, 1) {
    private val secure = SecureStore(context)
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("create table pending_events(id integer primary key autoincrement,path text not null,payload text not null,created_at integer not null,attempts integer not null default 0)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    fun enqueue(path: String, payload: String) = writableDatabase.insert("pending_events", null, ContentValues().apply {
        put("path", path); put("payload", secure.seal(payload)); put("created_at", System.currentTimeMillis())
    })
    fun pending(limit: Int = 100): List<PendingEvent> = readableDatabase.rawQuery(
        "select id,path,payload from pending_events order by id limit ?", arrayOf(limit.toString())
    ).use { cursor -> buildList { while (cursor.moveToNext()) secure.open(cursor.getString(2))?.let { add(PendingEvent(cursor.getLong(0), cursor.getString(1), it)) } } }
    fun acknowledge(id: Long) { writableDatabase.delete("pending_events", "id=?", arrayOf(id.toString())) }
    fun failed(id: Long) { writableDatabase.execSQL("update pending_events set attempts=attempts+1 where id=?", arrayOf(id)) }
}
