# DOTLAN-Radar-Chrome-Extension ![icon](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension/raw/master/images/icon32.png)

This is an extension for Chrome to re-add the old 'radar' (location tracking) feature into DOTLAN using EVE's new ESI API.

[Download it here](https://chrome.google.com/webstore/detail/dotlan-esi-radar/gjdlibhgddgmjfapeiflcbjeobefnjnh)

## Firefox development

This is an incomplete Firefox development port. AMO data declarations, privacy corrections, and OAuth review are pending. `data_collection_permissions` is intentionally absent from `manifest.json` until those declarations are reviewed; this port is not ready for AMO submission.

Authentication uses Firefox Identity Authorization Code with PKCE and the registered public client; no client secret is bundled. Public-client server revocation is best-effort and remains unverified against EVE's confidential-client guidance. JWT validation runs in the background; live authentication and Firefox smoke checks remain pending.

The background owns the refresh token, verification, and credential storage. DOTLAN pages receive only a verified, unexpired access-token session for tracking and waypoints; if the background is unavailable, authenticated actions pause and the UI offers **Retry**. Sign-out is reported complete only after local credential clearing succeeds. Older development credentials may require a fresh sign-in.

To install it temporarily in Firefox desktop:

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Select this project's `manifest.json`.

After editing the extension, select **Reload** for the temporary add-on so manifest, background, and content-script changes take effect. Temporary installations are for development only: they are removed when Firefox restarts or when you remove them, and they do not fully reproduce the behavior of a signed AMO add-on or its installation-time prompts.

Initial smoke checklist:

- The add-on appears in **This Firefox** without a manifest error and its background listener registers.
- A DOTLAN map shows exactly one radar topbar with its icon.
- An unrelated site shows no radar UI.
- The relevant extension, background, and page consoles have no new errors.
- Do not authenticate while performing this initial check.

## Problems?  Feedback?

If you encounter any bugs or you think there are missing features please let me know [on the issues page](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension/issues).

If you wish to contribute to the project codebase, I will be accepting pull requests.

If you love the program enough that you feel compelled to donate, ISK donations are welcome to my eve character: **Demogorgon Asmodeous**

## Attributions

Bundled library provenance and licence texts are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Icon made by [Smashicons](https://www.flaticon.com/authors/smashicons) from [www.flaticon.com](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/ "Creative Commons BY 3.0")
