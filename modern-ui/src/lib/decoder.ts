// EPC Encoder and Decoder Utilities (SGTIN-96)

export class EPCDecoder {
  static decodeSgtin96(hexEpc: string): {
    gtin?: string
    serial?: string
    error?: string
    companyPrefix?: string
    itemReference?: string
    filter?: number
    partition?: number
  } {
    try {
      // 1. Basic Validation
      if (!hexEpc || hexEpc.length !== 24) {
        return { error: 'EPC must be exactly 24 hex characters (96 bits)' }
      }

      // 2. Convert Hex to Binary String (96 bits)
      let binary = ''
      for (let i = 0; i < hexEpc.length; i++) {
        const hexChar = hexEpc[i]
        const bin = parseInt(hexChar, 16).toString(2).padStart(4, '0')
        binary += bin
      }

      // 3. Parse Fields
      // Header: 8 bits
      const header = parseInt(binary.substring(0, 8), 2)
      if (header !== 0x30) {
        return { error: `Unsupported header: 0x${header.toString(16)}. Only SGTIN-96 (0x30) is supported.` }
      }

      // Filter: 3 bits
      const filter = parseInt(binary.substring(8, 11), 2)

      // Partition: 3 bits
      const partition = parseInt(binary.substring(11, 14), 2)

      // Determine lengths based on Partition Table
      const partitionTable = [
        { companyBits: 40, itemBits: 4, companyDigits: 12, itemDigits: 1 }, // 0
        { companyBits: 37, itemBits: 7, companyDigits: 11, itemDigits: 2 }, // 1
        { companyBits: 34, itemBits: 10, companyDigits: 10, itemDigits: 3 }, // 2
        { companyBits: 30, itemBits: 14, companyDigits: 9, itemDigits: 4 },  // 3
        { companyBits: 27, itemBits: 17, companyDigits: 8, itemDigits: 5 },  // 4
        { companyBits: 24, itemBits: 20, companyDigits: 7, itemDigits: 6 },  // 5
        { companyBits: 20, itemBits: 24, companyDigits: 6, itemDigits: 7 },  // 6
      ]

      if (partition >= partitionTable.length) {
        return { error: `Invalid partition value: ${partition}` }
      }

      const rule = partitionTable[partition]
      let cursor = 14 // Start after partition

      // Company Prefix
      const companyPrefixVal = parseInt(binary.substring(cursor, cursor + rule.companyBits), 2)
      const companyPrefixStr = companyPrefixVal.toString().padStart(rule.companyDigits, '0')
      cursor += rule.companyBits

      // Item Reference
      const itemRefVal = parseInt(binary.substring(cursor, cursor + rule.itemBits), 2)
      const itemRefStr = itemRefVal.toString().padStart(rule.itemDigits, '0')
      cursor += rule.itemBits

      // Serial Number: 38 bits
      // Use BigInt for 38-bit serial because it can exceed 2^32
      const serialBin = binary.substring(cursor, cursor + 38)
      const serialVal = BigInt('0b' + serialBin).toString()

      // 4. Reconstruct GTIN-14
      // GTIN-14 = Indicator + CompanyPrefix + ItemRef + CheckDigit
      // In SGTIN-96, Indicator is the first digit of ItemReference (actually it's more complex, but standard simplification:)
      // Actually: ItemReference in SGTIN-96 = Indicator(1) + ItemRef(N-1)
      // So we just concatenate CompanyPrefix + ItemRef and calculate Check Digit
      
      const rawGtinBase = itemRefStr.charAt(0) + companyPrefixStr + itemRefStr.substring(1)
      const checkDigit = this.calculateCheckDigit(rawGtinBase)
      const gtin = rawGtinBase + checkDigit

      return {
        gtin,
        serial: serialVal,
        filter,
        partition,
        companyPrefix: companyPrefixStr,
        itemReference: itemRefStr
      }

    } catch (e: any) {
      return { error: `Decoding error: ${e.message}` }
    }
  }

  static calculateCheckDigit(digits: string): string {
    let sum = 0
    for (let i = 0; i < digits.length; i++) {
      const digit = parseInt(digits.charAt(digits.length - 1 - i))
      sum += (i % 2 === 0) ? digit * 3 : digit
    }
    const nearestTen = Math.ceil(sum / 10) * 10
    return (nearestTen - sum).toString()
  }

  static getPartitionFromCompanyPrefixLength(length: number): number {
    // SGTIN-96 Partition Table
    // Length | Partition
    // 12     | 0
    // 11     | 1
    // 10     | 2
    // 9      | 3
    // 8      | 4
    // 7      | 5
    // 6      | 6
    switch (length) {
      case 12: return 0
      case 11: return 1
      case 10: return 2
      case 9: return 3
      case 8: return 4
      case 7: return 5
      case 6: return 6
      default: return 6 // Default to 6 if invalid
    }
  }
}

export class EPCEncoder {
  static encodeSgtin96(gtinInput: string, serialInput: string, companyPrefixLength: number = 0, filterValue: number = 0): { epc?: string, error?: string } {
    try {
      // 1. Clean Inputs
      let gtin = gtinInput.replace(/[^0-9]/g, '')
      const serial = serialInput.trim()

      if (!gtin || !serial) return { error: 'Missing GTIN or Serial' }

      // Pad GTIN to 14 digits
      if (gtin.length < 14) gtin = gtin.padStart(14, '0')
      if (gtin.length > 14) gtin = gtin.slice(-14)

      // 2. Constants
      const header = 0x30
      const filter = filterValue // Use provided filter
      
      // Determine Partition
      // If user provided a specific length (e.g., from UI dropdown), use it.
      // Otherwise, attempt to guess or default.
      let partition = 6
      let companyDigits = 6
      let itemDigits = 7
      
      // If a valid length is provided (6-12), use it to set partition
      if (companyPrefixLength >= 6 && companyPrefixLength <= 12) {
        partition = EPCDecoder.getPartitionFromCompanyPrefixLength(companyPrefixLength)
        companyDigits = companyPrefixLength
        // Total GTIN-14 digits = 13 (excluding check)
        // Item Digits = 13 - Company Digits
        itemDigits = 13 - companyDigits
      }

      // SGTIN-96 Partition Table Logic
      // 0: Company=12, Item=1  (40 bits, 4 bits)
      // 1: Company=11, Item=2  (37 bits, 7 bits)
      // 2: Company=10, Item=3  (34 bits, 10 bits)
      // 3: Company=9,  Item=4  (30 bits, 14 bits)
      // 4: Company=8,  Item=5  (27 bits, 17 bits)
      // 5: Company=7,  Item=6  (24 bits, 20 bits)
      // 6: Company=6,  Item=7  (20 bits, 24 bits)

      const partitionTable = [
        { companyBits: 40, itemBits: 4 },  // 0
        { companyBits: 37, itemBits: 7 },  // 1
        { companyBits: 34, itemBits: 10 }, // 2
        { companyBits: 30, itemBits: 14 }, // 3
        { companyBits: 27, itemBits: 17 }, // 4
        { companyBits: 24, itemBits: 20 }, // 5
        { companyBits: 20, itemBits: 24 }, // 6
      ]

      const rule = partitionTable[partition]
      
      // Parse GTIN fields based on selected partition
      // GTIN-14 = Indicator(1) + GS1 Prefix(N) + Item Ref(M) + Check(1)
      // SGTIN Logic:
      // Company Prefix = GS1 Prefix(N)
      // Item Reference = Indicator(1) + Item Ref(M)
      
      // Start at index 1 (skip Indicator temporarily)
      // Company Prefix is at gtin.substring(1, 1 + companyDigits)
      const companyPrefixStr = gtin.substring(1, 1 + companyDigits)
      
      // Item Ref Part is remaining digits before check digit
      // Indicator is at index 0
      const indicator = gtin.charAt(0)
      const itemRefPart = gtin.substring(1 + companyDigits, 13)
      const itemRefStr = indicator + itemRefPart

      const companyPrefix = parseInt(companyPrefixStr)
      const itemRef = parseInt(itemRefStr)
      
      // Validate bounds
      const maxCompany = Math.pow(10, companyDigits) - 1
      if (companyPrefix > maxCompany) return { error: 'Company Prefix too large for selected length' }
      
      const maxItem = Math.pow(10, itemDigits) - 1
      if (itemRef > maxItem) return { error: 'Item Reference too large for selected length' }

      // Parse Serial
      let serialVal: bigint
      try {
        serialVal = BigInt(serial)
      } catch {
         return { error: 'Serial must be numeric for SGTIN-96' }
      }
      
      if (serialVal >= (BigInt(1) << BigInt(38))) {
        return { error: 'Serial number too large for 38 bits' }
      }

      // 3. Construct Binary
      let binary = ''
      binary += header.toString(2).padStart(8, '0')
      binary += filter.toString(2).padStart(3, '0')
      binary += partition.toString(2).padStart(3, '0')
      binary += companyPrefix.toString(2).padStart(rule.companyBits, '0')
      binary += itemRef.toString(2).padStart(rule.itemBits, '0')
      binary += serialVal.toString(2).padStart(38, '0')

      // 4. Convert to Hex
      let hex = ''
      for (let i = 0; i < binary.length; i += 4) {
        const nibble = binary.substr(i, 4)
        hex += parseInt(nibble, 2).toString(16).toUpperCase()
      }

      return { epc: hex }

    } catch (e: any) {
      return { error: `Encoding error: ${e.message}` }
    }
  }
}
