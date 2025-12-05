import javax.swing.*;
import java.awt.*;
import java.util.ArrayList;
import java.util.List;

public class EmulatorUI extends JFrame {
    private final TCPEmulator emulator;
    private final HandheldServer handheldServer;
    
    // Connection components
    private JTextField hostField;
    private JTextField portField;
    private JButton connectButton;
    private JButton disconnectButton;
    
    // Tag management
    private JTextArea fixedUpcListArea; // UPC,Count lines for Fixed
    private JTextArea fixedEpcCountArea; // EPC,Count lines for Fixed
    private JButton sendTagsButton;
    private JButton stopFixedButton;
    private JButton loopSendButton;
    private volatile boolean loopSending = false;
    
    // Configuration
    private JComboBox<VendorDriver> driverCombo;
    private JSpinner delaySpinner;
    private JTextField uidField;
    private JSpinner antennaSpinner;
    private JTextField rssiField;
    private JSpinner startSerialSpinner;
    
    // Status
    private JTextArea logArea;
    private JTextArea hhLogArea;
	private JTabbedPane modeTabs;

    // Handheld
    private JTextField hhDeviceIdField;
    private JButton hhSubscribeButton;
    private JTextArea upcListArea; // lines of "UPC,Count"
    private JTextArea epcCountListArea; // lines of "EPC,Count"
    private JButton hhGenerateAndSendButton;
    private JButton hhStopButton;
    
    // OCR
    private JTextField ocrMessageField;
    private JButton ocrSendButton;
    private JTextArea ocrLogArea;
    
    public EmulatorUI() {
        this.emulator = new TCPEmulator();
        this.handheldServer = new HandheldServer(10472);
        initUI();
    }
    
    private void initUI() {
        setTitle("edge Tag Emulator");
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLayout(new BorderLayout(10, 10));
        ImageIcon appIco = loadResourceIcon("ENV.png"); //GOOOOOOOOO EDGE!!!!!!!!!!!!!! EDGE > VSBL
        if (appIco != null) {
            setIconImage(appIco.getImage());
        }
        
        // Header with logo (if available)
        add(createHeaderPanel(), BorderLayout.NORTH);

		// Center - Tabbed modes (Fixed, Handheld, OCR)
		modeTabs = new JTabbedPane();
		modeTabs.setFocusable(false);
		modeTabs.addTab("Fixed", createFixedTab());
		modeTabs.addTab("Handheld", createHandheldPanel());
		modeTabs.addTab("OCR", createOCRPanel());
		add(modeTabs, BorderLayout.CENTER);
        
        // Bottom panel removed; logs are embedded per tab
        
        pack();
        setSize(800, 700);
        setLocationRelativeTo(null);
        updateConnectionState(false);
    }

    private JComponent createHeaderPanel() {
        JPanel header = new JPanel(new BorderLayout(10, 0));
        header.setBorder(BorderFactory.createEmptyBorder(5, 10, 0, 10));

        // Left icon removed per request; keep center logo/title only

        // Center logo (main)
        JPanel center = new JPanel(new FlowLayout(FlowLayout.CENTER, 0, 0));
        ImageIcon icon = loadLogoIcon();
        if (icon != null) {
            Image img = icon.getImage().getScaledInstance(-1, 36, Image.SCALE_SMOOTH);
            center.add(new JLabel(new ImageIcon(img)));
        } else {
            JLabel title = new JLabel("edge Tag Emulator");
            title.setFont(title.getFont().deriveFont(Font.BOLD, 18f));
            center.add(title);
        }
        header.add(center, BorderLayout.CENTER);

        return header;
    }

    private ImageIcon loadLogoIcon() {
        try {
            // Try classpath resource first
            java.net.URL url = getClass().getResource("/logo.png");
            if (url != null) return new ImageIcon(url);
            // Fallback to project root file when running from sources
            java.io.File f = new java.io.File("logo.png");
            if (f.exists()) return new ImageIcon(f.getAbsolutePath());
        } catch (Exception ignored) {}
        return null;
    }

    private ImageIcon loadResourceIcon(String name) {
        try {
            java.net.URL url = getClass().getResource("/" + name);
            if (url != null) return new ImageIcon(url);
            java.io.File f = new java.io.File(name);
            if (f.exists()) return new ImageIcon(f.getAbsolutePath());
        } catch (Exception ignored) {}
        return null;
    }
    
    private JPanel createConfigurationPanel() {
        JPanel mainPanel = new JPanel();
        mainPanel.setLayout(new BoxLayout(mainPanel, BoxLayout.Y_AXIS));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));
        
        // Connection Section
        JPanel connectionPanel = new JPanel(new GridBagLayout());
        connectionPanel.setBorder(BorderFactory.createTitledBorder(
            BorderFactory.createEtchedBorder(), "Connection Settings"));
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.anchor = GridBagConstraints.WEST;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        
        gbc.gridx = 0; gbc.gridy = 0;
        connectionPanel.add(new JLabel("Host:"), gbc);
        gbc.gridx = 1; gbc.weightx = 1.0;
        hostField = new JTextField("", 15);
        connectionPanel.add(hostField, gbc);
        
        gbc.gridx = 0; gbc.gridy = 1; gbc.weightx = 0;
        connectionPanel.add(new JLabel("Port:"), gbc);
        gbc.gridx = 1; gbc.weightx = 1.0;
        portField = new JTextField("12352", 15);
        connectionPanel.add(portField, gbc);
        
        gbc.gridx = 0; gbc.gridy = 2; gbc.gridwidth = 2;
        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.CENTER, 5, 0));
        connectButton = new JButton("Connect");
        connectButton.setFocusable(false);
        connectButton.addActionListener(e -> connect());
        disconnectButton = new JButton("Disconnect");
        disconnectButton.setFocusable(false);
        disconnectButton.addActionListener(e -> disconnect());
        buttonPanel.add(connectButton);
        buttonPanel.add(disconnectButton);
        connectionPanel.add(buttonPanel, gbc);
        
        mainPanel.add(connectionPanel);
        mainPanel.add(Box.createVerticalStrut(10));
        
        // Tag Defaults Section
        JPanel defaultsPanel = new JPanel(new GridBagLayout());
        defaultsPanel.setBorder(BorderFactory.createTitledBorder(
            BorderFactory.createEtchedBorder(), "Tag Defaults"));
        gbc = new GridBagConstraints();
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.anchor = GridBagConstraints.WEST;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        
        gbc.gridx = 0; gbc.gridy = 0; gbc.weightx = 0;
        defaultsPanel.add(new JLabel("Antenna:"), gbc);
        gbc.gridx = 1; gbc.weightx = 1.0;
        antennaSpinner = new JSpinner(new SpinnerNumberModel(1, 1, 4, 1));
        defaultsPanel.add(antennaSpinner, gbc);
        
        gbc.gridx = 0; gbc.gridy = 1; gbc.weightx = 0;
        defaultsPanel.add(new JLabel("@rssi:"), gbc);
        gbc.gridx = 1; gbc.weightx = 1.0;
        rssiField = new JTextField("-45.0", 15);
        defaultsPanel.add(rssiField, gbc);
        
        mainPanel.add(defaultsPanel);
        mainPanel.add(Box.createVerticalStrut(10));
        
        // Driver Settings Section
        JPanel driverPanel = new JPanel(new GridBagLayout());
        driverPanel.setBorder(BorderFactory.createTitledBorder(
            BorderFactory.createEtchedBorder(), "Driver Settings"));
        gbc = new GridBagConstraints();
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.anchor = GridBagConstraints.WEST;
        gbc.fill = GridBagConstraints.HORIZONTAL;
        
        // Reordered: UID, Driver, Delay
        gbc.gridx = 0; gbc.gridy = 0; gbc.weightx = 0;
        driverPanel.add(new JLabel("UID:"), gbc);
        gbc.gridx = 1; gbc.weightx = 1.0;
        uidField = new JTextField("0000", 15);
        driverPanel.add(uidField, gbc);

        gbc.gridx = 0; gbc.gridy = 1; gbc.weightx = 0;
        driverPanel.add(new JLabel("Driver:"), gbc);
        gbc.gridx = 1; gbc.weightx = 1.0;
        driverCombo = new JComboBox<>(VendorDriver.values());
        driverPanel.add(driverCombo, gbc);
        
        gbc.gridx = 0; gbc.gridy = 2; gbc.weightx = 0;
        driverPanel.add(new JLabel("Delay (ms):"), gbc);
        gbc.gridx = 1; gbc.weightx = 1.0;
        delaySpinner = new JSpinner(new SpinnerNumberModel(100, 0, 10000, 50));
        driverPanel.add(delaySpinner, gbc);
        
        mainPanel.add(driverPanel);
        mainPanel.add(Box.createVerticalGlue());
        
        return mainPanel;
    }
    
    private JPanel createCenterPanel() {
        JPanel panel = new JPanel(new BorderLayout(10, 10));
        panel.setBorder(BorderFactory.createEmptyBorder(10, 5, 10, 10));
        
        // EPC Input Area
        JPanel centerStack = new JPanel();
        centerStack.setLayout(new BoxLayout(centerStack, BoxLayout.Y_AXIS));

        JPanel fixedUpcPanel = new JPanel(new GridBagLayout());
        fixedUpcPanel.setBorder(BorderFactory.createTitledBorder(
            BorderFactory.createEtchedBorder(), "UPC,Count for EPC Generation"));
        GridBagConstraints ug = new GridBagConstraints();
        ug.insets = new Insets(5,5,5,5);
        ug.anchor = GridBagConstraints.WEST;
        ug.fill = GridBagConstraints.HORIZONTAL;
        ug.gridx = 0; ug.gridy = 0;
        fixedUpcPanel.add(new JLabel("UPC,Count (one per line):"), ug);
        ug.gridx = 1; ug.gridy = 0; ug.weightx = 1.0;
        fixedUpcListArea = new JTextArea(4, 30);
        fixedUpcListArea.setFont(new Font("Monospaced", Font.PLAIN, 13));
        fixedUpcListArea.setLineWrap(false);
        fixedUpcListArea.setText("00000000000001,5");
        fixedUpcPanel.add(new JScrollPane(fixedUpcListArea), ug);
        ug.gridx = 0; ug.gridy = 1; ug.weightx = 0;
        fixedUpcPanel.add(new JLabel("Starting Serial:"), ug);
        ug.gridx = 1; ug.gridy = 1; ug.weightx = 1.0;
        startSerialSpinner = new JSpinner(new SpinnerNumberModel(1, 1, Long.MAX_VALUE, 1));
        fixedUpcPanel.add(startSerialSpinner, ug);
        centerStack.add(fixedUpcPanel);

        JPanel fixedEpcCountPanel = new JPanel(new BorderLayout());
        fixedEpcCountPanel.setBorder(BorderFactory.createTitledBorder(
            BorderFactory.createEtchedBorder(), "EPC,Count (one per line)"));
        fixedEpcCountArea = new JTextArea(4, 30);
        fixedEpcCountArea.setFont(new Font("Monospaced", Font.PLAIN, 13));
        fixedEpcCountArea.setLineWrap(false);
        fixedEpcCountPanel.add(new JScrollPane(fixedEpcCountArea), BorderLayout.CENTER);
        centerStack.add(fixedEpcCountPanel);

        panel.add(centerStack, BorderLayout.CENTER);
        
        // Send Tags Button
        JPanel sendPanel = new JPanel(new FlowLayout(FlowLayout.CENTER, 10, 15));
        sendPanel.setBorder(BorderFactory.createCompoundBorder(
            BorderFactory.createEtchedBorder(),
            BorderFactory.createEmptyBorder(10, 10, 10, 10)
        ));
        
        sendTagsButton = new JButton("Send Tags");
        sendTagsButton.setFocusable(false);
        sendTagsButton.addActionListener(e -> sendTags());
        sendPanel.add(sendTagsButton);
        
        loopSendButton = new JButton("Loop Send");
        loopSendButton.setFocusable(false);
        loopSendButton.setPreferredSize(new Dimension(95, loopSendButton.getPreferredSize().height));
        loopSendButton.addActionListener(e -> toggleLoopSend());
        sendPanel.add(loopSendButton);
        
        stopFixedButton = new JButton("Stop");
        stopFixedButton.setFocusable(false);
        stopFixedButton.addActionListener(e -> stopSending());
        sendPanel.add(stopFixedButton);
        
        panel.add(sendPanel, BorderLayout.SOUTH);
        
        return panel;
    }

    private JPanel createHandheldPanel() {
        JPanel tabPanel = new JPanel(new BorderLayout(10, 10));
        JPanel panel = new JPanel(new GridBagLayout());
        panel.setBorder(BorderFactory.createTitledBorder(
            BorderFactory.createEtchedBorder(), "Handheld"));
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.anchor = GridBagConstraints.WEST;
        gbc.fill = GridBagConstraints.HORIZONTAL;

        // Info label
        gbc.gridx = 0; gbc.gridy = 0; gbc.gridwidth = 6;
		JLabel hint = new JLabel("On VSBL Debug Option, connect to this PC:10472");
        hint.setForeground(Color.DARK_GRAY);
        panel.add(hint, gbc);

        // Subscribe device ID
        gbc.gridx = 0; gbc.gridy = 1; gbc.gridwidth = 1;
        panel.add(new JLabel("Device ID:"), gbc);
        gbc.gridx = 1; gbc.weightx = 1.0;
        hhDeviceIdField = new JTextField("", 12);
        panel.add(hhDeviceIdField, gbc);
        gbc.gridx = 2; gbc.weightx = 0;
        hhSubscribeButton = new JButton("Subscribe");
        hhSubscribeButton.setFocusable(false);
        hhSubscribeButton.addActionListener(e -> subscribeDevice());
        panel.add(hhSubscribeButton, gbc);

        // UPC,Count list
        gbc.gridx = 0; gbc.gridy = 2; gbc.gridwidth = 1; gbc.weightx = 0;
        panel.add(new JLabel("UPC,Count (one per line):"), gbc);
        gbc.gridx = 1; gbc.gridy = 2; gbc.gridwidth = 5; gbc.weightx = 1.0;
        upcListArea = new JTextArea(5, 30);
        upcListArea.setFont(new Font("Monospaced", Font.PLAIN, 13));
        upcListArea.setLineWrap(false);
        upcListArea.setText("00000000000001,5\n00000000000002,3");
        panel.add(new JScrollPane(upcListArea), gbc);

        // EPC,Count list
        gbc.gridx = 0; gbc.gridy = 3; gbc.gridwidth = 1; gbc.weightx = 0;
        panel.add(new JLabel("EPC,Count (one per line):"), gbc);
        gbc.gridx = 1; gbc.gridy = 3; gbc.gridwidth = 5; gbc.weightx = 1.0;
        epcCountListArea = new JTextArea(5, 30);
        epcCountListArea.setFont(new Font("Monospaced", Font.PLAIN, 13));
        epcCountListArea.setLineWrap(false);
        panel.add(new JScrollPane(epcCountListArea), gbc);

        gbc.gridx = 0; gbc.gridy = 4; gbc.gridwidth = 6;
        JPanel hhActions = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        hhGenerateAndSendButton = new JButton("Generate EPCs -> HH");
        hhGenerateAndSendButton.setFocusable(false);
        hhGenerateAndSendButton.addActionListener(e -> generateAndSendToHandheld());
        hhActions.add(hhGenerateAndSendButton);
        hhStopButton = new JButton("Stop Emulating");
        hhStopButton.setFocusable(false);
        hhStopButton.addActionListener(e -> { handheldServer.cancelSend(); hhLog("Stop requested."); hhGenerateAndSendButton.setEnabled(true); });
        hhActions.add(hhStopButton);
        panel.add(hhActions, gbc);

        // Make the Handheld content and log resizable
        JSplitPane hhSplit = new JSplitPane(JSplitPane.VERTICAL_SPLIT, panel, createHHLogPanel());
        hhSplit.setResizeWeight(0.7);
        hhSplit.setBorder(null);

        tabPanel.add(hhSplit, BorderLayout.CENTER);
        return tabPanel;
    }

	private JPanel createFixedTab() {
		JPanel fixed = new JPanel(new BorderLayout(10, 10));
		// Fixed mode: show connection/config panel on the left and EPC/send in center
		fixed.add(createConfigurationPanel(), BorderLayout.WEST);
		// Center area contains EPC/send (top) and log (bottom) with resizable divider
		JSplitPane fixedSplit = new JSplitPane(JSplitPane.VERTICAL_SPLIT, createCenterPanel(), createFixedLogPanel());
		fixedSplit.setResizeWeight(0.75);
		fixedSplit.setBorder(null);
		fixed.add(fixedSplit, BorderLayout.CENTER);
		return fixed;
	}
    
    // Removed legacy createLogsPanel(); logs now live inside each tab

    private JPanel createHHLogPanel() {
        JPanel hhPanel = new JPanel(new BorderLayout());
        hhPanel.setBorder(BorderFactory.createTitledBorder("Handheld Log"));
        hhLogArea = new JTextArea(6, 50);
        hhLogArea.setEditable(false);
        hhLogArea.setFont(new Font("Monospaced", Font.PLAIN, 14));
        hhPanel.add(new JScrollPane(hhLogArea), BorderLayout.CENTER);
        JButton clearHh = new JButton("Clear");
        clearHh.setFocusable(false);
        clearHh.addActionListener(e -> hhLogArea.setText(""));
        hhPanel.add(clearHh, BorderLayout.EAST);
        return hhPanel;
    }

    private JPanel createFixedLogPanel() {
        JPanel fixedPanel = new JPanel(new BorderLayout());
        fixedPanel.setBorder(BorderFactory.createTitledBorder("Emulator Log"));
        logArea = new JTextArea(6, 50);
        logArea.setEditable(false);
        logArea.setFont(new Font("Monospaced", Font.PLAIN, 14));
        fixedPanel.add(new JScrollPane(logArea), BorderLayout.CENTER);
        JButton clear = new JButton("Clear");
        clear.setFocusable(false);
        clear.addActionListener(e -> logArea.setText(""));
        fixedPanel.add(clear, BorderLayout.EAST);
        return fixedPanel;
    }
    
    private void connect() {
        String host = hostField.getText().trim();
        String portText = portField.getText().trim();
        
        if (host.isEmpty() || portText.isEmpty()) {
            log("Error: Host and port are required");
            return;
        }
        
        try {
            int port = Integer.parseInt(portText);
            log("Connecting to " + host + ":" + port + "...");
            
            // Disable connect button during connection attempt
            connectButton.setEnabled(false);
            
            emulator.connect(host, port,
                message -> SwingUtilities.invokeLater(() -> {
                    log(message);
                    updateConnectionState(true);
                }),
                error -> SwingUtilities.invokeLater(() -> {
                    log(error);
                    updateConnectionState(false);
                    connectButton.setEnabled(true); // Re-enable on failure
                })
            );
        } catch (NumberFormatException e) {
            log("Error: Invalid port number");
            connectButton.setEnabled(true); // Re-enable on validation error
        }
    }
    
    private void disconnect() {
        log("Disconnecting...");
        emulator.disconnect(message -> 
            SwingUtilities.invokeLater(() -> {
                log(message);
                updateConnectionState(false);
            })
        );
    }
    
    private void sendTags() {
        sendTags(false);
    }
    
    private void sendTags(boolean isLooping) {
        if (!emulator.isConnected()) {
            log("Error: Not connected to server");
            if (isLooping) {
                loopSending = false;
                updateLoopButtonState();
            }
            return;
        }
        
        // Get default values
        String uid = uidField.getText().trim();
        int antenna = ((Number) antennaSpinner.getValue()).intValue();
        String rssi = rssiField.getText().trim();
        
        List<TagData> tags = new ArrayList<>();
        
        // From Fixed EPC,Count area
        if (fixedEpcCountArea.getText() != null && !fixedEpcCountArea.getText().trim().isEmpty()) {
            String[] epcCountLines = fixedEpcCountArea.getText().trim().split("\n");
            for (String line : epcCountLines) {
                String t = line.trim(); if (t.isEmpty()) continue;
                String[] parts = t.split(","); if (parts.length != 2) { log("Skipping invalid EPC line: " + t); continue; }
                String epc = parts[0].trim(); int qty; try { qty = Integer.parseInt(parts[1].trim()); } catch (NumberFormatException e) { log("Invalid EPC count: " + t); continue; }
                if (qty <= 0) continue;
                for (int i = 0; i < qty; i++) { tags.add(new TagData(epc, epc, uid, antenna, rssi)); }
            }
        }
        
        // From Fixed UPC,Count area using start serial
        if (fixedUpcListArea.getText() != null && !fixedUpcListArea.getText().trim().isEmpty()) {
            int startSerial = ((Number) startSerialSpinner.getValue()).intValue();
            String[] upcLines = fixedUpcListArea.getText().trim().split("\n");
            for (String line : upcLines) {
                String t = line.trim(); if (t.isEmpty()) continue;
                String[] parts = t.split(","); if (parts.length != 2) { log("Skipping invalid UPC line: " + t); continue; }
                String upc = parts[0].trim(); int qty; try { qty = Integer.parseInt(parts[1].trim()); } catch (NumberFormatException e) { log("Invalid UPC count: " + t); continue; }
                if (qty <= 0) continue;
                List<String> epcs = EpcGenerator.generateFromUpc(upc, qty, startSerial);
                for (String epc : epcs) { tags.add(new TagData(epc, epc, uid, antenna, rssi)); }
                startSerial += qty;
            }
        }
        
        if (tags.isEmpty()) {
            log("Error: No valid EPCs found");
            if (isLooping) {
                loopSending = false;
                updateLoopButtonState();
            }
            return;
        }
        
        VendorDriver driver = (VendorDriver) driverCombo.getSelectedItem();
        int delay = ((Number) delaySpinner.getValue()).intValue();
        
        log("Sending " + tags.size() + " tag(s) with driver: " + driver.getDriverCode());
        if (!isLooping) {
            sendTagsButton.setEnabled(false);
        }
        
        emulator.sendTags(tags, driver.getDriverCode(), delay,
            progress -> SwingUtilities.invokeLater(() -> log(progress)),
            complete -> SwingUtilities.invokeLater(() -> {
                log(complete);
                if (isLooping && loopSending) {
                    // Continue looping
                    sendTags(true);
                } else {
                    sendTagsButton.setEnabled(true);
                    if (isLooping) {
                        loopSending = false;
                        updateLoopButtonState();
                    }
                }
            })
        );
    }
    
    private void toggleLoopSend() {
        if (loopSending) {
            stopSending();
        } else {
            loopSending = true;
            updateLoopButtonState();
            log("Loop send started - will continuously send tags");
            sendTags(true);
        }
    }
    
    private void stopSending() {
        emulator.cancelSend();
        loopSending = false;
        log("Stop requested.");
        sendTagsButton.setEnabled(true);
        updateLoopButtonState();
    }
    
    private void updateLoopButtonState() {
        SwingUtilities.invokeLater(() -> {
            if (loopSending) {
                loopSendButton.setText("Stop Loop");
                loopSendButton.setBackground(new Color(220, 38, 38)); // Red background
                loopSendButton.setForeground(Color.WHITE);
                sendTagsButton.setEnabled(false);
            } else {
                loopSendButton.setText("Loop Send");
                loopSendButton.setBackground(null);
                loopSendButton.setForeground(null);
            }
        });
    }
    
    private void updateConnectionState(boolean connected) {
        connectButton.setEnabled(!connected);
        disconnectButton.setEnabled(connected);
        hostField.setEnabled(!connected);
        portField.setEnabled(!connected);
        sendTagsButton.setEnabled(connected);
        // no explicit HH connect/disconnect controls
    }
    
    private void log(String message) {
        String line = "[" + java.time.LocalTime.now().format(
            java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss")) + "] " + message + "\n";
        if (logArea != null) {
            logArea.append(line);
            logArea.setCaretPosition(logArea.getDocument().getLength());
        } else {
            System.out.print(line);
        }
    }

    private void hhLog(String message) {
        hhLogArea.append("[" + java.time.LocalTime.now().format(
            java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss")) + "] " + message + "\n");
        hhLogArea.setCaretPosition(hhLogArea.getDocument().getLength());
    }
    
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            try {
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
            } catch (Exception e) {
                // Use default look and feel
            }
            
            EmulatorUI ui = new EmulatorUI();
            ui.setVisible(true);
            
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                ui.emulator.shutdown();
                ui.handheldServer.shutdown();
            }));
        });
    }

    private void subscribeDevice() {
        String deviceId = hhDeviceIdField.getText().trim();
        if (!handheldServer.isRunning()) {
            handheldServer.start(this::hhLog, this::hhLog);
        }
        if (deviceId.isEmpty()) {
            hhLog("Subscribed");
        } else {
            hhLog("Subscribed to device: " + deviceId);
        }
    }

    private void generateAndSendToHandheld() {
        String upcText = upcListArea.getText().trim();
        String epcText = epcCountListArea.getText() == null ? "" : epcCountListArea.getText().trim();
        if (upcText.isEmpty() && epcText.isEmpty()) {
            hhLog("Error: No UPC,Count or EPC,Count lines");
            return;
        }
        List<String> allEpcs = new ArrayList<>();
        if (!upcText.isEmpty()) {
            String[] upcLines = upcText.split("\n");
            for (String line : upcLines) {
                String t = line.trim();
                if (t.isEmpty()) continue;
                String[] parts = t.split(",");
                if (parts.length != 2) { hhLog("Skipping invalid UPC line: " + t); continue; }
                String upc = parts[0].trim();
                int qty;
                try { qty = Integer.parseInt(parts[1].trim()); } catch (NumberFormatException e) { hhLog("Invalid UPC count: " + t); continue; }
                if (qty <= 0) { hhLog("Skipping non-positive UPC count: " + t); continue; }
                List<String> epcs = EpcGenerator.generateFromUpc(upc, qty);
                allEpcs.addAll(epcs);
            }
        }
        if (!epcText.isEmpty()) {
            String[] epcLines = epcText.split("\n");
            for (String line : epcLines) {
                String t = line.trim();
                if (t.isEmpty()) continue;
                String[] parts = t.split(",");
                if (parts.length != 2) { hhLog("Skipping invalid EPC line: " + t); continue; }
                String epc = parts[0].trim();
                int qty;
                try { qty = Integer.parseInt(parts[1].trim()); } catch (NumberFormatException e) { hhLog("Invalid EPC count: " + t); continue; }
                if (qty <= 0) { hhLog("Skipping non-positive EPC count: " + t); continue; }
                for (int i = 0; i < qty; i++) { allEpcs.add(epc); }
            }
        }
        if (allEpcs.isEmpty()) { hhLog("Error: No EPCs generated"); return; }
        hhGenerateAndSendButton.setEnabled(false);
        handheldServer.sendEpcs(allEpcs, ((Number) delaySpinner.getValue()).intValue(),
            progress -> SwingUtilities.invokeLater(() -> hhLog(progress)),
            complete -> SwingUtilities.invokeLater(() -> { hhLog(complete); hhGenerateAndSendButton.setEnabled(true); })
        );
    }

    private JPanel createOCRPanel() {
        JPanel tabPanel = new JPanel(new BorderLayout(10, 10));
        JPanel panel = new JPanel(new GridBagLayout());
        panel.setBorder(BorderFactory.createTitledBorder(
            BorderFactory.createEtchedBorder(), "OCR"));
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.anchor = GridBagConstraints.WEST;
        gbc.fill = GridBagConstraints.HORIZONTAL;

        // Message field
        gbc.gridx = 0; gbc.gridy = 0; gbc.gridwidth = 1;
        panel.add(new JLabel("Message:"), gbc);
        gbc.gridx = 1; gbc.weightx = 1.0;
        ocrMessageField = new JTextField("", 30);
        panel.add(ocrMessageField, gbc);
        
        gbc.gridx = 2; gbc.weightx = 0;
        ocrSendButton = new JButton("Send");
        ocrSendButton.setFocusable(false);
        ocrSendButton.addActionListener(e -> sendOCRMessage());
        panel.add(ocrSendButton, gbc);

        // Make the OCR content and log resizable
        JSplitPane ocrSplit = new JSplitPane(JSplitPane.VERTICAL_SPLIT, panel, createOCRLogPanel());
        ocrSplit.setResizeWeight(0.3);
        ocrSplit.setBorder(null);

        tabPanel.add(ocrSplit, BorderLayout.CENTER);
        return tabPanel;
    }

    private JPanel createOCRLogPanel() {
        JPanel ocrPanel = new JPanel(new BorderLayout());
        ocrPanel.setBorder(BorderFactory.createTitledBorder("OCR Log"));
        ocrLogArea = new JTextArea(6, 50);
        ocrLogArea.setEditable(false);
        ocrLogArea.setFont(new Font("Monospaced", Font.PLAIN, 14));
        ocrPanel.add(new JScrollPane(ocrLogArea), BorderLayout.CENTER);
        JButton clearOcr = new JButton("Clear");
        clearOcr.setFocusable(false);
        clearOcr.addActionListener(e -> ocrLogArea.setText(""));
        ocrPanel.add(clearOcr, BorderLayout.EAST);
        return ocrPanel;
    }

    private void ocrLog(String message) {
        ocrLogArea.append("[" + java.time.LocalTime.now().format(
            java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss")) + "] " + message + "\n");
        ocrLogArea.setCaretPosition(ocrLogArea.getDocument().getLength());
    }

    private void sendOCRMessage() {
        String message = ocrMessageField.getText().trim();
        if (message.isEmpty()) {
            ocrLog("Error: Message is empty");
            return;
        }
        
        String host = hostField.getText().trim();
        if (host.isEmpty()) {
            ocrLog("Error: Host is not set (use Fixed tab to set connection)");
            return;
        }

        ocrSendButton.setEnabled(false);
        new Thread(() -> {
            try {
                java.net.Socket socket = new java.net.Socket(host, 10482);
                java.io.PrintWriter writer = new java.io.PrintWriter(socket.getOutputStream(), true);
                writer.print(message + "\n");
                writer.flush();
                socket.close();
                
                SwingUtilities.invokeLater(() -> {
                    ocrLog("Sent: " + message);
                    ocrMessageField.setText("");
                    ocrSendButton.setEnabled(true);
                });
            } catch (Exception e) {
                SwingUtilities.invokeLater(() -> {
                    ocrLog("Error: " + e.getMessage());
                    ocrSendButton.setEnabled(true);
                });
            }
        }).start();
    }
}

