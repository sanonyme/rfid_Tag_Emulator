import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;

public class EpcGenerator {
    // Generate EPCs using SGTIN-96 from a GTIN-14 (UPC padded to 14 digits) and serials 1..quantity.
    // Implements partition table for CompanyPrefixLength = 6 (per reference), filter = 0, header = 0x30.
    public static List<String> generateFromUpc(String upc, int quantity) {
        return generateFromUpc(upc, quantity, 1);
    }

    public static List<String> generateFromUpc(String upc, int quantity, long startSerial) {
        String digits = upc == null ? "" : upc.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return new ArrayList<>();

        // Pad to GTIN-14 (left pad with zeros)
        if (digits.length() < 14) {
            digits = ("00000000000000" + digits).substring(digits.length());
        } else if (digits.length() > 14) {
            digits = digits.substring(digits.length() - 14); // take right-most 14
        }

        // Extract GTIN fields
        int companyPrefixLengthDigits = 6; // from reference
        int filter = 0;
        int partition = 6; // for CPL=6

        char indicatorDigit = digits.charAt(0);
        String companyPrefixDigits = digits.substring(1, 1 + companyPrefixLengthDigits);
        // Item ref is 13 - CPL digits; includes indicator as MS digit per SGTIN
        String itemRefDigits = indicatorDigit + digits.substring(1 + companyPrefixLengthDigits, 13);
        // check digit (digits.charAt(13)) is not encoded in SGTIN-96

        long companyPrefix = new BigInteger(companyPrefixDigits).longValue();
        long itemRef = new BigInteger(itemRefDigits).longValue();

        // Bit widths for partition 6
        int companyPrefixBits = 20;
        int itemRefBits = 24;

        // Build fixed fields
        int header = 0x30; // 0011 0000

        List<String> results = new ArrayList<>();
        int qty = Math.max(0, quantity);
        long firstSerial =  Math.max(1, startSerial);
        for (int i = 0; i < qty; i++) {
            long serialValue = (long) firstSerial + i; // 38 bits

            // Assemble bit string
            StringBuilder bits = new StringBuilder(96);
            bits.append(leftPad(Integer.toBinaryString(header), 8));
            bits.append(leftPad(Integer.toBinaryString(filter), 3));
            bits.append(leftPad(Integer.toBinaryString(partition), 3));
            bits.append(leftPad(Long.toBinaryString(companyPrefix), companyPrefixBits));
            bits.append(leftPad(Long.toBinaryString(itemRef), itemRefBits));
            bits.append(leftPad(Long.toBinaryString(serialValue), 38));

            // Convert bits to hex (24 hex chars)
            BigInteger bi = new BigInteger(bits.toString(), 2);
            String hex = bi.toString(16).toUpperCase();
            if (hex.length() < 24) hex = String.format("%024X", bi);
            results.add(hex);
        }
        return results;
    }

    private static String leftPad(String s, int width) {
        if (s.length() >= width) return s;
        StringBuilder sb = new StringBuilder(width);
        for (int i = s.length(); i < width; i++) sb.append('0');
        sb.append(s);
        return sb.toString();
    }
}


