public enum VendorDriver {
    ALL("All", "llrp"),
    ALIEN("Alien", "arp"),
    IMPINJ_R700("Impinj R700", "impinjetk"),
    IMPINJ_OTHERS("Impinj Others", "octane"),
    SEUIC("SEUIC", "seuic");

    private final String displayName;
    private final String driverCode;

    VendorDriver(String displayName, String driverCode) {
        this.displayName = displayName;
        this.driverCode = driverCode;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getDriverCode() {
        return driverCode;
    }

    @Override
    public String toString() {
        return driverCode + " (" + displayName + ")";
    }
}

