import Foundation
import Capacitor
import Network

/// Sends OCR payload over TCP to host:10482 (same as Electron tcp-handler).
/// Capacitor 8: must use `CAPBridgedPlugin` + `jsName` matching `registerPlugin('OCRTcp')`, and register in `AppBridgeViewController`.
@objc(OCRTcpPlugin)
public class OCRTcpPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OCRTcpPlugin"
    public let jsName = "OCRTcp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise)
    ]

    @objc public func send(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), !host.isEmpty,
              let message = call.getString("message") else {
            call.reject("Must provide host and message", "INPUT", nil)
            return
        }

        let nwHost = NWEndpoint.Host(host)
        let port = NWEndpoint.Port(integerLiteral: 10482)
        let connection = NWConnection(host: nwHost, port: port, using: .tcp)
        let payload = (message + "\n").data(using: .utf8) ?? Data()

        var finished = false
        func complete(ok: Bool, errorMessage: String?) {
            guard !finished else { return }
            finished = true
            connection.cancel()
            DispatchQueue.main.async {
                if ok {
                    call.resolve(["ok": true])
                } else {
                    call.reject(errorMessage ?? "Send failed", "TCP", nil)
                }
            }
        }

        let timeout = DispatchWorkItem {
            complete(ok: false, errorMessage: "Connection timed out (10s)")
        }
        DispatchQueue.global().asyncAfter(deadline: .now() + 10, execute: timeout)

        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                connection.send(content: payload, completion: .contentProcessed { error in
                    timeout.cancel()
                    if let error = error {
                        complete(ok: false, errorMessage: error.localizedDescription)
                    } else {
                        complete(ok: true, errorMessage: nil)
                    }
                })
            case .failed(let error):
                timeout.cancel()
                complete(ok: false, errorMessage: error.localizedDescription)
            case .cancelled:
                timeout.cancel()
            default:
                break
            }
        }

        connection.start(queue: .global(qos: .userInitiated))
    }
}
