/// SGTIN-96 encoder (matches `src/lib/epc-encoders.ts` generateSgtin96).
struct PartitionEntry {
    prefix_digits: u32,
    partition: u32,
    prefix_bits: u32,
    other_bits: u32,
}

const SGTIN_PARTITIONS: [PartitionEntry; 7] = [
    PartitionEntry { prefix_digits: 12, partition: 0, prefix_bits: 40, other_bits: 4 },
    PartitionEntry { prefix_digits: 11, partition: 1, prefix_bits: 37, other_bits: 7 },
    PartitionEntry { prefix_digits: 10, partition: 2, prefix_bits: 34, other_bits: 10 },
    PartitionEntry { prefix_digits: 9, partition: 3, prefix_bits: 30, other_bits: 14 },
    PartitionEntry { prefix_digits: 8, partition: 4, prefix_bits: 27, other_bits: 17 },
    PartitionEntry { prefix_digits: 7, partition: 5, prefix_bits: 24, other_bits: 20 },
    PartitionEntry { prefix_digits: 6, partition: 6, prefix_bits: 20, other_bits: 24 },
];

const SGTIN96_HEADER: u32 = 0x30;

fn digits_only(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_digit()).collect()
}

fn to_bits(value: u128, width: u32) -> String {
    format!("{:0width$b}", value, width = width as usize)
}

fn bits_to_hex(bits: &str) -> Result<String, String> {
    if bits.len() % 4 != 0 {
        return Err(format!("bit-string length {} is not a multiple of 4", bits.len()));
    }
    let mut hex = String::new();
    for chunk in bits.as_bytes().chunks(4) {
        let n = u8::from_str_radix(std::str::from_utf8(chunk).unwrap_or("0000"), 2).unwrap_or(0);
        hex.push_str(&format!("{:X}", n));
    }
    Ok(hex)
}

fn find_partition(prefix_digits: u32) -> Option<&'static PartitionEntry> {
    SGTIN_PARTITIONS.iter().find(|p| p.prefix_digits == prefix_digits)
}

pub fn generate_sgtin96(
    upc: &str,
    quantity: u32,
    start_serial: u32,
    company_prefix_length: u32,
    filter: u32,
) -> Result<Vec<String>, String> {
    let mut gtin = digits_only(upc);
    if gtin.is_empty() {
        return Ok(vec![]);
    }
    if gtin.len() < 14 {
        gtin = format!("{:0>14}", gtin);
    }
    if gtin.len() > 14 {
        gtin = gtin[gtin.len() - 14..].to_string();
    }

    let partition = find_partition(company_prefix_length)
        .ok_or_else(|| format!("unsupported company prefix length {company_prefix_length}"))?;

    let indicator = gtin.chars().next().unwrap_or('0');
    let cp_start = 1usize;
    let cp_end = cp_start + company_prefix_length as usize;
    let company_prefix = gtin[cp_start..cp_end.min(13)].to_string();
    let item_ref = format!(
        "{}{}",
        indicator,
        &gtin[cp_end.min(13)..13.min(gtin.len())]
    );

    let header_bits = to_bits(SGTIN96_HEADER as u128, 8);
    let filter_bits = to_bits(filter as u128, 3);
    let partition_bits = to_bits(partition.partition as u128, 3);
    let cp_bits = to_bits(company_prefix.parse::<u128>().unwrap_or(0), partition.prefix_bits);
    let item_ref_bits = to_bits(item_ref.parse::<u128>().unwrap_or(0), partition.other_bits);
    let prefix = format!("{header_bits}{filter_bits}{partition_bits}{cp_bits}{item_ref_bits}");

    let qty = quantity;
    let first_serial = start_serial.max(1);
    let mut out = Vec::new();
    for i in 0..qty {
        let serial_bits = to_bits((first_serial + i) as u128, 38);
        out.push(bits_to_hex(&(prefix.clone() + &serial_bits))?);
    }
    Ok(out)
}

pub fn parse_start_serial(s: Option<&str>) -> u32 {
    s.and_then(|v| v.trim().parse().ok())
        .filter(|&n| n > 0)
        .unwrap_or(1)
}

pub fn iterate_non_blank_lines(text: &str) -> impl Iterator<Item = &str> {
    text.lines().map(str::trim).filter(|l| !l.is_empty())
}

#[derive(Clone)]
pub struct HandheldTag {
    pub epc: String,
    pub tid: String,
    pub rssi: String,
}

pub fn count_recipe_tags(recipe: &serde_json::Value) -> u32 {
    let mut count = 0u32;
    for tag in iterate_recipe_tags(recipe) {
        let _ = tag;
        count += 1;
    }
    count
}

pub fn iterate_recipe_tags(recipe: &serde_json::Value) -> Vec<HandheldTag> {
    let rssi = recipe
        .get("rssi")
        .and_then(|v| v.as_str())
        .unwrap_or("70")
        .to_string();
    let serial_continues = recipe
        .get("serialContinuesAcrossUpcLines")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let base_serial = parse_start_serial(recipe.get("startSerial").and_then(|v| v.as_str()));
    let mut out = Vec::new();

    if let Some(upc_text) = recipe.get("upcList").and_then(|v| v.as_str()) {
        let upc_text = upc_text.trim();
        if !upc_text.is_empty() {
            let mut serial = base_serial;
            for line in iterate_non_blank_lines(upc_text) {
                let parts: Vec<&str> = line.split(',').collect();
                let upc = parts.first().copied().unwrap_or("").trim();
                let qty: u32 = parts
                    .get(1)
                    .and_then(|s| s.trim().parse().ok())
                    .unwrap_or(0);
                let custom_tid = parts.get(2).map(|s| s.trim()).filter(|s| !s.is_empty());
                if qty == 0 || upc.is_empty() {
                    continue;
                }
                let start = if serial_continues { serial } else { base_serial };
                if let Ok(epcs) = generate_sgtin96(upc, qty, start, 6, 0) {
                    for (i, epc) in epcs.into_iter().enumerate() {
                        out.push(HandheldTag {
                            tid: custom_tid.unwrap_or(&epc).to_string(),
                            epc,
                            rssi: rssi.clone(),
                        });
                        let _ = i;
                    }
                }
                if serial_continues {
                    serial += qty;
                }
            }
        }
    }

    if let Some(epc_text) = recipe.get("epcList").and_then(|v| v.as_str()) {
        for line in iterate_non_blank_lines(epc_text.trim()) {
            let parts: Vec<&str> = line.split(',').collect();
            let epc = parts.first().copied().unwrap_or("").trim();
            let custom_tid = parts.get(1).map(|s| s.trim()).filter(|s| !s.is_empty());
            if !epc.is_empty() {
                out.push(HandheldTag {
                    epc: epc.to_string(),
                    tid: custom_tid.unwrap_or(epc).to_string(),
                    rssi: rssi.clone(),
                });
            }
        }
    }
    out
}
