import type { CapacitorConfig } from '@capacitor/cli';

/** The iPhone app: Divina's browser edition in a native shell (scripts/build-ios.mjs, docs/APP-STORE.md). */
const config: CapacitorConfig = {
  appId: 'co.sweeneycreative.divina',
  appName: 'Divina',
  webDir: 'build/ios-web',
  backgroundColor: '#05070d',
  ios: {
    // the room fills the screen; the page keeps clear of the notch itself
    contentInset: 'never',
    backgroundColor: '#05070d',
    // no web inspector in App Store builds
    webContentsDebuggingEnabled: false,
  },
};

export default config;
