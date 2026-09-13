# Firefox AMO review notes

## Purpose and status

DOTLAN ESI Radar is a lightweight Firefox port of the upstream Chrome
extension. It restores DOTLAN radar/location tracking through EVE's ESI API
and can send a selected waypoint to the EVE client. This remains an incomplete
development port, not an AMO-ready submission. No client secret, test-account
credentials, telemetry service, or developer-operated backend is included.

## Permissions and declared data

The existing `storage` permission keeps OAuth credentials local, with refresh
tokens and credential writes owned by the background. `identity` runs the
interactive Firefox OAuth flow. Host permissions cover ESI, EVE SSO, and
DOTLAN map pages. Firefox 140's built-in consent declaration follows
[Mozilla's data-consent taxonomy](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
and the [manifest reference](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings).

The declared categories are:

- `authenticationInfo`: EVE OAuth access and refresh tokens used for the
  account session and sent to the relevant EVE endpoints.
- `personallyIdentifyingInfo`: the EVE character ID and verified name that
  identify the in-game character; the ID is used with ESI and the portrait
  service.
- `websiteActivity`: DOTLAN tracking and waypoint interactions, including the
  waypoint sent to ESI and the resulting DOTLAN map URL. This is not a
  browsing-history collector.

The extension does not use physical device location, GPS, bookmarks, search
terms, communications, health or financial data, or technical/error telemetry.
The in-game EVE location is fictional game-world data, not physical location.
There is no developer-operated server collecting these values; EVE SSO, ESI,
and the portrait service are operated by or for CCP/EVE, while DOTLAN receives
the map requests and URLs. Third-party storage and retention are not
controlled or guaranteed by this extension.

## Authentication and implementation differences

The registered public client uses Firefox Identity Authorization Code with PKCE,
the registered callback, and scopes `esi-location.read_location.v1` and
`esi-ui.write_waypoint.v1`. An EVE account with an eligible character and
those scopes is required for live sign-in. See [README.md](README.md) for
temporary installation and testing, and [PRIVACY_POLICY.md](PRIVACY_POLICY.md)
for detailed data flows.

Compared with the upstream Chrome version, the major divergences are Firefox
background/Identity compatibility, replacement of unsafe upstream OAuth with
the registered public-client PKCE flow, verified background-owned credentials,
coordinated refresh/logout, and protection of authenticated ESI requests.
Remote public-client revocation remains best-effort and unverified against
EVE's confidential-client guidance.

Bundled Vue and Axios provenance, hashes, and complete MIT notices are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). GPL-3.0 licensing, upstream
credit, and Smashicons attribution are preserved in the repository.

## Remaining release work

- Repeat the five Firefox smoke checks after this simplification.
- Inspect console output and test actual background restart/lifecycle behavior.
- Produce runtime-only packaging and test signed installation and consent.
- Supply publication contact information for this fork.
- Complete AMO review and approval.

No publication contact has been invented, and no upstream support address is
presented as this fork's contact.

The target is Firefox desktop 140+; Android is not opted into. `web-ext 10.6.0`
reports two warnings:

- `BACKGROUND_SERVICE_WORKER_IGNORED`: Firefox uses `background.scripts` and
  ignores the retained service-worker entry.
- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`: the validator falls back
  to the desktop minimum of 140 for its Android check, where data consent
  requires 142. Keep the desktop minimum and consent declaration; Android
  metadata remains absent for this desktop-only port.
