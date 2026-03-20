import Foundation
import Capacitor
import Network

/// Fixed reader tag stream — matches `electron/tcp-handler.ts` (TCP client to Edge, one line per tag).
@objc(FixedReaderTcpPlugin)
public class FixedReaderTcpPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FixedReaderTcpPlugin"
    public let jsName = "FixedReaderTcp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendTags", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelSend", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getConnected", returnType: CAPPluginReturnPromise)
    ]

    private var connection: NWConnection?
    private var isConnected = false
    private var sendCancelled = false
    private let stateLock = NSLock()

    private struct TagRow: Decodable {
        let epc: String
        let tid: String
        let uid: String
        let antenna: Int
        let rssi: String

        enum CodingKeys: String, CodingKey {
            case epc, tid, uid, antenna, rssi
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            epc = try c.decode(String.self, forKey: .epc)
            tid = try c.decode(String.self, forKey: .tid)
            uid = try c.decode(String.self, forKey: .uid)
            if let a = try? c.decode(Int.self, forKey: .antenna) {
                antenna = a
            } else if let s = try? c.decode(String.self, forKey: .antenna), let a = Int(s) {
                antenna = a
            } else {
                antenna = 1
            }
            if let r = try? c.decode(String.self, forKey: .rssi) {
                rssi = r
            } else if let d = try? c.decode(Double.self, forKey: .rssi) {
                rssi = String(d)
            } else {
                rssi = "-45.0"
            }
        }
    }

    private func formatLine(tag: TagRow, driver: String) -> String {
        "driver=\(driver) epc=\(tag.epc) @tid=\(tag.tid) uid=\(tag.uid) antenna=\(tag.antenna) @rssi=\(tag.rssi)\n"
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), !host.isEmpty else {
            call.reject("host required", "INPUT", nil)
            return
        }
        let portInt: Int
        if let p = call.getInt("port") {
            portInt = p
        } else if let d = call.getDouble("port") {
            portInt = Int(d)
        } else {
            portInt = 12352
        }
        guard portInt > 0, portInt <= 65535, let port = NWEndpoint.Port(rawValue: UInt16(portInt)) else {
            call.reject("invalid port", "INPUT", nil)
            return
        }

        stateLock.lock()
        if isConnected {
            stateLock.unlock()
            call.reject("Already connected", "STATE", nil)
            return
        }
        stateLock.unlock()

        let nwHost = NWEndpoint.Host(host)
        let nw = NWConnection(host: nwHost, port: port, using: .tcp)
        connection = nw

        nw.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            switch state {
            case .ready:
                self.stateLock.lock()
                self.isConnected = true
                self.stateLock.unlock()
                DispatchQueue.main.async { call.resolve() }
            case .failed(let error):
                self.stateLock.lock()
                self.isConnected = false
                self.connection = nil
                self.stateLock.unlock()
                DispatchQueue.main.async {
                    call.reject(error.localizedDescription, "TCP", nil)
                }
            case .cancelled:
                self.stateLock.lock()
                self.isConnected = false
                self.stateLock.unlock()
            default:
                break
            }
        }
        nw.start(queue: .global(qos: .userInitiated))
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        sendCancelled = true
        stateLock.lock()
        isConnected = false
        let conn = connection
        connection = nil
        stateLock.unlock()
        conn?.cancel()
        DispatchQueue.main.async { call.resolve() }
    }

    @objc func getConnected(_ call: CAPPluginCall) {
        stateLock.lock()
        let c = isConnected
        stateLock.unlock()
        call.resolve(["connected": c])
    }

    @objc func cancelSend(_ call: CAPPluginCall) {
        sendCancelled = true
        call.resolve()
    }

    @objc func sendTags(_ call: CAPPluginCall) {
        stateLock.lock()
        let connected = isConnected
        let conn = connection
        stateLock.unlock()

        guard connected, conn != nil else {
            notifyListeners("tcpError", data: ["message": "Not connected to server"])
            call.resolve()
            return
        }

        guard let tagsJson = call.getString("tagsJson"), !tagsJson.isEmpty,
              let data = tagsJson.data(using: .utf8) else {
            call.reject("tagsJson required", "INPUT", nil)
            return
        }

        let driverCode = call.getString("driverCode") ?? "llrp"
        let delayMs: Int
        if let d = call.getInt("delayMs") {
            delayMs = d
        } else if let x = call.getDouble("delayMs") {
            delayMs = Int(x)
        } else {
            delayMs = 20
        }

        let tags: [TagRow]
        do {
            tags = try JSONDecoder().decode([TagRow].self, from: data)
        } catch {
            call.reject("Invalid tags JSON: \(error.localizedDescription)", "INPUT", nil)
            return
        }

        sendCancelled = false
        let total = tags.count

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            for (idx, tag) in tags.enumerated() {
                if self.sendCancelled {
                    DispatchQueue.main.async {
                        self.notifyListeners("tcpComplete", data: ["message": "Stopped: Cancelled by user"])
                        call.resolve()
                    }
                    return
                }

                self.stateLock.lock()
                let still = self.isConnected
                let activeConn = self.connection
                self.stateLock.unlock()
                guard still, let c = activeConn else {
                    DispatchQueue.main.async {
                        self.notifyListeners("tcpComplete", data: ["message": "Stopped: Connection lost"])
                        call.resolve()
                    }
                    return
                }

                let line = self.formatLine(tag: tag, driver: driverCode)
                guard let payload = line.data(using: .utf8) else { continue }

                let sem = DispatchSemaphore(value: 0)
                var sendErr: Error?
                c.send(content: payload, completion: .contentProcessed { err in
                    sendErr = err
                    sem.signal()
                })
                sem.wait()

                if let e = sendErr {
                    self.stateLock.lock()
                    self.isConnected = false
                    self.stateLock.unlock()
                    DispatchQueue.main.async {
                        self.notifyListeners("tcpError", data: ["message": "Send error: \(e.localizedDescription)"])
                        call.resolve()
                    }
                    return
                }

                let count = idx + 1
                DispatchQueue.main.async {
                    self.notifyListeners("tcpProgress", data: ["message": "Sent (\(count)/\(total)): \(tag.epc)"])
                }

                if delayMs > 0, idx < tags.count - 1 {
                    Thread.sleep(forTimeInterval: Double(delayMs) / 1000.0)
                }
            }

            DispatchQueue.main.async {
                self.notifyListeners("tcpComplete", data: ["message": "Successfully sent \(total) tag(s)"])
                call.resolve()
            }
        }
    }
}
