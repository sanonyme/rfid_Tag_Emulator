package com.zeus.rfid.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Exact replica of the Lucide-react <Radio /> icon from the Electron Zeus desktop app.
 * A center dot with dual radiating RF/antenna wave arcs on left and right.
 */
@Composable
fun AntennaBroadcastIcon(
    modifier: Modifier = Modifier,
    size: Dp = 18.dp,
    tint: Color = Color.Unspecified
) {
    Canvas(modifier = modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val center = Offset(w / 2f, h / 2f)
        val strokeWidth = 2.dp.toPx()

        // Center dot (radius 2 in 24x24 scale)
        val dotRadius = (2f / 24f) * w
        drawCircle(
            color = tint,
            radius = dotRadius,
            center = center
        )

        // Inner arc pair (radius 6 in 24x24 scale)
        val innerRadius = (6f / 24f) * w
        // Right inner arc (around 315° to 45° -> sweep 90°)
        drawArc(
            color = tint,
            startAngle = -45f,
            sweepAngle = 90f,
            useCenter = false,
            topLeft = Offset(center.x - innerRadius, center.y - innerRadius),
            size = Size(innerRadius * 2f, innerRadius * 2f),
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
        )
        // Left inner arc (around 135° to 225° -> sweep 90°)
        drawArc(
            color = tint,
            startAngle = 135f,
            sweepAngle = 90f,
            useCenter = false,
            topLeft = Offset(center.x - innerRadius, center.y - innerRadius),
            size = Size(innerRadius * 2f, innerRadius * 2f),
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
        )

        // Outer arc pair (radius 10 in 24x24 scale)
        val outerRadius = (10f / 24f) * w
        // Right outer arc
        drawArc(
            color = tint,
            startAngle = -45f,
            sweepAngle = 90f,
            useCenter = false,
            topLeft = Offset(center.x - outerRadius, center.y - outerRadius),
            size = Size(outerRadius * 2f, outerRadius * 2f),
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
        )
        // Left outer arc
        drawArc(
            color = tint,
            startAngle = 135f,
            sweepAngle = 90f,
            useCenter = false,
            topLeft = Offset(center.x - outerRadius, center.y - outerRadius),
            size = Size(outerRadius * 2f, outerRadius * 2f),
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
        )
    }
}
