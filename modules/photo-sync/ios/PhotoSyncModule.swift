import ExpoModulesCore
import Photos

/*
 2026.10.18 사진 라이브러리 증분 동기화 네이티브 모듈 (PicQly-T POC에서 이식 by Claude).
 - iOS 16+: PHPersistentChangeToken으로 지난 실행 이후 추가/수정/삭제된 자산만 정확히 조회(delta)
 - iOS 15: 변경 토큰 API가 없어 항상 full 모드로 보고하고 JS 측 전체 패스로 폴백
 - begin이 checkpoint를 함께 반환해, JS가 전체 패스를 스스로 끝낸 경우에도 다음 세션부터 delta 사용 가능
   (토큰은 읽기 '이전'에 캡처되므로 그 사이 변경분은 다음 실행에서 재생됨 — 유실 없음)
 */
public class PhotoSyncModule: Module {
  private let queue = DispatchQueue(label: "PicQly.PhotoSync")
  private var sessions: [String: Session] = [:]

  private struct Checkpoint: Codable {
    let schema: Int
    let platform: String
    let access: Int
    let token: String
  }

  private final class Session {
    let assets: PHFetchResult<PHAsset>
    let deleted: [String]
    let checkpoint: String
    let access: Int
    let includeIds: Bool
    var assetIndex = 0
    var deleteIndex = 0
    var done: Bool { assetIndex == assets.count && deleteIndex == deleted.count }
    init(assets: PHFetchResult<PHAsset>, deleted: [String], checkpoint: String, access: Int, includeIds: Bool) {
      self.assets = assets; self.deleted = deleted; self.checkpoint = checkpoint
      self.access = access; self.includeIds = includeIds
    }
  }

  private func failure(_ message: String) -> NSError {
    NSError(domain: "PicQlyPhotoSync", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  private func session(_ handle: String) throws -> Session {
    guard let value = sessions[handle] else { throw failure("Unknown photo synchronization session") }
    return value
  }

  @available(iOS 16, *)
  private func archive(_ token: PHPersistentChangeToken) throws -> Data {
    try NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
  }

  public func definition() -> ModuleDefinition {
    Name("PicQlyPhotoSync")

    AsyncFunction("begin") { (saved: String?, limited: Bool) -> [String: Any] in
      let access = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      guard access == .authorized || access == .limited else { throw self.failure("Photo library access denied") }

      var mode = "full"
      var changed = Set<String>()
      var removed = Set<String>()
      var encoded: String? = nil

      if #available(iOS 16, *) {
        let library = PHPhotoLibrary.shared()
        // 읽기 전에 캡처: 이후 변경분은 다음 동기화에서 재생된다.
        let captured = try self.archive(library.currentChangeToken)
        let next = Checkpoint(schema: 1, platform: "ios", access: access.rawValue, token: captured.base64EncodedString())
        encoded = String(decoding: try JSONEncoder().encode(next), as: UTF8.self)

        if let saved {
          let prior = try JSONDecoder().decode(Checkpoint.self, from: Data(saved.utf8))
          guard prior.schema == 1 && prior.platform == "ios" else { throw self.failure("Invalid photo synchronization checkpoint") }
          if limited || access == .limited || prior.access != access.rawValue {
            mode = "reconcile"
          } else {
            guard let data = Data(base64Encoded: prior.token),
                  let token = try NSKeyedUnarchiver.unarchivedObject(ofClass: PHPersistentChangeToken.self, from: data)
            else { throw self.failure("Invalid photo change token") }
            do {
              let changes = try library.fetchPersistentChanges(since: token)
              for change in changes {
                let details = try change.changeDetails(for: .asset)
                for id in details.insertedLocalIdentifiers.union(details.updatedLocalIdentifiers) {
                  changed.insert(id); removed.remove(id)
                }
                for id in details.deletedLocalIdentifiers {
                  changed.remove(id); removed.insert(id)
                }
              }
              mode = "delta"
            } catch {
              let error = error as NSError
              guard error.domain == PHPhotosErrorDomain &&
                (error.code == PHPhotosError.Code.persistentChangeTokenExpired.rawValue ||
                 error.code == PHPhotosError.Code.persistentChangeDetailsUnavailable.rawValue)
              else { throw error }
              mode = "reconcile"
              changed.removeAll(); removed.removeAll()
            }
          }
        }
      }

      let options = PHFetchOptions()
      options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
      options.predicate = NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue)
      let assets = mode == "delta"
        ? PHAsset.fetchAssets(withLocalIdentifiers: Array(changed), options: options)
        : PHAsset.fetchAssets(with: .image, options: options)

      if mode == "delta" {
        // 더 이상 접근할 수 없는 자산은 인덱스에서 제거되어야 한다.
        var found = Set<String>()
        assets.enumerateObjects { asset, _, _ in _ = found.insert(asset.localIdentifier) }
        removed.formUnion(changed.subtracting(found))
      }

      let handle = UUID().uuidString
      self.sessions[handle] = Session(assets: assets, deleted: Array(removed), checkpoint: encoded ?? "",
        access: access.rawValue, includeIds: mode != "delta")
      // 2026.10.18 nil Optional을 그대로 Any로 넘기면 브리지 변환이 불안정하므로 NSNull로 명시 by Claude
      let checkpointValue: Any = encoded ?? NSNull()
      return ["handle": handle, "mode": mode,
              "total": mode == "delta" ? NSNull() as Any : assets.count as Any,
              "checkpoint": checkpointValue]
    }.runOnQueue(queue)

    AsyncFunction("read") { (handle: String, requested: Int) -> [String: Any] in
      let state = try self.session(handle)
      let limit = min(500, max(1, requested))
      var deleted: [String] = []
      var assets: [[String: Any]] = []
      var ids: [String] = []
      while state.deleteIndex < state.deleted.count && deleted.count < limit {
        deleted.append(state.deleted[state.deleteIndex]); state.deleteIndex += 1
      }
      while state.assetIndex < state.assets.count && deleted.count + assets.count < limit {
        let asset = state.assets.object(at: state.assetIndex)
        let id = asset.localIdentifier
        let created = (asset.creationDate?.timeIntervalSince1970 ?? 0) * 1000
        let modified = (asset.modificationDate?.timeIntervalSince1970 ?? 0) * 1000
        var payload: [String: Any] = ["id": id, "uri": "ph://" + id, "creationTime": created,
          "modificationTime": modified, "revision": String(modified)]
        // 2026.10.18 bulk 조회 시점에 좌표를 함께 내려 per-asset 조회를 줄임 by Claude
        if let location = asset.location {
          payload["latitude"] = location.coordinate.latitude
          payload["longitude"] = location.coordinate.longitude
        }
        assets.append(payload)
        if state.includeIds { ids.append(id) }
        state.assetIndex += 1
      }
      return ["assets": assets, "ids": ids, "deleted": deleted, "done": state.done]
    }.runOnQueue(queue)

    AsyncFunction("finish") { (handle: String) -> String in
      let state = try self.session(handle)
      guard state.done else { throw self.failure("Photo synchronization is incomplete") }
      guard PHPhotoLibrary.authorizationStatus(for: .readWrite).rawValue == state.access
      else { throw self.failure("Photo access changed during synchronization") }
      return state.checkpoint
    }.runOnQueue(queue)

    AsyncFunction("close") { (handle: String) -> Void in self.sessions.removeValue(forKey: handle) }.runOnQueue(queue)
  }
}
