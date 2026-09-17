# Firefox AMO review notes

## Current release

DOTLAN ESI Radar 1.3.1 passed AMO review and is publicly listed as the
current public Firefox release. Firefox Add-ons is the primary installation and
update channel:

- Store: [DOTLAN ESI Radar](https://addons.mozilla.org/en-US/firefox/addon/dotlan-esi-radar/)
- Publisher: `CowOnClorox`
- AMO version: `6483480`; AMO file: `5027644`
- Support and source: [GitHub Issues](https://github.com/CowOnClorox/DOTLAN-Radar-Firefox/issues)

Store installation, update, and version confirmation passed, as did sign-in,
tracking, waypoint delivery, restart recovery, and persistent sign-out after
restart. Fresh-profile consent display, cancellation, and accepted-installation
checks were performed for signed unlisted 1.3.0; those results are not 1.3.1
results.

## Accepted release artifacts

The recorded package source commit is
`92c11479889448cf37a70b1c73f5404683e55bfd`.

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `build/dotlan-esi-radar-firefox-1.3.1-unsigned.zip` | 67,532 bytes | `1ce763f4287e4639a4324cd1c21311777b1288bb5c71ed914866b1316610196a` |
| `build/dotlan-esi-radar-firefox-1.3.1-listed.xpi` | 76,515 bytes | `6638c7aefd9031e9baf142ab655b535efbf5fb4863aec9f96d0a3ba3e4e90a09` |

The official signed download was compared with the accepted unsigned package:
all 15 non-manifest payload files are byte-identical, the manifest content is
semantically identical, and the remaining differences are manifest formatting
and five added Mozilla `META-INF` signature files.

## Closed release file sets

1. **Public repository snapshot:** the 16 archive files in the closed
   `$archivePaths` allowlist below, plus `.gitignore`, `README.md`,
   `PRIVACY_POLICY.md`, and `AMO_REVIEW_NOTES.md`.
2. **Installable archive:** exactly the existing 16-file allowlist below;
   it is unchanged. Repository documentation, Git metadata, logs, and local
   build files are outside the archive. The signed XPI adds five Mozilla
   `META-INF/` signature files.
3. **Available source/reproduction material:** the 16 archive files plus
   `README.md`, `PRIVACY_POLICY.md`, and `AMO_REVIEW_NOTES.md`. No separate
   source archive is currently built. Readable first-party code and tagged
   third-party source links remain available, but minified third-party files
   alone do not satisfy a source requirement. Reproduction commands that use
   Git require the repository and selected commit; a source-only extraction
   does not support those Git commands. If Mozilla requests additional source
   material, provide the source package it requests under its
   [source-code submission guidance](https://extensionworkshop.com/documentation/publish/source-code-submission/).
4. **Existing reviewer/listing inputs:** `manifest.json`, `README.md`,
   `PRIVACY_POLICY.md`, `AMO_REVIEW_NOTES.md`, `THIRD_PARTY_NOTICES.md`,
   `LICENSE`, `licenses/vue-2.5.13-MIT.txt`,
   `licenses/axios-0.17.1-MIT.txt`, and `images/icon128.png`.

## Reproducible unsigned packaging

The following command packages a selected clean HEAD from committed files and
its commit timestamp. The accepted 1.3.1 package was built from
`92c11479889448cf37a70b1c73f5404683e55bfd`; a later documentation commit does
not reproduce the recorded archive hash.

```powershell
$commit = (git rev-parse HEAD).Trim()
if (git status --porcelain=v1) { throw 'Build from a clean, committed state.' }
$version = (git show "${commit}:manifest.json" | ConvertFrom-Json).version
$tree = (git rev-parse "${commit}^{tree}").Trim()
$mtime = (git show -s --format=%cI $commit).Trim()
$archivePaths = @(
  'manifest.json',
  'app/scripts/background_api.js', 'app/scripts/topbar.js',
  'app/scripts/tracker.js', 'app/scripts/waypoints.js',
  'app/scripts/libraries/vue.runtime.min.js',
  'app/scripts/libraries/axios.min.js',
  'app/views/topbar.css',
  'images/icon16.png', 'images/icon24.png', 'images/icon32.png', 'images/icon128.png',
  'LICENSE', 'THIRD_PARTY_NOTICES.md',
  'licenses/vue-2.5.13-MIT.txt', 'licenses/axios-0.17.1-MIT.txt'
)
$archive = Join-Path (Join-Path (Get-Location) 'build') "dotlan-esi-radar-firefox-$version-unsigned.zip"
New-Item -ItemType Directory -Force (Split-Path $archive) | Out-Null
git -c core.autocrlf=false archive --format=zip --mtime="$mtime" --output="$archive" "$tree" -- $archivePaths
```

This follows Mozilla's [extension packaging guidance](https://extensionworkshop.com/documentation/publish/package-your-extension/), [third-party library guidance](https://extensionworkshop.com/documentation/publish/third-party-library-usage/), and [`git archive` documentation](https://git-scm.com/docs/git-archive).

## Permissions, data, and authentication

The existing permissions are `storage` and `identity`. Host permissions cover
EVE ESI, EVE SSO, and DOTLAN map pages. Firefox desktop support starts at
140.0; Android is not opted into.

The manifest declares these Firefox data categories under Mozilla's
[data-consent taxonomy](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
and [manifest reference](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings):

- `authenticationInfo`: OAuth access and refresh tokens used for the EVE
  account session.
- `personallyIdentifyingInfo`: verified EVE character ID and name; the ID is
  used with ESI and the EVE portrait service.
- `websiteActivity`: tracking and waypoint interactions, including ESI
  requests and resulting DOTLAN map URLs. This is not browsing-history
  collection, and the in-game location is fictional EVE data rather than
  physical device location.

The Firefox Identity Authorization Code + PKCE flow uses the registered public
client, callback, and scopes `esi-location.read_location.v1` and
`esi-ui.write_waypoint.v1`; no client secret is bundled. Credentials are stored
locally in Firefox extension storage, and refresh tokens are background-only.
EVE SSO, ESI, the EVE portrait service, and DOTLAN receive the relevant direct
requests. There is no developer-operated server, database, analytics service,
or dashboard receiving these values. Local sign-out clears local credentials;
remote public-client revocation is attempted on a best-effort basis and is
unverified against EVE's confidential-client guidance.

## Licensing and provenance

This project is GPL-3.0; see [LICENSE](LICENSE). It is a Firefox port of the
[upstream Chrome project](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension),
with its donation attribution to the author's EVE character Demogorgon
Asmodeous preserved. Vue 2.5.13 and Axios 0.17.1 provenance, hashes, source
links, and complete MIT notices are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The icon is made by
[Smashicons](https://www.flaticon.com/authors/smashicons) from
[www.flaticon.com](https://www.flaticon.com/) and is licensed by
[CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/).

## Lint findings

`web-ext 10.6.0` reports zero errors and the following existing warnings:

- `BACKGROUND_SERVICE_WORKER_IGNORED`: Firefox uses `background.scripts` and
  ignores the retained `service_worker` entry.
- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`: the validator applies the
  desktop minimum of 140 to its Android data-consent check, which requires 142.
  This port targets desktop and does not opt into Android.
