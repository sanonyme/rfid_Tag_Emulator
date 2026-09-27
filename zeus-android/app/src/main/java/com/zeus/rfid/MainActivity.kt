package com.zeus.rfid

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.navigation.compose.rememberNavController
import com.zeus.rfid.navigation.AppNavHost
import com.zeus.rfid.ui.theme.ZeusTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val appContainer = (application as ZeusApplication).container

        setContent {
            ZeusTheme {
                // Request Android 13+ (API 33+) nearby wifi devices permission if required
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    val permissionLauncher = rememberLauncherForActivityResult(
                        contract = ActivityResultContracts.RequestPermission()
                    ) { isGranted ->
                        // Discovery continues gracefully regardless of permission result
                    }

                    LaunchedEffect(Unit) {
                        val hasNearbyWifiPermission = ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.NEARBY_WIFI_DEVICES
                        ) == PackageManager.PERMISSION_GRANTED

                        if (!hasNearbyWifiPermission) {
                            permissionLauncher.launch(Manifest.permission.NEARBY_WIFI_DEVICES)
                        }
                    }
                }

                Surface(
                    modifier = Modifier.fillMaxSize()
                ) {
                    val navController = rememberNavController()
                    AppNavHost(
                        navController = navController,
                        container = appContainer
                    )
                }
            }
        }
    }
}
