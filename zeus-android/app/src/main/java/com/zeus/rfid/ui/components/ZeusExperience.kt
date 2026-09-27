package com.zeus.rfid.ui.components

import android.animation.ValueAnimator
import android.content.Context
import android.content.SharedPreferences
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zeus.rfid.ui.util.DiscoverySounds
import kotlin.math.PI
import kotlin.math.sin

enum class ZeusModule(val label: String, val accent: Color) {
    Home("ZEUS STUDIO", Color(0xFF35D4E8)),
    Discovery("EDGE DISCOVERY", Color(0xFF35D4E8)),
    Fixed("FIXED READER", Color(0xFF35D4E8)),
    Handheld("HANDHELD", Color(0xFF31D6AB)),
    Codec("GS1 CODEC", Color(0xFFB696F8)),
    Files("FILE EXPLORER", Color(0xFF31D6AB)),
    Database("DATABASE", Color(0xFF78A8FF)),
    Ocr("OCR & BARCODE", Color(0xFFF6B75B)),
    Network("LAN SCANNER", Color(0xFF31D6AB)),
    Synthesizer("TAG LAB", Color(0xFFB696F8)),
    Nfc("NFC RFID READER", Color(0xFFFF718C)),
    Suite("ZEUS SUITE", Color(0xFFB696F8))
}

val LocalZeusModule = staticCompositionLocalOf { ZeusModule.Home }

/** One persisted preference set for feedback throughout the app. */
object ZeusExperienceSettings {
    private var preferences: SharedPreferences? = null
    var soundEnabled by mutableStateOf(true)
        private set
    var motionEnabled by mutableStateOf(true)
        private set
    var hapticEnabled by mutableStateOf(true)
        private set
    var themeMode by mutableStateOf("SYSTEM") // SYSTEM, DARK, LIGHT
        private set
    var uiStyle by mutableStateOf("GLASS") // GLASS, NORMAL
        private set

    fun initialize(context: Context) {
        if (preferences != null) return
        preferences = context.applicationContext.getSharedPreferences("zeus_experience", Context.MODE_PRIVATE)
        val previous = context.getSharedPreferences("discovery_ui", Context.MODE_PRIVATE)
        soundEnabled = preferences!!.getBoolean("sound", previous.getBoolean("sounds", true))
        motionEnabled = preferences!!.getBoolean("motion", true)
        hapticEnabled = preferences!!.getBoolean("haptic", true)
        themeMode = preferences!!.getString("theme_mode", "SYSTEM") ?: "SYSTEM"
        uiStyle = preferences!!.getString("ui_style", "GLASS") ?: "GLASS"
    }

    fun setSound(enabled: Boolean) {
        soundEnabled = enabled
        preferences?.edit()?.putBoolean("sound", enabled)?.apply()
    }

    fun setMotion(enabled: Boolean) {
        motionEnabled = enabled
        preferences?.edit()?.putBoolean("motion", enabled)?.apply()
    }

    fun setHaptic(enabled: Boolean) {
        hapticEnabled = enabled
        preferences?.edit()?.putBoolean("haptic", enabled)?.apply()
    }

    fun setTheme(mode: String) {
        themeMode = mode
        preferences?.edit()?.putString("theme_mode", mode)?.apply()
    }

    @JvmName("applyUiStyle")
    fun setUiStyle(style: String) {
        uiStyle = style
        preferences?.edit()?.putString("ui_style", style)?.apply()
    }
}

@Composable
fun isZeusDarkTheme(): Boolean {
    val systemInDark = isSystemInDarkTheme()
    return when (ZeusExperienceSettings.themeMode) {
        "DARK" -> true
        "LIGHT" -> false
        else -> systemInDark
    }
}

@Composable
fun isZeusGlass(): Boolean {
    return ZeusExperienceSettings.uiStyle == "GLASS"
}

@Composable
fun zeusCardBg(isDark: Boolean = isZeusDarkTheme()): Color {
    val glass = isZeusGlass()
    return when {
        glass && isDark -> Color(0xED152336)
        glass && !isDark -> Color(0xE6FFFFFF)
        !glass && isDark -> Color(0xFF152336)
        else -> Color(0xFFFFFFFF)
    }
}

@Composable
fun zeusCardBorderColor(isDark: Boolean = isZeusDarkTheme()): Color {
    val glass = isZeusGlass()
    return when {
        glass && isDark -> Color(0x35A9C4D9)
        glass && !isDark -> Color(0x2B000000)
        !glass && isDark -> Color(0xFF31445D)
        else -> Color(0x26000000)
    }
}

@Composable
fun zeusCardBorder(isDark: Boolean = isZeusDarkTheme(), accent: Color = LocalZeusModule.current.accent): BorderStroke {
    val glass = isZeusGlass()
    return if (glass) {
        BorderStroke(
            1.dp,
            Brush.linearGradient(
                if (isDark) listOf(
                    Color.White.copy(alpha = 0.28f),
                    accent.copy(alpha = 0.35f),
                    Color.White.copy(alpha = 0.08f)
                ) else listOf(
                    Color.White.copy(alpha = 0.85f),
                    accent.copy(alpha = 0.25f),
                    Color.Black.copy(alpha = 0.12f)
                )
            )
        )
    } else {
        BorderStroke(
            1.dp,
            if (isDark) Color(0xFF31445D) else Color(0x26000000)
        )
    }
}

@Composable
fun zeusInnerBoxBg(isDark: Boolean = isZeusDarkTheme()): Color {
    val glass = isZeusGlass()
    return when {
        glass && isDark -> Color(0xB00B1728)
        glass && !isDark -> Color(0x0F000000)
        !glass && isDark -> Color(0xFF0B1728)
        else -> Color(0xFFF1F5F9)
    }
}

@Composable
fun zeusMotionEnabled(): Boolean =
    ZeusExperienceSettings.motionEnabled && ValueAnimator.areAnimatorsEnabled()

/** The phase is read in draw lambdas, so ambient animation does not recompose forms. */
@Composable
private fun rememberZeusPhase(): State<Float> {
    if (!zeusMotionEnabled()) return remember { mutableFloatStateOf(0f) }
    return rememberInfiniteTransition(label = "ZeusAmbient").animateFloat(
        0f, (2 * PI).toFloat(),
        infiniteRepeatable(tween(14000, easing = LinearEasing)),
        label = "AmbientPhase"
    )
}

@Composable
fun ZeusAtmosphere(modifier: Modifier = Modifier, color: Color = LocalZeusModule.current.accent) {
    val phase = rememberZeusPhase()
    Canvas(modifier) {
        val shift = sin(phase.value) * size.width * 0.12f
        val center = Offset(size.width * 0.85f + shift, size.height * 0.12f)
        drawCircle(
            Brush.radialGradient(listOf(color.copy(alpha = 0.13f), Color.Transparent),
                center, size.width * 0.85f),
            size.width * 0.85f, center
        )
        val lower = Offset(size.width * 0.15f - shift, size.height * 0.88f)
        drawCircle(
            Brush.radialGradient(listOf(color.copy(alpha = 0.07f), Color.Transparent),
                lower, size.width * 0.7f),
            size.width * 0.7f, lower
        )
        for (index in 0..14) {
            val x = (index * 73f % size.width)
            val y = size.height * (index / 15f)
            drawCircle(color.copy(alpha = 0.12f), 1.dp.toPx(), Offset(x, y))
        }
    }
}

@Deprecated("Controls moved to GlobalSettingsSheet")
@Composable
fun ZeusExperienceControls() {
    // Moved to GlobalSettingsSheet
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ZeusScaffold(
    module: ZeusModule,
    status: String = "Ready",
    busy: Boolean = false,
    modifier: Modifier = Modifier,
    topBar: @Composable () -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    snackbarHost: @Composable () -> Unit = {},
    floatingActionButton: @Composable () -> Unit = {},
    floatingActionButtonPosition: FabPosition = FabPosition.End,
    containerColor: Color = MaterialTheme.colorScheme.background,
    contentColor: Color = contentColorFor(containerColor),
    contentWindowInsets: WindowInsets = ScaffoldDefaults.contentWindowInsets,
    content: @Composable (PaddingValues) -> Unit
) {
    CompositionLocalProvider(LocalZeusModule provides module) {
        Box(modifier.fillMaxSize().background(containerColor)) {
            ZeusAtmosphere(Modifier.matchParentSize(), module.accent)
            Scaffold(
                modifier = Modifier.fillMaxSize(),
                topBar = {
                    Column {
                        topBar()
                        ZeusModuleStatus(module = module, status = status, busy = busy)
                    }
                },
                bottomBar = bottomBar, snackbarHost = snackbarHost,
                floatingActionButton = floatingActionButton,
                floatingActionButtonPosition = floatingActionButtonPosition,
                containerColor = Color.Transparent, contentColor = contentColor,
                contentWindowInsets = contentWindowInsets, content = content
            )
        }
    }
}

@Composable
private fun ZeusModuleStatus(module: ZeusModule, status: String, busy: Boolean) {
    val accent = module.accent
    val labelColor = if (isZeusDarkTheme()) accent else lerp(accent, Color(0xFF122436), 0.48f)
    val surface = zeusCardBg()
    val border = zeusCardBorderColor()
    val phase = if (busy && zeusMotionEnabled()) {
        rememberInfiniteTransition(label = "ModuleActivity").animateFloat(
            initialValue = 0.25f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(850), RepeatMode.Reverse),
            label = "ActivityOpacity"
        ).value
    } else 1f

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 5.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(surface)
            .border(1.dp, border, RoundedCornerShape(18.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            Modifier.size(9.dp).clip(RoundedCornerShape(50))
                .background(accent.copy(alpha = phase))
                .semantics { contentDescription = if (busy) "Active" else "Ready" }
        )
        Column(Modifier.weight(1f)) {
            Text(
                module.label,
                color = labelColor,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.5.sp,
                maxLines = 1
            )
            Text(
                status,
                color = MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Text(
            if (busy) "LIVE" else "READY",
            color = labelColor,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold
        )
    }
}

/** Existing panel content remains intact; all panels share a short reveal and edge light. */
@Composable
fun ZeusCard(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(22.dp),
    colors: CardColors = CardDefaults.cardColors(),
    elevation: CardElevation = CardDefaults.cardElevation(),
    border: BorderStroke? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val motion = zeusMotionEnabled()
    val isDark = isZeusDarkTheme()
    val reveal = remember { Animatable(if (motion) 0f else 1f) }
    LaunchedEffect(motion) {
        if (motion) reveal.animateTo(1f, tween(420)) else reveal.snapTo(1f)
    }
    val accent = LocalZeusModule.current.accent
    val effectiveBorder = border ?: zeusCardBorder(isDark, accent)
    val effectiveColors = if (colors == CardDefaults.cardColors()) {
        CardDefaults.cardColors(containerColor = zeusCardBg(isDark))
    } else {
        colors
    }
    Card(
        modifier = modifier.graphicsLayer {
            alpha = reveal.value
            translationY = (1f - reveal.value) * 18.dp.toPx()
        }.then(if (motion) Modifier.animateContentSize(tween(240)) else Modifier),
        shape = shape, colors = effectiveColors, elevation = elevation,
        border = effectiveBorder,
        content = content
    )
}

@Composable
fun ZeusActionButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: Shape = ButtonDefaults.shape,
    colors: ButtonColors = ButtonDefaults.buttonColors(),
    elevation: ButtonElevation? = ButtonDefaults.buttonElevation(),
    border: BorderStroke? = null,
    contentPadding: PaddingValues = ButtonDefaults.ContentPadding,
    interactionSource: MutableInteractionSource? = null,
    content: @Composable RowScope.() -> Unit
) {
    val interaction = interactionSource ?: remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val motion = zeusMotionEnabled()
    val scale by animateFloatAsState(if (pressed && motion) 0.96f else 1f,
        spring(dampingRatio = 0.6f, stiffness = 450f), label = "ActionPress")
    val effectiveColors = if (colors == ButtonDefaults.buttonColors()) {
        ButtonDefaults.buttonColors(
            containerColor = LocalZeusModule.current.accent,
            contentColor = Color(0xFF071522)
        )
    } else colors
    Button(
        onClick = {
            DiscoverySounds.tap(ZeusExperienceSettings.soundEnabled)
            onClick()
        }, modifier = modifier.graphicsLayer { scaleX = scale; scaleY = scale },
        enabled = enabled, shape = shape, colors = effectiveColors, elevation = elevation,
        border = border, contentPadding = contentPadding, interactionSource = interaction,
        content = content
    )
}
