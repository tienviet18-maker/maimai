/**
 * AdMob configuration for MaiMai Android wrapper.
 * PRODUCTION IDs — provided by owner 2026-08-29.
 *
 * Android App ID:    ca-app-pub-6588196119148846~8757683722
 * Banner Ad Unit ID: ca-app-pub-6588196119148846/3181038938
 *
 * NOTE: Production requests currently return AdMob error 3
 * "Account not approved yet" until the AdMob account is approved.
 * Bridge retries + resume reload are in place; layout spacer stays 0 until load.
 */
window.MAIMAI_ADMOB_CONFIG = {
  enabled: true,
  initializeForTesting: false,
  isTesting: false,
  appId: "ca-app-pub-6588196119148846~8757683722",
  bannerAdUnitId: "ca-app-pub-6588196119148846/3181038938",
  adSize: "ADAPTIVE_BANNER",
  maxRetries: 8,
  testingDevices: []
};
