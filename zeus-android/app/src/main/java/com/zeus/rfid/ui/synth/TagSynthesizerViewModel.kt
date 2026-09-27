package com.zeus.rfid.ui.synth

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.widget.Toast
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.zeus.rfid.data.synth.BarcodeFormatType
import com.zeus.rfid.data.synth.EpcSchemeType
import com.zeus.rfid.data.synth.InditexFields
import com.zeus.rfid.data.synth.SynthesizedTag
import com.zeus.rfid.data.synth.TagSynthesizerEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class SynthesizerTab(val label: String) {
    TDS_EPC("GS1 TDS EPC"),
    BARCODE_QR("1D / 2D Barcode"),
    INDITEX_TEMPE("Inditex / Tempe"),
    PATTERN_BATCH("Custom Pattern")
}

data class TagSynthesizerUiState(
    val activeTab: SynthesizerTab = SynthesizerTab.TDS_EPC,

    // GS1 TDS EPC Parameters
    val selectedScheme: EpcSchemeType = EpcSchemeType.SGTIN_96,
    val gtinInput: String = "00012345678905",
    val companyPrefixLength: Int = 6,
    val filterValue: Int = 0,
    val serialPrefix: String = "SN-",
    val companyPrefixInput: String = "012345",
    val referenceOrLocationInput: String = "0001",
    val quantity: Int = 10,
    val startSerial: Long = 1L,

    // Inditex / Tempe Parameters
    val inditexFields: InditexFields = InditexFields(),
    val inditexQuantity: Int = 6,

    // Custom Pattern Parameters
    val customHexPrefix: String = "E28011303000",
    val customTargetLength: Int = 24,
    val customIsRandom: Boolean = false,
    val customStartSerial: Long = 1L,
    val customQuantity: Int = 10,

    // Barcode / QR Parameters
    val barcodeFormat: BarcodeFormatType = BarcodeFormatType.QR_CODE,
    val barcodeContent: String = "https://id.gs1.org/01/00012345678905/21/10001",
    val barcodeBitmap: Bitmap? = null,
    val barcodeErrorMessage: String? = null,

    // Results & Filtering
    val synthesizedTags: List<SynthesizedTag> = emptyList(),
    val searchQuery: String = "",
    val isSynthesizing: Boolean = false,
    val statusMessage: String? = null,

    // Check digit inspection
    val isGtinCheckDigitValid: Boolean = true,
    val suggestedCheckDigit: String = "5"
)

class TagSynthesizerViewModel(application: Application) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow(TagSynthesizerUiState())
    val uiState: StateFlow<TagSynthesizerUiState> = _uiState.asStateFlow()

    init {
        validateCurrentGtin()
        generateBarcode()
        // Generate an initial batch of SGTIN-96 tags for immediate user preview
        synthesizeTags()
    }

    fun selectTab(tab: SynthesizerTab) {
        _uiState.update { it.copy(activeTab = tab) }
        if (tab == SynthesizerTab.BARCODE_QR && _uiState.value.barcodeBitmap == null) {
            generateBarcode()
        }
    }

    fun setScheme(scheme: EpcSchemeType) {
        _uiState.update { it.copy(selectedScheme = scheme) }
    }

    fun updateGtin(gtin: String) {
        _uiState.update { it.copy(gtinInput = gtin) }
        validateCurrentGtin()
    }

    fun autoFixGtinCheckDigit() {
        val current = _uiState.value.gtinInput.filter { it.isDigit() }
        if (current.isEmpty()) return
        val body = if (current.length >= 14) current.take(13) else current.dropLast(1).ifEmpty { current }
        val check = TagSynthesizerEngine.calculateGtinCheckDigit(body)
        val fixed = "$body$check"
        _uiState.update {
            it.copy(
                gtinInput = fixed,
                isGtinCheckDigitValid = true,
                suggestedCheckDigit = check
            )
        }
    }

    private fun validateCurrentGtin() {
        val gtin = _uiState.value.gtinInput.filter { it.isDigit() }
        val isValid = TagSynthesizerEngine.validateGtinCheckDigit(gtin)
        val suggested = if (gtin.length >= 2) {
            TagSynthesizerEngine.calculateGtinCheckDigit(gtin.dropLast(1))
        } else "0"
        _uiState.update {
            it.copy(
                isGtinCheckDigitValid = isValid || gtin.length < 2,
                suggestedCheckDigit = suggested
            )
        }
    }

    fun updateCompanyPrefixLength(cpl: Int) {
        _uiState.update { it.copy(companyPrefixLength = cpl.coerceIn(6, 12)) }
    }

    fun updateFilterValue(filter: Int) {
        _uiState.update { it.copy(filterValue = filter.coerceIn(0, 7)) }
    }

    fun updateSerialPrefix(prefix: String) {
        _uiState.update { it.copy(serialPrefix = prefix) }
    }

    fun updateCompanyPrefixInput(prefix: String) {
        _uiState.update { it.copy(companyPrefixInput = prefix) }
    }

    fun updateReferenceInput(ref: String) {
        _uiState.update { it.copy(referenceOrLocationInput = ref) }
    }

    fun updateQuantity(qty: Int) {
        _uiState.update { it.copy(quantity = qty.coerceIn(1, 1000)) }
    }

    fun updateStartSerial(serial: Long) {
        _uiState.update { it.copy(startSerial = serial.coerceAtLeast(0L)) }
    }

    fun updateSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    // Inditex Setters
    fun updateInditexVersion(version: Int) {
        _uiState.update { it.copy(inditexFields = it.inditexFields.copy(version = version)) }
    }

    fun updateInditexBrand(brandId: Int) {
        _uiState.update { it.copy(inditexFields = it.inditexFields.copy(brandId = brandId)) }
    }

    fun updateInditexModel(model: Int) {
        _uiState.update { it.copy(inditexFields = it.inditexFields.copy(model = model)) }
    }

    fun updateInditexQuality(quality: Int) {
        _uiState.update { it.copy(inditexFields = it.inditexFields.copy(quality = quality)) }
    }

    fun updateInditexColor(color: Int) {
        _uiState.update { it.copy(inditexFields = it.inditexFields.copy(color = color)) }
    }

    fun updateInditexSize(size: Int) {
        _uiState.update { it.copy(inditexFields = it.inditexFields.copy(size = size)) }
    }

    fun updateInditexQuantity(qty: Int) {
        _uiState.update { it.copy(inditexQuantity = qty.coerceIn(1, 1000)) }
    }

    fun updateInditexStartSerial(serial: Long) {
        _uiState.update { it.copy(inditexFields = it.inditexFields.copy(startSerial = serial)) }
    }

    // Custom Pattern Setters
    fun updateCustomPrefix(prefix: String) {
        _uiState.update { it.copy(customHexPrefix = prefix) }
    }

    fun updateCustomLength(length: Int) {
        _uiState.update { it.copy(customTargetLength = length.coerceIn(8, 64)) }
    }

    fun updateCustomIsRandom(isRandom: Boolean) {
        _uiState.update { it.copy(customIsRandom = isRandom) }
    }

    fun updateCustomQuantity(qty: Int) {
        _uiState.update { it.copy(customQuantity = qty.coerceIn(1, 1000)) }
    }

    fun updateCustomStartSerial(serial: Long) {
        _uiState.update { it.copy(customStartSerial = serial.coerceAtLeast(0L)) }
    }

    // Barcode Setters
    fun updateBarcodeFormat(format: BarcodeFormatType) {
        _uiState.update { it.copy(barcodeFormat = format) }
        generateBarcode()
    }

    fun updateBarcodeContent(content: String) {
        _uiState.update { it.copy(barcodeContent = content) }
        generateBarcode()
    }

    fun generateBarcode() {
        viewModelScope.launch(Dispatchers.Default) {
            val state = _uiState.value
            val content = state.barcodeContent.trim()
            if (content.isEmpty()) {
                _uiState.update { it.copy(barcodeBitmap = null, barcodeErrorMessage = "Content cannot be empty.") }
                return@launch
            }

            val format = state.barcodeFormat.zxingFormat
            val width = if (format == com.google.zxing.BarcodeFormat.QR_CODE) 600 else 720
            val height = if (format == com.google.zxing.BarcodeFormat.QR_CODE) 600 else 240

            val result = TagSynthesizerEngine.generateBarcodeBitmap(
                content = content,
                format = format,
                widthPx = width,
                heightPx = height
            )

            result.onSuccess { bmp ->
                _uiState.update { it.copy(barcodeBitmap = bmp, barcodeErrorMessage = null) }
            }.onFailure { err ->
                _uiState.update {
                    it.copy(
                        barcodeBitmap = null,
                        barcodeErrorMessage = err.localizedMessage ?: "Failed to generate barcode"
                    )
                }
            }
        }
    }

    fun synthesizeTags() {
        viewModelScope.launch(Dispatchers.Default) {
            _uiState.update { it.copy(isSynthesizing = true, statusMessage = "Synthesizing tags...") }
            val state = _uiState.value

            val generated: List<SynthesizedTag> = when (state.activeTab) {
                SynthesizerTab.TDS_EPC -> {
                    when (state.selectedScheme) {
                        EpcSchemeType.SGTIN_96 -> TagSynthesizerEngine.synthesizeSgtin96(
                            gtinInput = state.gtinInput,
                            companyPrefixLength = state.companyPrefixLength,
                            filter = state.filterValue,
                            quantity = state.quantity,
                            startSerial = state.startSerial
                        )
                        EpcSchemeType.SGTIN_198 -> TagSynthesizerEngine.synthesizeSgtin198(
                            gtinInput = state.gtinInput,
                            companyPrefixLength = state.companyPrefixLength,
                            serialPrefix = state.serialPrefix,
                            filter = state.filterValue,
                            quantity = state.quantity,
                            startSerial = state.startSerial
                        )
                        EpcSchemeType.SSCC_96 -> TagSynthesizerEngine.synthesizeSscc96(
                            companyPrefix = state.companyPrefixInput,
                            serialRefBase = state.referenceOrLocationInput,
                            filter = state.filterValue,
                            quantity = state.quantity,
                            startSerial = state.startSerial
                        )
                        EpcSchemeType.SGLN_96 -> TagSynthesizerEngine.synthesizeSgln96(
                            companyPrefix = state.companyPrefixInput,
                            locationRef = state.referenceOrLocationInput,
                            filter = state.filterValue,
                            quantity = state.quantity,
                            startExtension = state.startSerial
                        )
                        EpcSchemeType.GRAI_96 -> TagSynthesizerEngine.synthesizeGrai96(
                            companyPrefix = state.companyPrefixInput,
                            assetType = state.referenceOrLocationInput,
                            filter = state.filterValue,
                            quantity = state.quantity,
                            startSerial = state.startSerial
                        )
                        EpcSchemeType.GIAI_96 -> TagSynthesizerEngine.synthesizeGiai96(
                            companyPrefix = state.companyPrefixInput,
                            assetRefBase = state.referenceOrLocationInput,
                            filter = state.filterValue,
                            quantity = state.quantity,
                            startSerial = state.startSerial
                        )
                        EpcSchemeType.INDITEX_TEMPE -> TagSynthesizerEngine.synthesizeInditex(
                            fields = state.inditexFields,
                            quantity = state.quantity
                        )
                        EpcSchemeType.CUSTOM_PATTERN -> TagSynthesizerEngine.synthesizeCustomPattern(
                            hexPrefix = state.customHexPrefix,
                            targetLength = state.customTargetLength,
                            startSerial = state.customStartSerial,
                            isRandom = state.customIsRandom,
                            quantity = state.customQuantity
                        )
                    }
                }
                SynthesizerTab.INDITEX_TEMPE -> {
                    TagSynthesizerEngine.synthesizeInditex(
                        fields = state.inditexFields,
                        quantity = state.inditexQuantity
                    )
                }
                SynthesizerTab.PATTERN_BATCH -> {
                    TagSynthesizerEngine.synthesizeCustomPattern(
                        hexPrefix = state.customHexPrefix,
                        targetLength = state.customTargetLength,
                        startSerial = state.customStartSerial,
                        isRandom = state.customIsRandom,
                        quantity = state.customQuantity
                    )
                }
                SynthesizerTab.BARCODE_QR -> {
                    // When on Barcode tab, generate barcode and create a single tag entry with payload
                    val content = state.barcodeContent.trim()
                    listOf(
                        SynthesizedTag(
                            index = 1,
                            epc = content,
                            scheme = EpcSchemeType.CUSTOM_PATTERN,
                            details = "${state.barcodeFormat.label}: $content",
                            rawValue = content,
                            pureUri = content
                        )
                    )
                }
            }

            _uiState.update {
                it.copy(
                    synthesizedTags = generated,
                    isSynthesizing = false,
                    statusMessage = "Successfully synthesized ${generated.size} tags."
                )
            }
        }
    }

    // Apply Presets
    fun applyPreset(presetName: String) {
        when (presetName) {
            "Retail SGTIN-96" -> {
                _uiState.update {
                    it.copy(
                        activeTab = SynthesizerTab.TDS_EPC,
                        selectedScheme = EpcSchemeType.SGTIN_96,
                        gtinInput = "00012345678905",
                        companyPrefixLength = 6,
                        filterValue = 0,
                        quantity = 10,
                        startSerial = 1L
                    )
                }
                validateCurrentGtin()
                synthesizeTags()
            }
            "Pallet SSCC-96" -> {
                _uiState.update {
                    it.copy(
                        activeTab = SynthesizerTab.TDS_EPC,
                        selectedScheme = EpcSchemeType.SSCC_96,
                        companyPrefixInput = "012345",
                        referenceOrLocationInput = "0001",
                        filterValue = 0,
                        quantity = 8,
                        startSerial = 1L
                    )
                }
                synthesizeTags()
            }
            "Warehouse SGLN-96" -> {
                _uiState.update {
                    it.copy(
                        activeTab = SynthesizerTab.TDS_EPC,
                        selectedScheme = EpcSchemeType.SGLN_96,
                        companyPrefixInput = "012345",
                        referenceOrLocationInput = "001",
                        filterValue = 0,
                        quantity = 12,
                        startSerial = 100L
                    )
                }
                synthesizeTags()
            }
            "Returnable Tote GRAI-96" -> {
                _uiState.update {
                    it.copy(
                        activeTab = SynthesizerTab.TDS_EPC,
                        selectedScheme = EpcSchemeType.GRAI_96,
                        companyPrefixInput = "012345",
                        referenceOrLocationInput = "1001",
                        filterValue = 0,
                        quantity = 5,
                        startSerial = 1L
                    )
                }
                synthesizeTags()
            }
            "Tempe V2 (Zara Footwear)" -> {
                _uiState.update {
                    it.copy(
                        activeTab = SynthesizerTab.INDITEX_TEMPE,
                        inditexFields = InditexFields(
                            version = 2,
                            brandId = 2, // Tempe
                            model = 1253,
                            quality = 640,
                            color = 100,
                            size = 38,
                            startSerial = 141802403393L
                        ),
                        inditexQuantity = 6
                    )
                }
                synthesizeTags()
            }
            "Inditex V2 (Zara Apparel)" -> {
                _uiState.update {
                    it.copy(
                        activeTab = SynthesizerTab.INDITEX_TEMPE,
                        inditexFields = InditexFields(
                            version = 2,
                            brandId = 1, // Inditex
                            model = 3615,
                            quality = 410,
                            color = 105,
                            size = 37,
                            startSerial = 43384800584L
                        ),
                        inditexQuantity = 7
                    )
                }
                synthesizeTags()
            }
            "GS1 Digital Link QR" -> {
                _uiState.update {
                    it.copy(
                        activeTab = SynthesizerTab.BARCODE_QR,
                        barcodeFormat = BarcodeFormatType.GS1_DIGITAL_LINK,
                        barcodeContent = "https://id.gs1.org/01/00012345678905/21/10001"
                    )
                }
                generateBarcode()
            }
            "Retail Code 128" -> {
                _uiState.update {
                    it.copy(
                        activeTab = SynthesizerTab.BARCODE_QR,
                        barcodeFormat = BarcodeFormatType.CODE_128,
                        barcodeContent = "ZEUS-RFID-1002"
                    )
                }
                generateBarcode()
            }
        }
    }

    // Export Actions
    fun copyAllToClipboard(context: Context) {
        val tags = _uiState.value.synthesizedTags
        if (tags.isEmpty()) {
            Toast.makeText(context, "No tags to copy", Toast.LENGTH_SHORT).show()
            return
        }
        val text = tags.joinToString("\n") { it.epc }
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("Synthesized EPCs", text)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(context, "Copied ${tags.size} tags to clipboard", Toast.LENGTH_SHORT).show()
    }

    fun copyTagToClipboard(context: Context, epc: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("Synthesized Tag EPC", epc)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(context, "Copied $epc", Toast.LENGTH_SHORT).show()
    }

    fun shareTags(context: Context) {
        val tags = _uiState.value.synthesizedTags
        if (tags.isEmpty()) {
            Toast.makeText(context, "No tags to share", Toast.LENGTH_SHORT).show()
            return
        }
        val text = tags.joinToString("\n") { it.epc }
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Zeus Synthesized RFID Tags (${tags.size})")
            putExtra(Intent.EXTRA_TEXT, text)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(intent, "Share Synthesized Tags"))
    }

    fun clearTags() {
        _uiState.update { it.copy(synthesizedTags = emptyList(), statusMessage = null) }
    }
}
