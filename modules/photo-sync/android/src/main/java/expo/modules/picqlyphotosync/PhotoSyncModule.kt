package expo.modules.picqlyphotosync

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.os.Build
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.util.UUID

/*
 2026.10.18 사진 라이브러리 증분 동기화 네이티브 모듈 (PicQly-T POC에서 이식 by Claude).
 - API 30+: MediaStore version/generation으로 지난 실행 이후 추가·수정된 항목만 조회(audit)
 - 그 이하 또는 권한 변경 시: reconcile/full 로 보고하고 JS 전체 패스로 폴백
 - begin이 checkpoint를 함께 반환해, JS가 전체 패스를 끝낸 경우에도 다음 세션부터 증분 사용 가능
 */
class PhotoSyncModule : Module() {
  private val lock = Any()
  private val sessions = mutableMapOf<String, Session>()
  private val uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI

  private data class Session(
    val assets: Cursor, val ids: Cursor?, val checkpoint: String,
    val stamps: Map<String, Pair<String, Long>>, val access: String,
    var assetsDone: Boolean = false, var idsDone: Boolean = false
  ) {
    fun close() { assets.close(); ids?.close() }
  }

  private fun context(): Context = appContext.reactContext ?: error("Photo context unavailable")

  private fun access(context: Context): String {
    val full = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_IMAGES else Manifest.permission.READ_EXTERNAL_STORAGE
    if (context.checkSelfPermission(full) == PackageManager.PERMISSION_GRANTED) return "full"
    if (Build.VERSION.SDK_INT >= 34 && context.checkSelfPermission(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) == PackageManager.PERMISSION_GRANTED) return "limited"
    error("Photo library access denied")
  }

  private fun stamps(context: Context): Map<String, Pair<String, Long>> {
    if (Build.VERSION.SDK_INT < 30) return emptyMap()
    return MediaStore.getExternalVolumeNames(context).sorted().associateWith { volume ->
      Pair(MediaStore.getVersion(context, volume), MediaStore.getGeneration(context, volume))
    }
  }

  private fun encode(access: String, stamps: Map<String, Pair<String, Long>>): String {
    val volumes = JSONObject()
    stamps.forEach { (name, stamp) -> volumes.put(name, JSONObject().put("version", stamp.first).put("generation", stamp.second)) }
    return JSONObject().put("schema", 1).put("platform", "android").put("access", access).put("volumes", volumes).toString()
  }

  private fun session(handle: String): Session = sessions[handle] ?: error("Unknown photo synchronization session")

  override fun definition() = ModuleDefinition {
    Name("PicQlyPhotoSync")

    AsyncFunction("begin") { saved: String?, limited: Boolean -> synchronized(lock) {
      val context = context()
      val access = access(context)
      val stamps = stamps(context)
      var mode = "full"
      val old = mutableMapOf<String, Pair<String, Long>>()
      if (saved != null) {
        val prior = JSONObject(saved)
        check(prior.getInt("schema") == 1 && prior.getString("platform") == "android") { "Invalid photo synchronization checkpoint" }
        val volumes = prior.getJSONObject("volumes")
        volumes.keys().forEach { name ->
          val entry = volumes.getJSONObject(name)
          old[name] = Pair(entry.getString("version"), entry.getLong("generation"))
        }
        when {
          limited || access != "full" || prior.getString("access") != access -> { mode = "reconcile" }
          Build.VERSION.SDK_INT < 30 -> { mode = "reconcile" }
          stamps.keys != old.keys || stamps.any { (name, stamp) -> old[name]?.first != stamp.first || stamp.second < old.getValue(name).second } -> {
            mode = "reconcile"
          }
          else -> { mode = "audit" }
        }
      }
      val columns = mutableListOf("_id", "datetaken", "date_modified")
      if (Build.VERSION.SDK_INT >= 30) columns.addAll(listOf("volume_name", "generation_added", "generation_modified"))
      val visible = mutableListOf<String>()
      if (Build.VERSION.SDK_INT >= 29) visible.add("is_pending=0")
      if (Build.VERSION.SDK_INT >= 30) visible.add("is_trashed=0")
      val args = mutableListOf<String>()
      val delta = if (mode == "audit") {
        val parts = old.map { (volume, stamp) ->
          args.addAll(listOf(volume, stamp.second.toString(), stamp.second.toString()))
          "(volume_name=? AND (generation_added>? OR generation_modified>?))"
        }
        if (parts.isEmpty()) "0" else "(${parts.joinToString(" OR ")})"
      } else "1"
      val selection = (visible + delta).joinToString(" AND ")
      val assets = context.contentResolver.query(uri, columns.toTypedArray(), selection, args.toTypedArray(), "datetaken DESC, _id DESC")
        ?: error("Photo metadata query returned no cursor")
      try {
        // generation은 추가/수정만 추적하므로 삭제 감지는 전체 ID 집합으로 수행한다.
        val ids = if (mode == "audit") context.contentResolver.query(uri, arrayOf("_id"),
          visible.joinToString(" AND ").ifEmpty { null }, null, null)
          ?: error("Photo ID query returned no cursor") else null
        val handle = UUID.randomUUID().toString()
        val checkpoint = encode(access, stamps)
        sessions[handle] = Session(assets, ids, checkpoint, stamps, access, idsDone = ids == null)
        mapOf("handle" to handle, "mode" to mode,
          /* 2026.10.18 if-else 결과 뒤에 인자가 이어지므로 괄호로 범위를 명확히 by Claude */
          "total" to (if (mode == "audit") null else assets.count),
          /* 2026.10.18 JS가 자체 전체 패스를 끝낸 뒤에도 다음 세션부터 증분이 되도록 체크포인트를 함께 반환 by Claude */
          "checkpoint" to checkpoint)
      } catch (error: Throwable) { assets.close(); throw error }
    } }

    AsyncFunction("read") { handle: String, requested: Int -> synchronized(lock) {
      val state = session(handle)
      val limit = requested.coerceIn(1, 500)
      val assets = mutableListOf<Map<String, Any>>()
      val ids = mutableListOf<String>()
      var consumed = 0
      while (!state.assetsDone && consumed < limit) {
        val cursor = state.assets
        if (!cursor.moveToNext()) { state.assetsDone = true; break }
        val id = cursor.getLong(0)
        val created = if (cursor.isNull(1)) 0.0 else cursor.getDouble(1)
        val modified = if (cursor.isNull(2)) 0.0 else cursor.getDouble(2) * 1000
        val revision = if (Build.VERSION.SDK_INT >= 30) {
          val volume = cursor.getString(3)
          "${volume}:${state.stamps.getValue(volume).first}:${cursor.getLong(4)}:${cursor.getLong(5)}"
        } else modified.toString()
        assets.add(mapOf("id" to id.toString(), "uri" to ContentUris.withAppendedId(uri, id).toString(),
          "creationTime" to created, "modificationTime" to modified, "revision" to revision))
        if (state.ids == null) ids.add(id.toString())
        consumed++
      }
      while (state.assetsDone && !state.idsDone && consumed < limit) {
        val cursor = checkNotNull(state.ids)
        if (!cursor.moveToNext()) { state.idsDone = true; break }
        ids.add(cursor.getLong(0).toString()); consumed++
      }
      mapOf("assets" to assets, "ids" to ids, "deleted" to emptyList<String>(), "done" to (state.assetsDone && state.idsDone))
    } }

    AsyncFunction("finish") { handle: String -> synchronized(lock) {
      val state = session(handle)
      check(state.assetsDone && state.idsDone) { "Photo synchronization is incomplete" }
      val context = context()
      check(access(context) == state.access && stamps(context) == state.stamps) { "Photo library changed during synchronization" }
      state.checkpoint
    } }

    AsyncFunction("close") { handle: String -> synchronized(lock) { sessions.remove(handle)?.close(); Unit } }

    OnDestroy { synchronized(lock) { sessions.values.forEach { it.close() }; sessions.clear() } }
  }
}
