import java.io.IOException;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

public class TCPEmulator {
    private Socket socket;
    private OutputStream outputStream;
    private final ExecutorService executorService;
    private volatile boolean isConnected = false;
    private volatile boolean cancelRequested = false;

    public TCPEmulator() {
        this.executorService = Executors.newSingleThreadExecutor();
    }

    public void connect(String host, int port, Consumer<String> onSuccess, Consumer<String> onError) {
        executorService.submit(() -> {
            try {
                socket = new Socket(host, port);
                outputStream = socket.getOutputStream();
                isConnected = true;
                onSuccess.accept("Connected to " + host + ":" + port);
            } catch (IOException e) {
                isConnected = false;
                onError.accept("Connection failed: " + e.getMessage());
            }
        });
    }

    public void disconnect(Consumer<String> callback) {
        executorService.submit(() -> {
            try {
                isConnected = false;
                if (outputStream != null) {
                    outputStream.close();
                }
                if (socket != null && !socket.isClosed()) {
                    socket.close();
                }
                callback.accept("Disconnected successfully");
            } catch (IOException e) {
                callback.accept("Disconnect error: " + e.getMessage());
            }
        });
    }

    public void sendTags(List<TagData> tags, String driver, int delayMs, 
                        Consumer<String> onProgress, Consumer<String> onComplete) {
        executorService.submit(() -> {
            if (!isConnected || outputStream == null) {
                onComplete.accept("Error: Not connected to server");
                return;
            }

            try {
                cancelRequested = false;
                int total = tags.size();
                int count = 0;
                for (TagData tag : tags) {
                    if (cancelRequested) { onComplete.accept("Stopped: Cancelled by user"); return; }
                    if (!isConnected) { onComplete.accept("Stopped: Connection lost"); return; }
                    String message = tag.formatMessage(driver);
                    outputStream.write(message.getBytes(StandardCharsets.UTF_8));
                    outputStream.flush();
                    count++;
                    onProgress.accept("Sent (" + count + "/" + total + "): " + tag.getEpc());
                    if (delayMs > 0 && count < total) {
                        Thread.sleep(delayMs);
                    }
                }
                onComplete.accept("Successfully sent " + count + " tag(s)");
            } catch (IOException e) {
                isConnected = false;
                onComplete.accept("Send error: " + e.getMessage());
            } catch (InterruptedException e) {
                onComplete.accept("Send interrupted");
                Thread.currentThread().interrupt();
            }
        });
    }

    public boolean isConnected() {
        return isConnected && socket != null && socket.isConnected() && !socket.isClosed();
    }

    public void shutdown() {
        isConnected = false;
        try {
            if (outputStream != null) outputStream.close();
            if (socket != null) socket.close();
        } catch (IOException ignored) {
        }
        executorService.shutdown();
    }

    public void cancelSend() {
        cancelRequested = true;
    }
}

