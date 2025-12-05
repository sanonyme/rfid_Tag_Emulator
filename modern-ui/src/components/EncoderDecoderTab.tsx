import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { ArrowRightLeft, Copy, Check } from 'lucide-react'
import { EPCGenerator } from '../lib/tcp-client'
import { toast } from 'sonner'

export function EncoderDecoderTab() {
  // State for Decoding (Hex -> GS1)
  const [hexInput, setHexInput] = useState('')
  const [decodedResult, setDecodedResult] = useState<{
    gtin?: string;
    serial?: string;
    filter?: number;
    partition?: number;
    companyPrefix?: number;
    itemReference?: number;
    error?: string;
  } | null>(null)

  // State for Encoding (GS1 -> Hex)
  const [gtinInput, setGtinInput] = useState('00000000000001')
  const [serialInput, setSerialInput] = useState('1')
  const [encodedHex, setEncodedHex] = useState('')
  const [filterInput, setFilterInput] = useState('0')
  const [partitionInput, setPartitionInput] = useState('6')

  const [copiedHex, setCopiedHex] = useState(false)

  // --- Decoding Logic ---
  const handleDecode = () => {
    try {
      let hex = hexInput.trim().replace(/[^0-9A-Fa-f]/g, '')
      if (hex.length !== 24) {
        setDecodedResult({ error: 'Input must be exactly 24 Hex characters (96 bits)' })
        return
      }

      // Convert Hex to Binary String (96 bits)
      let binary = ''
      for (let i = 0; i < hex.length; i++) {
        binary += parseInt(hex[i], 16).toString(2).padStart(4, '0')
      }

      // Parse SGTIN-96 Fields
      const header = parseInt(binary.substring(0, 8), 2)
      if (header !== 0x30) {
        setDecodedResult({ error: `Unsupported Header: 0x${header.toString(16).toUpperCase()} (Expected 0x30 for SGTIN-96)` })
        return
      }

      const filter = parseInt(binary.substring(8, 11), 2)
      const partition = parseInt(binary.substring(11, 14), 2)
      
      // Partition Table for SGTIN-96
      // P | Company Prefix Bits | Item Ref Bits
      // 0 | 40                  | 4
      // 1 | 37                  | 7
      // 2 | 34                  | 10
      // 3 | 30                  | 14
      // 4 | 27                  | 17
      // 5 | 24                  | 20
      // 6 | 20                  | 24
      
      let companyPrefixBits = 0
      let itemRefBits = 0
      
      switch (partition) {
        case 0: companyPrefixBits = 40; itemRefBits = 4; break;
        case 1: companyPrefixBits = 37; itemRefBits = 7; break;
        case 2: companyPrefixBits = 34; itemRefBits = 10; break;
        case 3: companyPrefixBits = 30; itemRefBits = 14; break;
        case 4: companyPrefixBits = 27; itemRefBits = 17; break;
        case 5: companyPrefixBits = 24; itemRefBits = 20; break;
        case 6: companyPrefixBits = 20; itemRefBits = 24; break;
        default: 
            setDecodedResult({ error: 'Invalid Partition value' });
            return;
      }

      const companyPrefixStart = 14
      const companyPrefixEnd = 14 + companyPrefixBits
      const itemRefEnd = companyPrefixEnd + itemRefBits
      
      const companyPrefix = parseInt(binary.substring(companyPrefixStart, companyPrefixEnd), 2)
      const itemRef = parseInt(binary.substring(companyPrefixEnd, itemRefEnd), 2)
      const serial = parseInt(binary.substring(itemRefEnd, 96), 2)

      // Reconstruct GTIN-14
      // We need to know the length of Company Prefix digits to reconstruct properly
      // P | L (Company Prefix Digits)
      // 0 | 12
      // 1 | 11
      // 2 | 10
      // 3 | 9
      // 4 | 8
      // 5 | 7
      // 6 | 6
      
      let companyPrefixDigits = 0
      switch(partition) {
          case 0: companyPrefixDigits = 12; break;
          case 1: companyPrefixDigits = 11; break;
          case 2: companyPrefixDigits = 10; break;
          case 3: companyPrefixDigits = 9; break;
          case 4: companyPrefixDigits = 8; break;
          case 5: companyPrefixDigits = 7; break;
          case 6: companyPrefixDigits = 6; break;
      }

      // Item Ref Digits = 13 - Company Prefix Digits
      const itemRefDigits = 13 - companyPrefixDigits

      const companyPrefixStr = companyPrefix.toString().padStart(companyPrefixDigits, '0')
      const itemRefStr = itemRef.toString().padStart(itemRefDigits, '0')
      
      // GTIN-13 Construction (without check digit): Indicator + Company + Item
      // ItemRefStr in SGTIN usually contains the Indicator digit as the first digit if ItemRef bits are large enough?
      // Actually, for SGTIN-96:
      // ItemReference is (Indicator Digit) + (Item Reference Digits)
      
      const itemRefFull = itemRefStr // This includes the indicator digit at the start
      
      // GTIN-14 (missing check digit) = Indicator(1) + Company(N) + ItemRef(M)
      // Actually, standard reconstruction:
      // Concatenate CompanyPrefix + ItemReference
      // This gives 13 digits (Indicator + Company + Item)
      
      let rawGtin = companyPrefixStr + itemRefStr
      
      // If rawGtin is less than 13 digits, pad left?
      // SGTIN Partition table ensures total is 13 digits (digits 1-13 of GTIN-14)
      
      // Calculate Check Digit (Luhn Algorithm for GTIN)
      let sum = 0
      for (let i = 0; i < 13; i++) {
        const digit = parseInt(rawGtin.charAt(i) || '0')
        // Weights alternate 3, 1, 3, 1... for GTIN-14 positions?
        // Actually, for GTIN-14 calculation:
        // Position 1 (Indicator) -> x3
        // Position 2 -> x1
        // ...
        // Wait, standard is from right to left.
        // Index 0 (Indicator) is Position 14 (if we have check digit).
        // Let's rely on standard modulo 10
        const weight = (i % 2 === 0) ? 3 : 1
        sum += digit * weight
      }
      
      const checkDigit = (10 - (sum % 10)) % 10
      const fullGtin = rawGtin + checkDigit

      setDecodedResult({
        gtin: fullGtin,
        serial: serial.toString(),
        filter,
        partition,
        companyPrefix,
        itemReference: itemRef
      })

    } catch (e) {
      setDecodedResult({ error: 'Decoding failed: ' + (e as any).message })
    }
  }

  // --- Encoding Logic ---
  const handleEncode = () => {
    try {
        // Reuse the logic from tcp-client, but exposed for single item
        // Note: EPCGenerator.generateFromUpc uses default partition 6.
        // We might want to make it flexible later, but for now let's use the existing helper
        // or re-implement strict SGTIN-96 encoding here to support custom partition.
        
        // Let's use the EPCGenerator for now as it's proven, but it forces Partition 6.
        // To support full encoder, we should replicate the logic with selectable partition.
        
        // Simplified Local Encoding to support custom partition/filter
        const gtin = gtinInput.replace(/[^0-9]/g, '').padStart(14, '0')
        const serial = parseInt(serialInput)
        const filter = parseInt(filterInput)
        const partition = parseInt(partitionInput)
        const header = 0x30

        // Digits 1-13
        const gtinData = gtin.substring(0, 13)
        
        // Determine split based on partition
        let companyPrefixDigits = 6
        let companyPrefixBits = 20
        let itemRefBits = 24
        
        switch(partition) {
            case 0: companyPrefixDigits=12; companyPrefixBits=40; itemRefBits=4; break;
            case 1: companyPrefixDigits=11; companyPrefixBits=37; itemRefBits=7; break;
            case 2: companyPrefixDigits=10; companyPrefixBits=34; itemRefBits=10; break;
            case 3: companyPrefixDigits=9;  companyPrefixBits=30; itemRefBits=14; break;
            case 4: companyPrefixDigits=8;  companyPrefixBits=27; itemRefBits=17; break;
            case 5: companyPrefixDigits=7;  companyPrefixBits=24; itemRefBits=20; break;
            case 6: companyPrefixDigits=6;  companyPrefixBits=20; itemRefBits=24; break;
        }

        // Indicator is the first digit of GTIN-14
        const indicator = gtin.charAt(0)
        // Company Prefix starts at char 1 (after indicator)
        const companyPrefixStr = gtin.substring(1, 1 + companyPrefixDigits)
        // Item Ref is Indicator + remaining digits
        const itemRefStr = indicator + gtin.substring(1 + companyPrefixDigits, 13)
        
        const companyPrefix = parseInt(companyPrefixStr)
        const itemRef = parseInt(itemRefStr)

        let bits = ''
        bits += header.toString(2).padStart(8, '0')
        bits += filter.toString(2).padStart(3, '0')
        bits += partition.toString(2).padStart(3, '0')
        bits += companyPrefix.toString(2).padStart(companyPrefixBits, '0')
        bits += itemRef.toString(2).padStart(itemRefBits, '0')
        bits += serial.toString(2).padStart(38, '0')

        let hex = ''
        for (let j = 0; j < bits.length; j += 4) {
            const nibble = bits.substr(j, 4)
            hex += parseInt(nibble, 2).toString(16).toUpperCase()
        }
        
        setEncodedHex(hex)
    } catch (e) {
        toast.error('Encoding failed: Check inputs')
    }
  }

  const copyToClipboard = () => {
    if (encodedHex) {
        navigator.clipboard.writeText(encodedHex)
        setCopiedHex(true)
        setTimeout(() => setCopiedHex(false), 2000)
        toast.success('Hex copied to clipboard')
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      {/* DECODER COLUMN */}
      <Card className="flex flex-col h-full bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-400" />
            Decoder (Hex → GS1)
          </CardTitle>
          <CardDescription>
            Enter a 24-char Hex EPC string to see the GS1 keys.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex-1">
          <div className="space-y-2">
            <Label>SGTIN-96 Hex</Label>
            <Input 
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                placeholder="e.g. 303402598009980000000001"
                className="font-mono"
            />
          </div>
          <Button onClick={handleDecode} className="w-full">Decode</Button>

          {decodedResult && (
            <div className="mt-6 p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
              {decodedResult.error ? (
                <div className="text-destructive font-medium">{decodedResult.error}</div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">GTIN-14</Label>
                    <div className="text-lg font-mono font-bold text-primary tracking-wider">
                      {decodedResult.gtin}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Serial Number</Label>
                    <div className="text-lg font-mono font-bold text-primary">
                      {decodedResult.serial}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t border-border/50">
                    <div>
                        <span className="text-muted-foreground">Filter: </span>
                        <span className="font-mono">{decodedResult.filter}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Partition: </span>
                        <span className="font-mono">{decodedResult.partition}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Company: </span>
                        <span className="font-mono">{decodedResult.companyPrefix}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Item Ref: </span>
                        <span className="font-mono">{decodedResult.itemReference}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ENCODER COLUMN */}
      <Card className="flex flex-col h-full bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="outline" className="px-1 py-0"><span className="text-[10px]">01</span></Badge>
            Encoder (GS1 → Hex)
          </CardTitle>
          <CardDescription>
            Create SGTIN-96 Hex from GTIN and Serial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 flex-1">
            <div className="space-y-2">
                <Label>GTIN-14</Label>
                <Input 
                    value={gtinInput}
                    onChange={(e) => setGtinInput(e.target.value)}
                    placeholder="00000000000001"
                    maxLength={14}
                    className="font-mono"
                />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Serial Number</Label>
                    <Input 
                        value={serialInput}
                        onChange={(e) => setSerialInput(e.target.value)}
                        placeholder="1"
                        type="number"
                        className="font-mono"
                    />
                </div>
                <div className="space-y-2">
                    <Label>Filter</Label>
                    <Input 
                        value={filterInput}
                        onChange={(e) => setFilterInput(e.target.value)}
                        placeholder="0"
                        type="number"
                        max={7}
                        className="font-mono"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Partition (0-6)</Label>
                <Input 
                    value={partitionInput}
                    onChange={(e) => setPartitionInput(e.target.value)}
                    placeholder="6"
                    type="number"
                    min={0}
                    max={6}
                    className="font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                    Partition 6 = Company Prefix 6 digits, Item Ref 24 bits.
                </p>
            </div>

            <Button onClick={handleEncode} variant="secondary" className="w-full">Encode</Button>

            {encodedHex && (
                <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
                    <Label className="text-xs text-muted-foreground">Result Hex</Label>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 block p-2 rounded bg-background font-mono text-sm break-all border">
                            {encodedHex}
                        </code>
                        <Button size="icon" variant="ghost" onClick={copyToClipboard}>
                            {copiedHex ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  )
}

