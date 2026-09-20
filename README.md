# DOTLAN ESI Radar — Firefox port ![icon](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension/raw/master/images/icon32.png)

DOTLAN ESI Radar is a small Firefox port of the original [DOTLAN Radar Chrome extension](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension). It puts the radar/location view back on DOTLAN using EVE's ESI API.

It lets you:

- track your signed-in EVE character's location on DOTLAN, continuously or with Locate Once;
- start or stop tracking; and
- send waypoints to the EVE client.

[Install DOTLAN ESI Radar from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/dotlan-esi-radar/)

**Privacy:** Your EVE data is not sent to me, and I have no way to view your character, location, tokens, or waypoints through the extension. It connects directly to EVE's services and DOTLAN, with no developer-operated server or analytics. See the [privacy policy](PRIVACY_POLICY.md) for details.

## Problems or feedback?

Please use the [GitHub Issues page](https://github.com/CowOnClorox/DOTLAN-Radar-Firefox/issues). GitHub is also where the source code for this Firefox port is maintained.

## Development

For a temporary development install, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `manifest.json`.

## Upstream and licences

This is a community Firefox port of the [upstream Chrome project](https://github.com/ArtificialQualia/DOTLAN-Radar-Chrome-Extension). Upstream donation attribution: ISK donations are welcome to the author's EVE character **Demogorgon Asmodeous**.

This project is GPL-3.0; see [LICENSE](LICENSE). Bundled Vue and Axios provenance and licence texts are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Icon made by [Smashicons](https://www.flaticon.com/authors/smashicons) from [www.flaticon.com](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/ "Creative Commons BY 3.0")
