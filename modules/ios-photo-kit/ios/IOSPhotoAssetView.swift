import ExpoModulesCore
import Photos
import UIKit

final class IOSPhotoAssetView: ExpoView {
  let onLoad = EventDispatcher()
  let onError = EventDispatcher()

  private let imageView = UIImageView()
  private var assetId: String?
  private var didEmitLoad = false
  private var generation: UInt = 0
  private var imageContentMode: PHImageContentMode = .aspectFill
  private var imageContentModeName = "cover"
  private var lastRequestKey: String?
  private var requestId: PHImageRequestID = PHInvalidImageRequestID

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    clipsToBounds = true
    imageView.clipsToBounds = true
    imageView.contentMode = .scaleAspectFill
    addSubview(imageView)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    imageView.frame = bounds
    requestImageIfNeeded()
  }

  func setAssetId(_ nextAssetId: String?) {
    let normalized = nextAssetId?.trimmingCharacters(in: .whitespacesAndNewlines)
    let nextValue = normalized?.isEmpty == false ? normalized : nil
    guard assetId != nextValue else {
      return
    }

    cancelCurrentRequest()
    assetId = nextValue
    didEmitLoad = false
    imageView.image = nil
    lastRequestKey = nil
    setNeedsLayout()
  }

  func setContentMode(_ nextContentMode: String?) {
    let nextName = nextContentMode == "contain" ? "contain" : "cover"
    guard imageContentModeName != nextName else {
      return
    }

    cancelCurrentRequest()
    imageContentModeName = nextName
    imageContentMode = nextName == "contain" ? .aspectFit : .aspectFill
    imageView.contentMode = nextName == "contain" ? .scaleAspectFit : .scaleAspectFill
    didEmitLoad = false
    imageView.image = nil
    lastRequestKey = nil
    setNeedsLayout()
  }

  deinit {
    cancelCurrentRequest()
  }

  private func requestImageIfNeeded() {
    guard let assetId, bounds.width > 0, bounds.height > 0 else {
      return
    }

    let screenScale = window?.windowScene?.screen.scale ?? UIScreen.main.scale
    let targetSize = CGSize(
      width: max(1, (bounds.width * screenScale).rounded()),
      height: max(1, (bounds.height * screenScale).rounded())
    )
    let requestKey = "\(assetId)|\(Int(targetSize.width))x\(Int(targetSize.height))|\(imageContentModeName)"
    guard lastRequestKey != requestKey else {
      return
    }

    cancelCurrentRequest()
    lastRequestKey = requestKey
    didEmitLoad = false
    generation &+= 1
    let currentGeneration = generation

    requestId = PhotoKitImageManager.shared.requestImage(
      assetId: assetId,
      targetSize: targetSize,
      contentMode: imageContentMode
    ) { [weak self] result in
      DispatchQueue.main.async {
        guard let self, self.generation == currentGeneration else {
          return
        }

        switch result {
        case .failure(.assetNotFound):
          self.requestId = PHInvalidImageRequestID
          self.onError([
            "assetId": assetId,
            "code": "asset-not-found",
            "message": "No PHAsset exists for the supplied local identifier."
          ])

        case .success(let response):
          let info = response.info
          let isCancelled =
            (info?[PHImageCancelledKey] as? NSNumber)?.boolValue ?? false
          if isCancelled {
            return
          }

          if let error = info?[PHImageErrorKey] as? Error {
            self.requestId = PHInvalidImageRequestID
            self.onError([
              "assetId": assetId,
              "code": "image-request-failed",
              "message": error.localizedDescription
            ])
            return
          }

          guard let image = response.image else {
            return
          }

          let isDegraded =
            (info?[PHImageResultIsDegradedKey] as? NSNumber)?.boolValue ?? false
          self.imageView.image = image

          if !self.didEmitLoad {
            self.didEmitLoad = true
            self.onLoad([
              "assetId": assetId,
              "width": image.size.width,
              "height": image.size.height,
              "isDegraded": isDegraded
            ])
          }

          if !isDegraded {
            self.requestId = PHInvalidImageRequestID
          }
        }
      }
    } ?? PHInvalidImageRequestID
  }

  private func cancelCurrentRequest() {
    generation &+= 1
    if requestId != PHInvalidImageRequestID {
      PhotoKitImageManager.shared.cancelRequest(requestId)
      requestId = PHInvalidImageRequestID
    }
  }
}
