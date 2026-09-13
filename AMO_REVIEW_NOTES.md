# Firefox AMO review notes

## Purpose and status

DOTLAN ESI Radar is a lightweight Firefox port of the upstream Chrome
extension. It restores DOTLAN radar/location tracking through EVE's ESI API
and can send a selected waypoint to the EVE client. No client secret,
test-account credentials, telemetry service, or developer-operated backend is
included. AMO validation remains pending.

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

1. **Public repository:** the committed Git contents, including readable
   first-party JavaScript/CSS, the manifest, documentation, images, bundled
   library artifacts, `LICENSE`, and `licenses/`.
2. **Installable archive:** exactly the 16 entries in the closed `$archivePaths`
   allowlist in [README.md](README.md): the manifest, six `app/scripts` files,
   CSS, four icons, `LICENSE`, `THIRD_PARTY_NOTICES.md`, and two MIT notices.
   README, privacy policy, these notes, Git metadata, logs, and local build
   files are outside the archive.
3. **Source submission:** first-party code is readable and is not compiled,
   bundled, or minified; Git archive creation does not transform it. If
   Mozilla requires source material, submit the corresponding committed source
   and reproducible instructions under its [source-code submission guidance](https://extensionworkshop.com/documentation/publish/source-code-submission/).
   No speculative source archive is created here, and including minified
   third-party files alone is not treated as satisfying such a requirement.
4. **Reviewer/listing inputs:** the manifest, README, privacy policy, these
   notes, third-party notices, GPL licence, and MIT licence texts, together
   with listing metadata, support identity, and signing/consent material when
   a submission is prepared.

The packaging approach follows Mozilla's [extension packaging guidance](https://extensionworkshop.com/documentation/publish/package-your-extension/),
the [third-party library guidance](https://extensionworkshop.com/documentation/publish/third-party-library-usage/),
and [`git archive` documentation](https://git-scm.com/docs/git-archive).

## Remaining release work

- Inspect console output and test actual background restart/lifecycle behavior.
- Produce runtime-only packaging and test signed installation and consent.
- Establish listing metadata and support identity, if a submission is prepared.
- Complete AMO submission and approval.

The target is Firefox desktop 140+; Android is not opted into. `web-ext 10.6.0`
reports two warnings:

- `BACKGROUND_SERVICE_WORKER_IGNORED`: Firefox uses `background.scripts` and
  ignores the retained service-worker entry.
- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`: the validator falls back
  to the desktop minimum of 140 for its Android check, where data consent
  requires 142. Keep the desktop minimum and consent declaration; Android
  metadata remains absent for this desktop-only port.

No signing, submission, approval, or publication has occurred.
