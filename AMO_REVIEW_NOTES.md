# Firefox AMO review notes

## Status and purpose

DOTLAN ESI Radar is a small Firefox port of the upstream Chrome extension. It
adds the former radar/location-tracking view to DOTLAN using EVE's ESI API and
can send a selected waypoint to the EVE client. This is an incomplete
development port, not an AMO-ready submission. No test-account credentials,
client secret, telemetry service, or developer-operated backend is included.

## Permissions and data declaration

The existing `storage` permission stores the OAuth access/refresh credentials
locally; the background script owns refresh-token use and credential storage.
The existing `identity` permission runs Firefox's interactive OAuth flow. The
existing host permissions cover ESI, EVE SSO, and DOTLAN map pages.

Firefox 140's built-in consent declaration follows [Mozilla's data-consent
taxonomy](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
and [manifest reference](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings).
It requires these categories in `manifest.json`:

- `authenticationInfo`: the EVE OAuth access and refresh tokens used for the
  account session. They are stored locally and sent only to the relevant EVE
  endpoints as required by the flow.
- `personallyIdentifyingInfo`: the EVE character ID and name used with ESI and
  the EVE portrait service. These identify an EVE character, not a real-world
  identity supplied by this extension.
- `websiteActivity`: the user's DOTLAN tracking and waypoint interactions,
  including the selected waypoint posted to ESI and the resulting DOTLAN map
  navigation URL. This is not a browsing-history collector.

The extension does not use physical device location, GPS, bookmarks, search
terms, communications, health or financial data, or technical/error telemetry;
`locationInfo` and those other categories are therefore not declared. The
in-game EVE location is fictional game-world data used in ESI and map requests,
not physical location information. `none` is not appropriate because the
listed data is transmitted outside the add-on to EVE/ESI and DOTLAN.

The desktop minimum remains Firefox 140. Android is constrained to Firefox 142
so the same built-in consent support is available there; Android behavior is
not part of this review.

There is no developer-operated server collecting these values. EVE SSO, ESI,
and the portrait service are operated by or for CCP/EVE, while DOTLAN receives
the map-page requests and URLs. Their storage and retention practices are not
controlled or guaranteed by this extension.

## Authentication and temporary testing

The registered public client uses Firefox Identity Authorization Code with
PKCE, the registered callback, and the two EVE scopes
`esi-location.read_location.v1` and `esi-ui.write_waypoint.v1`. No client
secret is requested or retained. The background validates tokens and manages
refresh and logout; the DOTLAN page receives only a verified, unexpired access
token session. Local sign-out clears local credentials and attempts remote
revocation on a best-effort basis.

For development, follow [Mozilla's temporary-installation
guidance](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/): load `manifest.json` from
`about:debugging#/runtime/this-firefox` with **Load Temporary Add-on** and
reload the temporary add-on after edits. Temporary installation is not signed
distribution and is removed by Firefox when the browser restarts or the
temporary add-on is removed. An EVE account with an eligible character and the
registered scopes is required for live sign-in.

## Third-party and release notes

Bundled Vue and Axios provenance, version-specific links, hashes, and complete
MIT notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Existing
upstream credit, GPL-3.0 licensing, and Smashicons attribution are preserved
in the repository.

Remaining release checks include console inspection, background
restart/lifecycle behavior, signed-install behavior, complete privacy and
OAuth review, and AMO approval. Publication contact information for this fork
has not yet been supplied; no upstream support address is presented as this
fork's contact. Current `web-ext lint` reports one expected warning:
Firefox ignores the retained `background.service_worker` entry and uses
`background.scripts` for compatibility.
