import ExpoModulesCore

public final class IOSPhotoKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("IOSPhotoKit")

    View(IOSPhotoAssetView.self) {
      Prop("assetId") { (view: IOSPhotoAssetView, assetId: String?) in
        view.setAssetId(assetId)
      }

      Prop("contentMode") { (view: IOSPhotoAssetView, contentMode: String?) in
        view.setContentMode(contentMode)
      }

      Events("onLoad", "onError")
    }
  }
}
