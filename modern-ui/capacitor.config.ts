import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.edge.rfidemulator',
  appName: 'Zeus',
  webDir: 'dist',
  /** Pinch/double-tap zoom off (viewport meta + native WKWebView; requires cap sync). */
  zoomEnabled: false,
  ios: {
    zoomEnabled: false,
  },
  android: {
    zoomEnabled: false,
  },
  /** Local plugins: registered in iOS `AppBridgeViewController.capacitorDidLoad` (Capacitor 8). */
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
