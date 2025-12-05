# Handheld Server - How It Works

## Overview
The Handheld Server **creates a TCP server** that listens on port **10472** for handheld devices to connect to it. This matches the Java `HandheldServer.java` implementation exactly.

## Workflow (Same as Java Swing Version)

### Step 1: Start the Server
1. Go to the **Handheld** tab
2. Click **Subscribe** button
   - This starts a TCP server listening on `0.0.0.0:10472`
   - You should see: "Handheld server listening on port 10472"

### Step 2: Connect Your Handheld Device
1. On your handheld device running **VSBL Debug** app
2. Configure it to connect to: `YOUR_PC_IP:10472`
   - Find your PC's IP address (e.g., 192.168.1.100)
   - In VSBL Debug settings, set server to `YOUR_PC_IP:10472`
3. Connect the handheld device
   - You should see in the log: "Handheld device connected from X.X.X.X:PORT (Total: 1)"

### Step 3: Send EPCs to Handheld
1. Enter UPC codes or EPCs in the text areas (format: `CODE,COUNT` per line)
2. Click **Generate EPCs → HH** button
   - EPCs are generated and broadcast to all connected handheld devices
   - Each device receives JSON messages like: `{"epc":"...","date":"...","rssi":70.0}`

## Important Notes

### "No handheld connected" Message
If you see this message, it means:
- ✅ The server IS running on port 10472
- ❌ No handheld device has connected to it yet

**This is the CORRECT behavior** - you need to physically connect a handheld device first (Step 2 above).

### Testing Without a Physical Device
If you want to test without a real handheld device, you can use:
- **netcat/nc**: `nc YOUR_PC_IP 10472` (then you'll receive EPCs in the terminal)
- **telnet**: `telnet YOUR_PC_IP 10472`
- **Python script**: Create a simple TCP client that connects to port 10472

Example Python test client:
```python
import socket

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(('localhost', 10472))
print("Connected to handheld server")

while True:
    data = sock.recv(4096)
    if not data:
        break
    print(f"Received: {data.decode()}")
```

### Batching Logic
The server uses **batch processing** (same as Java):
- Queues EPCs as they're generated
- Sends in batches of 200 EPCs at a time
- Broadcasts to ALL connected clients simultaneously

### Delay Setting
The delay (shared with Fixed Reader) applies between batches, not individual EPCs within a batch.

## Troubleshooting

### Can't Connect from Handheld
1. Check firewall - ensure port 10472 is open
2. Verify your PC's IP address
3. Make sure handheld device is on the same network
4. Check the app logs for "Server successfully started on 0.0.0.0:10472"

### Port Already in Use
If you get "port already in use" error:
- The Java Swing version might still be running
- Another application is using port 10472
- Close other apps and try again

## Differences from Fixed Reader Mode

| Feature | Fixed Reader | Handheld Server |
|---------|-------------|----------------|
| **Role** | Connects TO a server | Creates a server that listens |
| **Port** | Connects to 12352 | Listens on 10472 |
| **Connection** | One connection | Multiple clients can connect |
| **Protocol** | Sends formatted tag messages | Sends JSON EPC messages |
| **Use Case** | Emulate RFID reader tags | Send EPCs to handheld scanners |

## Implementation Details

The Electron implementation now **exactly matches** the Java version:
- ✅ Creates a `net.Server` on port 10472
- ✅ Accepts multiple client connections
- ✅ Batches EPCs in groups of 200
- ✅ Broadcasts to all connected clients
- ✅ Handles client disconnections
- ✅ Uses the same JSON format: `{"epc":"...","date":"yyyy-MM-dd HH:mm:ss.SSS","rssi":70.0}`
- ✅ Supports cancel/stop during send
- ✅ Logs client connections and disconnections










