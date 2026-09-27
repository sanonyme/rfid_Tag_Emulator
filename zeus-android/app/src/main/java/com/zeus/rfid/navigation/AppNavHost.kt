package com.zeus.rfid.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.toRoute
import com.zeus.rfid.AppContainer
import com.zeus.rfid.ui.common.ComingSoonScreen
import com.zeus.rfid.ui.discover.DiscoverScreen
import com.zeus.rfid.ui.discover.DiscoverViewModel
import com.zeus.rfid.ui.mode.ModeSelectScreen
import com.zeus.rfid.ui.mode.ModeSelectViewModel
import com.zeus.rfid.ui.options.OptionsScreen
import com.zeus.rfid.ui.options.OptionsViewModel
import com.zeus.rfid.ui.emulation.EmulationScreen
import com.zeus.rfid.ui.emulation.EmulationViewModel
import com.zeus.rfid.ui.handheld.HandheldConnectScreen
import com.zeus.rfid.ui.handheld.HandheldConnectViewModel
import com.zeus.rfid.ui.handheld.HandheldEmulationScreen
import com.zeus.rfid.ui.handheld.HandheldEmulationViewModel

import com.zeus.rfid.ui.decode.DecodeEncodeScreen
import com.zeus.rfid.ui.decode.DecodeEncodeViewModel
import com.zeus.rfid.ui.database.DatabaseScreen
import com.zeus.rfid.ui.database.DatabaseViewModel
import com.zeus.rfid.ui.files.FilesScreen
import com.zeus.rfid.ui.files.FilesViewModel
import com.zeus.rfid.ui.other.OtherToolsScreen
import com.zeus.rfid.ui.ocr.OcrScreen
import com.zeus.rfid.ui.ocr.OcrViewModel
import com.zeus.rfid.ui.netscan.LanScannerScreen
import com.zeus.rfid.ui.netscan.LanScannerViewModel
import com.zeus.rfid.ui.synth.TagSynthesizerScreen
import com.zeus.rfid.ui.synth.TagSynthesizerViewModel
import com.zeus.rfid.ui.nfc.NfcScreen
import com.zeus.rfid.ui.nfc.NfcViewModel

@Composable
fun AppNavHost(
    navController: NavHostController,
    container: AppContainer,
    modifier: Modifier = Modifier
) {
    val motionEnabled = com.zeus.rfid.ui.components.zeusMotionEnabled()
    val transitionMs = if (motionEnabled) 320 else 0
    NavHost(
        navController = navController,
        startDestination = Screen.ModeSelect,
        enterTransition = {
            slideIntoContainer(
                towards = AnimatedContentTransitionScope.SlideDirection.Start,
                animationSpec = tween(transitionMs),
                initialOffset = { it / 7 }
            ) + fadeIn(tween(transitionMs)) + scaleIn(tween(transitionMs), initialScale = 0.97f)
        },
        exitTransition = {
            slideOutOfContainer(
                towards = AnimatedContentTransitionScope.SlideDirection.Start,
                animationSpec = tween(transitionMs),
                targetOffset = { it / 10 }
            ) + fadeOut(tween(transitionMs)) + scaleOut(tween(transitionMs), targetScale = 0.985f)
        },
        popEnterTransition = {
            slideIntoContainer(
                towards = AnimatedContentTransitionScope.SlideDirection.End,
                animationSpec = tween(transitionMs),
                initialOffset = { it / 10 }
            ) + fadeIn(tween(transitionMs)) + scaleIn(tween(transitionMs), initialScale = 0.985f)
        },
        popExitTransition = {
            slideOutOfContainer(
                towards = AnimatedContentTransitionScope.SlideDirection.End,
                animationSpec = tween(transitionMs),
                targetOffset = { it / 7 }
            ) + fadeOut(tween(transitionMs)) + scaleOut(tween(transitionMs), targetScale = 0.97f)
        },
        modifier = modifier
    ) {
        composable<Screen.ModeSelect> {
            val viewModel: ModeSelectViewModel = viewModel()
            ModeSelectScreen(
                viewModel = viewModel,
                onNavigateToFixed = {
                    navController.navigate(Screen.DiscoverServers)
                },
                onNavigateToHandheldConnect = {
                    navController.navigate(Screen.HandheldConnect)
                },
                onNavigateToDecode = {
                    navController.navigate(Screen.DecodeEncode)
                },
                onNavigateToDatabase = {
                    navController.navigate(Screen.Database)
                },
                onNavigateToFiles = {
                    navController.navigate(Screen.Files)
                },
                onNavigateToOcr = {
                    navController.navigate(Screen.Ocr)
                },
                onNavigateToLanScanner = {
                    navController.navigate(Screen.LanScanner)
                },
                onNavigateToTagSynthesizer = {
                    navController.navigate(Screen.TagSynthesizer)
                },
                onNavigateToNfc = {
                    navController.navigate(Screen.Nfc)
                },
                onNavigateToComingSoon = { title ->
                    navController.navigate(Screen.ComingSoon(title))
                }
            )
        }

        composable<Screen.Nfc> {
            val viewModel: NfcViewModel = viewModel()
            NfcScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                },
                onNavigateToDecode = { _ ->
                    navController.navigate(Screen.DecodeEncode)
                },
                onNavigateToFixed = {
                    navController.navigate(Screen.DiscoverServers)
                },
                onNavigateToHandheld = {
                    navController.navigate(Screen.HandheldConnect)
                }
            )
        }

        composable<Screen.TagSynthesizer> {
            val viewModel: TagSynthesizerViewModel = viewModel()
            TagSynthesizerScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable<Screen.Ocr> {
            val viewModel: OcrViewModel = viewModel()
            OcrScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable<Screen.LanScanner> {
            val viewModel: LanScannerViewModel = viewModel()
            LanScannerScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable<Screen.Database> {
            val viewModel: DatabaseViewModel = viewModel()
            DatabaseScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable<Screen.Files> {
            val viewModel: FilesViewModel = viewModel()
            FilesScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable<Screen.DecodeEncode> {
            val viewModel: DecodeEncodeViewModel = viewModel()
            DecodeEncodeScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable<Screen.OtherTools> { backStackEntry ->
            val route: Screen.OtherTools = backStackEntry.toRoute()
            OtherToolsScreen(
                initialTab = route.initialTab,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }



        composable<Screen.HandheldConnect> {
            val viewModel: HandheldConnectViewModel = viewModel()
            HandheldConnectScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                },
                onNavigateToEmulation = { clientIp ->
                    navController.navigate(Screen.HandheldEmulation(initialClientIp = clientIp))
                }
            )
        }

        composable<Screen.HandheldEmulation> { backStackEntry ->
            val route: Screen.HandheldEmulation = backStackEntry.toRoute()
            val viewModel: HandheldEmulationViewModel = viewModel(
                factory = HandheldEmulationViewModel.provideFactory(
                    initialClientIp = route.initialClientIp
                )
            )
            HandheldEmulationScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable<Screen.DiscoverServers> {
            val viewModel: DiscoverViewModel = viewModel(
                factory = DiscoverViewModel.provideFactory(
                    discoveryRepository = container.discoveryRepository,
                    serverRepository = container.serverRepository
                )
            )
            DiscoverScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                },
                onNavigateToOptions = { server ->
                    navController.navigate(
                        Screen.Options(
                            serverName = server.name,
                            host = server.host,
                            port = server.port
                        )
                    )
                }
            )
        }

        composable<Screen.Options> { backStackEntry ->
            val route: Screen.Options = backStackEntry.toRoute()
            val viewModel: OptionsViewModel = viewModel(
                factory = OptionsViewModel.provideFactory(
                    serverName = route.serverName,
                    host = route.host,
                    port = route.port
                )
            )
            OptionsScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                },
                onNavigateToEmulation = {
                    navController.navigate(
                        Screen.Emulation(
                            serverName = route.serverName,
                            host = route.host,
                            port = route.port
                        )
                    )
                }
            )
        }

        composable<Screen.ComingSoon> { backStackEntry ->
            val route: Screen.ComingSoon = backStackEntry.toRoute()
            ComingSoonScreen(
                title = route.featureTitle,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable<Screen.Emulation> { backStackEntry ->
            val route: Screen.Emulation = backStackEntry.toRoute()
            val viewModel: EmulationViewModel = viewModel(
                factory = EmulationViewModel.provideFactory(
                    serverName = route.serverName,
                    host = route.host,
                    port = route.port
                )
            )
            EmulationScreen(
                viewModel = viewModel,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }
    }
}
