# DOTLAN ESI Radar — Firefox port ![icon](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension/raw/master/images/icon32.png)

This repository is a lightweight Firefox port of the upstream Chrome
extension. It restores the old radar (location tracking) feature in DOTLAN
using EVE's ESI API. [Download the upstream Chrome version](https://chrome.google.com/webstore/detail/dotlan-esi-radar/gjdlibhgddgmjfapeiflcbjeobefnjnh).

## Firefox development

This is an incomplete Firefox development port. Its data declaration and
release status are documented in [PRIVACY_POLICY.md](PRIVACY_POLICY.md) and
[AMO_REVIEW_NOTES.md](AMO_REVIEW_NOTES.md); AMO review and approval are
pending.

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

These five checks were reported as passing by the user on 2026-09-13:

- Temporary loading and reloading in Firefox desktop.
- One radar bar on DOTLAN and no radar UI on unrelated sites.
- Live sign-in, the correct character and location, tracking between systems,
  and pause/resume.
- Adding a waypoint through DOTLAN and seeing it in the same character's
  in-game route.
- Signing out and reloading the page leaves the user signed out; tracking no
  longer follows them.

The post-simplification rerun of this checklist remains pending; these earlier
passes are not a result for this change.

## Upstream project

This fork is based on the [upstream Chrome project](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension). Its issue tracker and pull-request process remain upstream resources; this Firefox port does not yet publish a separate maintainer or publication contact.

Upstream donation attribution, retained here and not a contact or donation
request from this Firefox fork: ISK donations are welcome to the upstream
author's EVE character **Demogorgon Asmodeous**.

## Attributions

This project is GPL-3.0; see [LICENSE](LICENSE). Bundled library provenance
and licence texts are documented in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Icon made by [Smashicons](https://www.flaticon.com/authors/smashicons) from [www.flaticon.com](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/ "Creative Commons BY 3.0")
