# Privacy Policy

DOTLAN ESI Radar is a Firefox fork of the upstream DOTLAN radar
extension. It has no developer-operated telemetry, analytics, cloud storage,
or backend service. Data still leaves the browser directly to the external
services below; their own policies govern handling and retention.

## Data flows

- Sign-in exchanges an OAuth authorization code with EVE Online SSO using
  Firefox's registered public client and Authorization Code with PKCE. No
  client secret is bundled. Access and refresh tokens are stored locally in
  extension storage; the refresh token is managed only by the background.
- The verified character ID is sent to ESI and is used as the ID in the
  character portrait URL. The verified character name is displayed in the
  extension. Access tokens contain identity claims, so this policy does not
  promise that names never leave the browser.
- The character's in-game location and selected in-game waypoint are used in
  ESI requests and DOTLAN map URLs. This is fictional EVE game-world data, not
  physical device location or GPS data.
- Local sign-out clears the extension's credentials. Remote token revocation is
  attempted on a best-effort basis and is not guaranteed. Visited map URLs may
  remain in browser history.

The extension has no developer-operated server receiving this information.
EVE SSO, ESI, and the portrait service are operated by or for CCP/EVE, while
DOTLAN receives the map-page requests and URLs needed by the feature. This
policy does not promise that those third parties store nothing; their own
privacy and retention terms apply.
