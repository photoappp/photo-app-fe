import Photos
import UIKit

struct PhotoKitImageResult {
  let image: UIImage?
  let info: [AnyHashable: Any]?
}

enum PhotoKitImageManagerError: Error {
  case assetNotFound
}

final class PhotoKitImageManager {
  static let shared = PhotoKitImageManager()

  private let imageManager = PHCachingImageManager()

  private init() {}

  func requestImage(
    assetId: String,
    targetSize: CGSize,
    contentMode: PHImageContentMode,
    completion: @escaping (Result<PhotoKitImageResult, PhotoKitImageManagerError>) -> Void
  ) -> PHImageRequestID? {
    let assets = PHAsset.fetchAssets(
      withLocalIdentifiers: [assetId],
      options: nil
    )

    guard let asset = assets.firstObject else {
      completion(.failure(.assetNotFound))
      return nil
    }

    let options = PHImageRequestOptions()
    options.deliveryMode = .opportunistic
    options.isNetworkAccessAllowed = true
    options.isSynchronous = false
    options.resizeMode = .fast

    return imageManager.requestImage(
      for: asset,
      targetSize: targetSize,
      contentMode: contentMode,
      options: options
    ) { image, info in
      completion(.success(PhotoKitImageResult(image: image, info: info)))
    }
  }

  func cancelRequest(_ requestId: PHImageRequestID) {
    imageManager.cancelImageRequest(requestId)
  }
}
