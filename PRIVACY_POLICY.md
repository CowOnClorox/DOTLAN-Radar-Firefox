# Privacy Policy

DOTLAN ESI Radar is a Firefox development port of the upstream DOTLAN radar
extension. It has no developer-operated telemetry, analytics, cloud storage,
or backend service. That does not mean that no data leaves the browser: the
extension communicates directly with the external services described below,
whose handling and retention are governed by their own policies.

## Data flows

- Sign-in exchanges an OAuth authorization code with EVE Online SSO. Firefox's
  registered public client uses Authorization Code with PKCE; no client secret
  is bundled. Access and refresh tokens are stored in the browser's local
  extension storage. The refresh token is managed only by the extension's
  background script.
- Verified EVE character identifiers and names are used in requests to ESI and
  in requests for the character portrait service. The access token is sent to
  ESI in an Authorization header, not in a URL.
- The character's in-game location and a selected in-game waypoint are used in
  ESI requests and in DOTLAN map URLs. This is fictional EVE game-world data,
  not physical device location or GPS data.
- Local sign-out clears the extension's stored credentials. Remote token
  revocation is attempted on a best-effort basis and is not guaranteed. Map
  URLs already visited may remain in the browser's history.

The extension does not sell or operate a separate service that receives this
information. EVE SSO, ESI, and the EVE portrait service are operated by or for
CCP/EVE, and DOTLAN receives the requests and map URLs needed for the feature.
This policy does not promise that those third parties store nothing; their own
privacy and retention terms apply.

This is an incomplete development port. Firefox's built-in data-collection
consent declaration is in `manifest.json`; AMO review, console/lifecycle
review, signed-install review, and publication contact details remain pending.
No separate maintainer contact is provided for this port yet.
