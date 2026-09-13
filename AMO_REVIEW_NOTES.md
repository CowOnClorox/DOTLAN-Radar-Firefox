# Firefox AMO review notes

## Purpose and status

DOTLAN ESI Radar is a lightweight Firefox port of the upstream Chrome
extension. It restores DOTLAN radar/location tracking through EVE's ESI API
and can send a selected waypoint to the EVE client. No client secret,
test-account credentials, telemetry service, or developer-operated backend is
included. Version 1.3.0 is approved and signed by AMO for unlisted
distribution. Public Firefox Add-ons listing remains pending; version 1.3.1
is the candidate for that listing.

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

## Release file sets

1. **Public repository snapshot:** the 16 archive files named by the closed
   `$archivePaths` allowlist in [README.md](README.md), plus `.gitignore`,
   `README.md`, `PRIVACY_POLICY.md`, and `AMO_REVIEW_NOTES.md`. This is the
   documented public snapshot for the candidate; other Git metadata is not
   part of this file set.
2. **Unsigned archive:** exactly the existing 16-file `$archivePaths`
   allowlist in [README.md](README.md), unchanged. README, the privacy policy,
   these notes, Git metadata, logs, and local build files are outside the
   archive. The signed XPI adds five Mozilla `META-INF/` signature files.
3. **Available source/reproduction material:** the 16 archive files plus
   `README.md`, `PRIVACY_POLICY.md`, and `AMO_REVIEW_NOTES.md`. No separate
   source archive is currently built. Readable first-party code and tagged
   third-party source links remain available, but the minified third-party
   files alone do not satisfy any source requirement. Reproduction commands
   that use Git require the repository and its selected commit; a source-only
   extraction does not support those Git commands. If Mozilla requests
   additional source material, provide the corresponding source package under
   its [source-code submission guidance](https://extensionworkshop.com/documentation/publish/source-code-submission/).
4. **Existing reviewer/listing inputs:** `manifest.json`, `README.md`,
   `PRIVACY_POLICY.md`, `AMO_REVIEW_NOTES.md`, `THIRD_PARTY_NOTICES.md`,
   `LICENSE`, `licenses/vue-2.5.13-MIT.txt`,
   `licenses/axios-0.17.1-MIT.txt`, and `images/icon128.png`. Listing drafts
   are prepared; signed-install/consent checks passed for unlisted 1.3.0.

The packaging approach follows Mozilla's [extension packaging guidance](https://extensionworkshop.com/documentation/publish/package-your-extension/),
the [third-party library guidance](https://extensionworkshop.com/documentation/publish/third-party-library-usage/),
and [`git archive` documentation](https://git-scm.com/docs/git-archive).

## Release status and remaining work

- Completed: reproducible unsigned packaging from a clean committed tree, with
  the fixed 16-file archive allowlist and committed-byte verification.
- Completed on Firefox 155.0.1: temporary installation of the unsigned 1.3.0
  candidate, console checks, signed-in tracking recovery after background
  termination, and persistent sign-out after termination and page reload.
  The open DOTLAN page's session checks can restart the background while signed
  out; tracking remains stopped.
- Completed: signed 1.3.0 installation in a fresh Firefox profile, required
  data-consent display, cancellation and accepted installation, live tracking,
  pause/resume, waypoints, signed-in restart recovery, and sign-out persistence
  after restart. Public Firefox Add-ons distribution is the primary release
  channel; GitHub provides source code and support issues.
- Prepared: listing drafts and GitHub Issues support under CowOnClorox.
- Completed: AMO approved and signed version 1.3.0 for unlisted distribution.
- Candidate: version 1.3.1 is prepared for the first public Firefox Add-ons
  listing; it has not been uploaded, signed, or tested as a signed artifact.
- Pending: public AMO listing submission and approval.

The target is Firefox desktop 140+; Android is not opted into. `web-ext 10.6.0`
reports two warnings:

- `BACKGROUND_SERVICE_WORKER_IGNORED`: Firefox uses `background.scripts` and
  ignores the retained service-worker entry.
- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`: the validator falls back
  to the desktop minimum of 140 for its Android check, where data consent
  requires 142. Keep the desktop minimum and consent declaration; Android
  metadata remains absent for this desktop-only port.

Signed 1.3.0: 76,517 bytes; SHA-256:
`dbc6864749da9654345cb7b8e913104c9796d0d2ec960a38050741a8601cd36c`.
