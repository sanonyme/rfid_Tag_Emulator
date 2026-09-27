package com.zeus.rfid.ui.components

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.max

/**
 * Ensures any draggable bottom sheet or settings modal stops safely below the phone's front camera
 * cutout / punch hole and status bar, preventing it from clipping or reaching the utmost top of the phone.
 */
@Composable
fun Modifier.sheetTopCameraSafePadding(
    extraSpacing: Dp = 20.dp,
    minTopMargin: Dp = 76.dp
): Modifier {
    val statusBarTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val cutoutTop = WindowInsets.displayCutout.asPaddingValues().calculateTopPadding()
    val safeTopMargin = max(minTopMargin, max(statusBarTop, cutoutTop) + extraSpacing)
    return this.padding(top = safeTopMargin)
}

/**
 * Ensures any page header or screen top bar has generous, safe spacing below the camera punch hole
 * and status bar, guaranteeing it never collides or collapses with the camera cutout.
 */
@Composable
fun Modifier.pageTopCameraSafePadding(
    extraSpacing: Dp = 8.dp
): Modifier {
    val statusBarTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val cutoutTop = WindowInsets.displayCutout.asPaddingValues().calculateTopPadding()
    val safeTopMargin = max(statusBarTop, cutoutTop) + extraSpacing
    return this.padding(top = safeTopMargin)
}
