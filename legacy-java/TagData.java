public class TagData {
    private final String epc;
    private final String tid;
    private final String uid;
    private final int antenna;
    private final String rssi;

    public TagData(String epc, String tid, String uid, int antenna, String rssi) {
        this.epc = epc;
        this.tid = tid;
        this.uid = uid;
        this.antenna = antenna;
        this.rssi = rssi;
    }

    public String getEpc() {
        return epc;
    }

    public String getTid() {
        return tid;
    }

    public String getUid() {
        return uid;
    }

    public int getAntenna() {
        return antenna;
    }

    public String getRssi() {
        return rssi;
    }

    public String formatMessage(String driver) {
        return String.format("driver=%s epc=%s @tid=%s uid=%s antenna=%d @rssi=%s\n",
                driver, epc, tid, uid, antenna, rssi);
    }

    @Override
    public String toString() {
        return epc;
    }
}

