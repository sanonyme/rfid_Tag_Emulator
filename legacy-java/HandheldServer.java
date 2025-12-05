import java.io.IOException;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

public class HandheldServer {
    private final int listenPort;
    private ServerSocket serverSocket;
    private final List<Socket> connectedClients;
    private final ExecutorService executorService;
    private volatile boolean running = false;
    private volatile boolean cancelRequested = false;
    private final ConcurrentLinkedQueue<String> epcQueue = new ConcurrentLinkedQueue<>();

    public HandheldServer(int listenPort) {
        this.listenPort = listenPort;
        this.connectedClients = Collections.synchronizedList(new ArrayList<>());
        this.executorService = Executors.newCachedThreadPool();
    }

    public void start(Consumer<String> onLog, Consumer<String> onError) {
        if (running) {
            onLog.accept("Handheld server already running on port " + listenPort);
            return;
        }
        executorService.submit(() -> {
            try {
                serverSocket = new ServerSocket(listenPort);
                running = true;
                onLog.accept("Handheld server listening on port " + listenPort);

                while (running) {
                    try {
                        final Socket client = serverSocket.accept();
                        connectedClients.add(client);
                    } catch (IOException e) {
                        if (running) onError.accept("Accept error: " + e.getMessage());
                    }
                }
            } catch (IOException e) {
                onError.accept("Server start error: " + e.getMessage());
            }
        });

    }

    public boolean isRunning() {
        return running;
    }

    public void stop(Consumer<String> onLog) {
        running = false;
        try {
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
            }
        } catch (IOException ignored) {
        }
        synchronized (connectedClients) {
            for (Socket client : connectedClients) {
                try { client.close(); } catch (IOException ignored) {}
            }
            connectedClients.clear();
        }
        onLog.accept("Handheld server stopped");
    }


    public void sendEpcs(List<String> epcs, int delayMs, Consumer<String> onProgress, Consumer<String> onComplete) {
        // Backward-compatible method now uses batching internally
        sendEpcsBatched(epcs, delayMs, onProgress, onComplete);
    }

    public void sendEpcsBatched(List<String> epcs, int delayMs, Consumer<String> onProgress, Consumer<String> onComplete) {
        executorService.submit(() -> {
            if (!running || connectedClients.isEmpty()) { onComplete.accept("No handheld connected on port " + listenPort); return; }
            int total = epcs.size();
            int enqueued = 0;
            int sentTotal = 0;
            try {
                cancelRequested = false;
                for (String epc : epcs) {
                    if (cancelRequested) { onComplete.accept("Stopped: Cancelled by user"); return; }
                    epcQueue.offer(epc);
                    enqueued++;
                    onProgress.accept("Queued (" + enqueued + "/" + total + "): " + epc);
                    if (epcQueue.size() >= 200) {
                        List<String> batch = drainUpTo(200);
                        int sent = broadcastBatch(batch);
                        sentTotal += sent;
                        onProgress.accept("Broadcast batch of " + batch.size() + " EPC(s)");
                        if (delayMs > 0) {
                            try { Thread.sleep(delayMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
                        }
                    }
                }
                // Flush any remaining EPCs
                List<String> remainder = drainUpTo(Integer.MAX_VALUE);
                if (!remainder.isEmpty()) {
                    if (cancelRequested) { onComplete.accept("Stopped: Cancelled by user"); return; }
                    int sent = broadcastBatch(remainder);
                    sentTotal += sent;
                    onProgress.accept("Broadcast final batch of " + remainder.size() + " EPC(s)");
                }
                onComplete.accept("Broadcasted " + sentTotal + " EPC(s) to handheld clients");
            } catch (Exception e) {
                onComplete.accept("Handheld broadcast error: " + e.getMessage());
            }
        });
    }

    private List<String> drainUpTo(int max) {
        List<String> batch = new ArrayList<>(Math.min(max, 200));
        for (int i = 0; i < max; i++) {
            String epc = epcQueue.poll();
            if (epc == null) break;
            batch.add(epc);
        }
        return batch;
    }

    private int broadcastBatch(List<String> epcs) {
        if (epcs.isEmpty()) return 0;
        StringBuilder sb = new StringBuilder(epcs.size() * 64);
        for (String epc : epcs) {
            String json = "{\"epc\":\"" + epc + "\",\"date\":\"" + nowString() + "\",\"rssi\":70.0}";
            sb.append(json).append("\r\n");
        }
        byte[] payload = sb.toString().getBytes(StandardCharsets.UTF_8);
        synchronized (connectedClients) {
            List<Socket> toRemove = new ArrayList<>();
            for (Socket client : connectedClients) {
                try {
                    OutputStream os = client.getOutputStream();
                    os.write(payload);
                    os.flush();
                } catch (IOException e) {
                    toRemove.add(client);
                }
            }
            connectedClients.removeAll(toRemove);
        }
        return epcs.size();
    }

    private static String nowString() {
        java.time.format.DateTimeFormatter fmt = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS");
        return java.time.LocalDateTime.now().format(fmt);
    }

    public void shutdown() {
        stop(msg -> {});
        executorService.shutdown();
    }

    public void cancelSend() {
        cancelRequested = true;
    }
}


