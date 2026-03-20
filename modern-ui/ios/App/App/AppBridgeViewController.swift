import UIKit
import Capacitor

/// Registers local native plugins (Capacitor 8+). Storyboard points here instead of `CAPBridgeViewController`.
@objc(AppBridgeViewController)
class AppBridgeViewController: CAPBridgeViewController {

    open override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(OCRTcpPlugin())
        bridge?.registerPluginInstance(FixedReaderTcpPlugin())

        // Keep the outer WKWebView non-elastic.
        // We want elastic/rubber-band scrolling only inside the app's own scroll
        // containers (the main tab area + log boxes), not by bouncing the whole webview
        // which visually affects the sticky header/footer bars.
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
    }
}
