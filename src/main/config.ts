/**
 * App configuration. No secrets here – everything in this file ships with the app.
 */
export const config = {
  /** GitHub repo of this project (for "Alternative vorschlagen"). */
  projectRepo: 'tmluc-cool/githuub-appstore',
  /** Public repo whose releases carry the weekly update packages. */
  dataRepo: 'tmluc-cool/gratisstatt-data',
  /** GratisStatt network server (Cloudflare Worker). */
  serverUrl: 'https://gratisstatt.example.workers.dev',
  /** GitHub OAuth App (device flow enabled, no scopes). Client IDs are public. */
  oauthClientId: 'REPLACE_WITH_OAUTH_CLIENT_ID',
  /** Increase when the consent text changes substantially; members are asked again. */
  consentVersion: 1,
  /** Days between automatic update checks. */
  updateIntervalDays: 7,
  /** If more packages than this are missing, the newest base is loaded instead. */
  maxMissingDeltas: 12,
};

export const manifestUrl = () => `https://github.com/${config.dataRepo}/releases/latest/download/manifest.json`;
