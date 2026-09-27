package com.zeus.rfid.ui.decode

import androidx.lifecycle.ViewModel
import com.zeus.rfid.data.tdt.TdtDecodeResult
import com.zeus.rfid.data.tdt.TdtEncodeResult
import com.zeus.rfid.data.tdt.TdtEngine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class DecodeEncodeUiState(
    val selectedTab: Int = 0, // 0 = Decode, 1 = Encode

    // Decode State
    val epcInput: String = "3034257BF400B40000000123",
    val forcedScheme: String = "",
    val detectedSchemes: List<String> = listOf("SGTIN-96"),
    val isDecoding: Boolean = false,
    val decodeResult: TdtDecodeResult? = null,
    val decodeError: String? = null,

    // Encode State
    val encodeInput: String = "",
    val encodeScheme: String = "SGTIN-96",
    val quickGtin: String = "09521234123453",
    val quickSerial: String = "123",
    val serialIsUid: Boolean = false,
    val companyPrefixLength: Int = 6,
    val filterValue: Int = 0,
    val quickSscc: String = "106141412345678908",
    val quickGln: String = "0614141000005",
    val quickGrai: String = "061414100000",
    val quickGiai: String = "06141410012345",
    val quickGm: String = "95100000",
    val quickObjectClass: String = "12345",
    val quickCage: String = "ABC12",
    val isEncoding: Boolean = false,
    val encodeResult: TdtEncodeResult? = null,
    val encodeError: String? = null
)

class DecodeEncodeViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(DecodeEncodeUiState())
    val uiState: StateFlow<DecodeEncodeUiState> = _uiState.asStateFlow()

    init {
        // Automatically decode initial sample so user sees interactive UI immediately
        onDecode()
    }

    fun setTab(tab: Int) {
        _uiState.update { it.copy(selectedTab = tab) }
    }

    fun setEpcInput(input: String) {
        val detected = TdtEngine.autodetect(input)
        _uiState.update {
            it.copy(
                epcInput = input,
                detectedSchemes = detected,
                decodeError = null
            )
        }
    }

    fun setForcedScheme(scheme: String) {
        _uiState.update { it.copy(forcedScheme = scheme) }
        onDecode()
    }

    fun onDecode() {
        val input = _uiState.value.epcInput.trim()
        if (input.isEmpty()) {
            _uiState.update { it.copy(decodeResult = null, decodeError = null) }
            return
        }

        _uiState.update { it.copy(isDecoding = true, decodeError = null) }
        val forced = _uiState.value.forcedScheme.takeIf { it.isNotEmpty() }
        val res = TdtEngine.decode(input, forced)

        if (res.isSuccess) {
            _uiState.update {
                it.copy(
                    isDecoding = false,
                    decodeResult = res.getOrNull(),
                    decodeError = null
                )
            }
        } else {
            _uiState.update {
                it.copy(
                    isDecoding = false,
                    decodeResult = null,
                    decodeError = res.exceptionOrNull()?.message ?: "Decoding failed"
                )
            }
        }
    }

    fun onClearDecode() {
        _uiState.update {
            it.copy(
                epcInput = "",
                forcedScheme = "",
                detectedSchemes = emptyList(),
                decodeResult = null,
                decodeError = null
            )
        }
    }

    fun applyExample(exampleValue: String) {
        setEpcInput(exampleValue)
        onDecode()
    }

    // -------------------------------------------------------------------------
    // ENCODE ACTIONS
    // -------------------------------------------------------------------------

    fun setEncodeInput(input: String) {
        val detected = TdtEngine.autodetect(input)
        _uiState.update {
            it.copy(
                encodeInput = input,
                encodeScheme = detected.firstOrNull() ?: it.encodeScheme,
                encodeError = null
            )
        }
    }

    fun setEncodeScheme(scheme: String) {
        _uiState.update { it.copy(encodeScheme = scheme, encodeError = null) }
    }

    fun setQuickGtin(gtin: String) {
        _uiState.update { it.copy(quickGtin = gtin, encodeError = null) }
    }

    fun setQuickSerial(serial: String) {
        _uiState.update { it.copy(quickSerial = serial, encodeError = null) }
    }

    fun setSerialIsUid(isUid: Boolean) {
        _uiState.update { it.copy(serialIsUid = isUid, encodeError = null) }
    }

    fun setCompanyPrefixLength(len: Int) {
        _uiState.update { it.copy(companyPrefixLength = len, encodeError = null) }
    }

    fun setFilterValue(filter: Int) {
        _uiState.update { it.copy(filterValue = filter, encodeError = null) }
    }

    fun setQuickSscc(sscc: String) {
        _uiState.update { it.copy(quickSscc = sscc, encodeError = null) }
    }

    fun setQuickGln(gln: String) {
        _uiState.update { it.copy(quickGln = gln, encodeError = null) }
    }

    fun setQuickGm(gm: String) {
        _uiState.update { it.copy(quickGm = gm, encodeError = null) }
    }

    fun setQuickObjectClass(oc: String) {
        _uiState.update { it.copy(quickObjectClass = oc, encodeError = null) }
    }

    fun setQuickCage(cage: String) {
        _uiState.update { it.copy(quickCage = cage, encodeError = null) }
    }

    fun onEncode() {
        val st = _uiState.value
        _uiState.update { it.copy(isEncoding = true, encodeError = null) }

        // If manual raw input is provided, attempt to decode it into HEX
        val rawInput = st.encodeInput.trim()
        if (rawInput.isNotEmpty()) {
            val dec = TdtEngine.decode(rawInput, st.encodeScheme)
            if (dec.isSuccess) {
                val r = dec.getOrThrow()
                val hex = r.hex ?: ""
                val encResult = TdtEncodeResult(
                    hex = hex,
                    scheme = r.scheme,
                    binary = r.binary ?: "",
                    pureUri = r.outputs[com.zeus.rfid.data.tdt.TdtOutputLevel.PURE_IDENTITY],
                    tagUri = r.outputs[com.zeus.rfid.data.tdt.TdtOutputLevel.TAG_ENCODING],
                    digitalLink = r.outputs[com.zeus.rfid.data.tdt.TdtOutputLevel.GS1_DIGITAL_LINK],
                    aiJson = r.outputs[com.zeus.rfid.data.tdt.TdtOutputLevel.GS1_AI_JSON],
                    bareId = r.outputs[com.zeus.rfid.data.tdt.TdtOutputLevel.BARE_IDENTIFIER]
                )
                _uiState.update { it.copy(isEncoding = false, encodeResult = encResult, encodeError = null) }
                return
            } else {
                _uiState.update {
                    it.copy(
                        isEncoding = false,
                        encodeResult = null,
                        encodeError = dec.exceptionOrNull()?.message ?: "Encoding raw identifier failed"
                    )
                }
                return
            }
        }

        // Quick Fields Encoding based on scheme
        val scheme = st.encodeScheme.uppercase()
        val encResult = when {
            scheme.contains("SSCC") -> {
                TdtEngine.encodeSscc96(
                    ssccInput = st.quickSscc,
                    companyPrefixLength = st.companyPrefixLength,
                    filterValue = st.filterValue
                )
            }
            scheme.contains("SGLN") -> {
                TdtEngine.encodeSgln96(
                    glnInput = st.quickGln,
                    serialInput = st.quickSerial,
                    companyPrefixLength = st.companyPrefixLength,
                    filterValue = st.filterValue
                )
            }
            scheme.contains("GID") -> {
                TdtEngine.encodeGid96(
                    generalManager = st.quickGm,
                    objectClass = st.quickObjectClass,
                    serial = st.quickSerial
                )
            }
            scheme.contains("USDOD") -> {
                TdtEngine.encodeUsdod96(
                    cageOrDodaac = st.quickCage,
                    serial = st.quickSerial,
                    filterValue = st.filterValue
                )
            }
            else -> {
                // Default SGTIN-96 / SGTIN+
                var serial = st.quickSerial.trim()
                if (st.serialIsUid) {
                    val parsed = TdtEngine.uidToSerial(serial)
                    if (parsed == null) {
                        _uiState.update {
                            it.copy(
                                isEncoding = false,
                                encodeResult = null,
                                encodeError = "UID must be E016 + 12 hex characters (e.g. E0167801034E89FC)"
                            )
                        }
                        return
                    }
                    serial = parsed.first
                }
                TdtEngine.encodeSgtin96(
                    gtinInput = st.quickGtin,
                    serialInput = serial,
                    companyPrefixLength = st.companyPrefixLength,
                    filterValue = st.filterValue
                )
            }
        }

        if (encResult.isSuccess) {
            _uiState.update {
                it.copy(
                    isEncoding = false,
                    encodeResult = encResult.getOrNull(),
                    encodeError = null
                )
            }
        } else {
            _uiState.update {
                it.copy(
                    isEncoding = false,
                    encodeResult = null,
                    encodeError = encResult.exceptionOrNull()?.message ?: "Encoding failed"
                )
            }
        }
    }

    fun sendToDecoder(hex: String) {
        _uiState.update {
            it.copy(
                selectedTab = 0,
                epcInput = hex,
                forcedScheme = ""
            )
        }
        onDecode()
    }
}
