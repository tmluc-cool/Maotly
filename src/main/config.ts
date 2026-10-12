/**
 * App configuration. No secrets here – everything in this file ships with the app.
 */
export const config = {
  /** GitHub repo of this project (for "Alternative vorschlagen"). */
  projectRepo: 'tmluc-cool/githuub-appstore',
  /** GitHub account with GitHub Sponsors (button "Sponsor" in the app). */
  sponsorUser: 'tmluc-cool',
  /** Public repo whose releases carry the weekly update packages. */
  dataRepo: 'tmluc-cool/gratisstatt-data',
  /** GratisStatt network server (Cloudflare Worker). */
  serverUrl: 'https://gratisstatt.example.workers.dev',
  /** GitHub OAuth App (device flow enabled, no scopes). Client IDs are public. */
  oauthClientId: 'REPLACE_WITH_OAUTH_CLIENT_ID',
  /** Increase when the consent text changes substantially; members are asked again. */
  consentVersion: 2, // 2: reviews and upvotes
  /** Days between automatic update checks. */
  updateIntervalDays: 7,
  /** If more packages than this are missing, the newest base is loaded instead. */
  maxMissingDeltas: 12,
};

export const manifestUrl = () => `https://github.com/${config.dataRepo}/releases/latest/download/manifest.json`;

/** The network only works once server and OAuth App are set up (see docs/EINRICHTUNG.md). */
export function networkConfigured(): boolean {
  return !config.oauthClientId.startsWith('REPLACE') && !config.serverUrl.includes('.example.');
}

export const sponsorUrl = () => `https://github.com/sponsors/${config.sponsorUser}`;

export const releasesApiUrl = () => `https://api.github.com/repos/${config.projectRepo}/releases/latest`;
