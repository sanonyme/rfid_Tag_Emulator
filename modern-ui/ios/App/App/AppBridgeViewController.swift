import UIKit
import Capacitor

/// Registers local native plugins (Capacitor 8+). Storyboard points here instead of `CAPBridgeViewController`.
@objc(AppBridgeViewController)
class AppBridgeViewController: CAPBridgeViewController {

    open override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(OCRTcpPlugin())
        bridge?.registerPluginInstance(FixedReaderTcpPlugin())
    }
}
