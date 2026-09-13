# DOTLAN ESI Radar — Firefox port ![icon](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension/raw/master/images/icon32.png)

This repository is a lightweight Firefox port of the upstream Chrome
extension. It restores the old radar (location tracking) feature in DOTLAN
using EVE's ESI API. [Download the upstream Chrome version](https://chrome.google.com/webstore/detail/dotlan-esi-radar/gjdlibhgddgmjfapeiflcbjeobefnjnh).

## Firefox port

This Firefox fork's data declaration and release status are documented in
[PRIVACY_POLICY.md](PRIVACY_POLICY.md) and [AMO_REVIEW_NOTES.md](AMO_REVIEW_NOTES.md).

Firefox Add-ons is the intended primary installation and update channel for
this port. The public listing remains pending; GitHub provides source code and
support issues. Version 1.3.1 is the candidate for the first public listing,
not a published release.

Authentication uses Firefox Identity Authorization Code with PKCE and the
registered public client. No client secret is bundled. The background owns
refresh tokens, verification, and credential storage; pages receive only a
verified, unexpired session for tracking and waypoints.

If the background is unavailable, authenticated actions pause and the UI offers
**Retry**. Sign-out is reported complete only after local credential clearing
succeeds. Public-client server revocation is best-effort and remains
unverified against EVE's confidential-client guidance. Older development
credentials may require a fresh sign-in.

After sign-out, any remaining highlight is only the map selection, not active
tracking. Adding a waypoint sends it to EVE through ESI. Removing a waypoint
from DOTLAN changes only the DOTLAN map; it does not remove it from the EVE
client.

To install it temporarily in Firefox desktop, open
`about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and
select this project's `manifest.json`. After edits, select **Reload** for the
temporary add-on. Temporary installations are for development only: Firefox
removes them on restart or when they are removed, and they do not fully
reproduce signed AMO distribution or its installation-time prompts.

### Smoke checklist

The following five Firefox smoke checks passed:

- Temporary loading and reloading in Firefox desktop.
- One radar bar on DOTLAN and no radar UI on unrelated sites.
- Live sign-in, the correct character and location, tracking between systems,
  and pause/resume.
- Adding a waypoint through DOTLAN and seeing it in the same character's
  in-game route.
- Signing out and reloading the page leaves the user signed out; tracking no
  longer follows them.

### Version 1.3.0 release record

Version 1.3.0 was approved and signed by AMO for unlisted distribution. Signed
installation in a fresh Firefox profile passed, including the required
installation-time data-consent display, cancellation, and accepted
installation. Sign-in, location tracking, pause/resume, waypoint delivery,
signed-in recovery after background termination, persistent sign-out after
termination and reload, and the earlier console and background-lifecycle
checks passed for 1.3.0. These results apply to 1.3.0 only; they do not claim
that a signed 1.3.1 has been tested.

## Reproducible packaging

From a clean, committed checkout, run this PowerShell command. It reads the
version and commit timestamp from the selected commit, archives the Git tree
instead of the Windows checkout, and writes an unsigned candidate under the
ignored `build` directory.

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

The explicit tree ID avoids Git's automatic commit-ID ZIP comment, and the
direct archive output avoids passing binary data through PowerShell text
processing. The archive contains only the allowlist above; README, privacy and
review notes remain repository documentation outside the installable archive.

## Support

For questions and issues with this Firefox port, use the
[GitHub Issues page](https://github.com/CowOnClorox/DOTLAN-Radar-Firefox/issues).
For the Chrome extension, use the
[upstream issue tracker](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension/issues).

## Upstream project

This fork is based on the [upstream Chrome project](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension). Its issue tracker and pull-request process remain upstream resources.

The `upstream` Git remote points to the original project; `origin` points to
this Firefox fork. Review upstream changes before merging them into the port.

Upstream donation attribution: ISK donations are welcome to the upstream
author's EVE character **Demogorgon Asmodeous**.

## Attributions

This project is GPL-3.0; see [LICENSE](LICENSE). Bundled library provenance
and licence texts are documented in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Icon made by [Smashicons](https://www.flaticon.com/authors/smashicons) from [www.flaticon.com](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/ "Creative Commons BY 3.0")
