# DOTLAN-Radar-Chrome-Extension ![icon](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension/raw/master/images/icon32.png)

This is an extension for Chrome to re-add the old 'radar' (location tracking) feature into DOTLAN using EVE's new ESI API.

[Download it here](https://chrome.google.com/webstore/detail/dotlan-esi-radar/gjdlibhgddgmjfapeiflcbjeobefnjnh)

## Firefox development

This is an incomplete Firefox development port. The manifest now declares the
data sent to EVE/ESI and DOTLAN for the feature, but AMO review and approval
are still pending. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) and
[AMO_REVIEW_NOTES.md](AMO_REVIEW_NOTES.md) for the current scope and data-flow
description.

Authentication uses Firefox Identity Authorization Code with PKCE and the
registered public client; no client secret is bundled. Public-client server
revocation is best-effort and remains unverified against EVE's confidential-
client guidance. JWT validation runs in the background.

The background owns the refresh token, verification, and credential storage. DOTLAN pages receive only a verified, unexpired access-token session for tracking and waypoints; if the background is unavailable, authenticated actions pause and the UI offers **Retry**. Sign-out is reported complete only after local credential clearing succeeds. Older development credentials may require a fresh sign-in.

After sign-out, any remaining highlight is only the map selection; active
tracking has stopped. Adding a waypoint sends it to EVE through ESI. Removing
a waypoint from DOTLAN changes only the DOTLAN map and does not remove it from
the EVE client.

To install it temporarily in Firefox desktop:

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Select this project's `manifest.json`.

After editing the extension, select **Reload** for the temporary add-on so manifest, background, and content-script changes take effect. Temporary installations are for development only: they are removed when Firefox restarts or when you remove them, and they do not fully reproduce the behavior of a signed AMO add-on or its installation-time prompts.

Initial smoke checklist:

- The add-on appears in **This Firefox** without a manifest error and its background listener registers.
- A DOTLAN map shows exactly one radar topbar with its icon.
- An unrelated site shows no radar UI.

### User-reported Firefox smoke passes

The following five checks were reported as passing on 2026-09-13:

- Temporary loading and reloading in Firefox desktop.
- One radar bar on DOTLAN and no radar UI on unrelated sites.
- Live sign-in, the correct character and location, tracking between systems, and pause/resume.
- Adding a waypoint through DOTLAN and seeing it in the same character's in-game route.
- Signing out and reloading the page leaves the user signed out; tracking no longer follows them.

Console inspection, background restart/lifecycle testing, signed installation,
and AMO approval were not covered by those smoke checks and remain pending.

## Upstream project

The original project's issue tracker is available [on GitHub](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension/issues), and its repository accepts pull requests. This Firefox port does not yet publish a separate maintainer or publication contact.

If you love the program enough that you feel compelled to donate, ISK donations are welcome to my eve character: **Demogorgon Asmodeous**

## Attributions

Bundled library provenance and licence texts are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Icon made by [Smashicons](https://www.flaticon.com/authors/smashicons) from [www.flaticon.com](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/ "Creative Commons BY 3.0")
