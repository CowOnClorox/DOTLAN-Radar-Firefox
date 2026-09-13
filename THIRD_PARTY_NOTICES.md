# Third-Party Notices

This extension bundles the libraries listed below. These notices record
version-specific provenance and licensing for the bundled files, following
[Mozilla's third-party library guidance](https://extensionworkshop.com/documentation/publish/third-party-library-usage/).

Official tagged release artifacts were compared and hashed; no downloaded code
was executed.

## Vue.js runtime 2.5.13

- Local path: `app/scripts/libraries/vue.runtime.min.js`
- Version-specific release: [Vue v2.5.13 tag](https://github.com/vuejs/vue/releases/tag/v2.5.13)
- Version-specific distribution artifact: [`dist/vue.runtime.min.js`](https://github.com/vuejs/vue/blob/v2.5.13/dist/vue.runtime.min.js)
- Version-specific source tree: [Vue v2.5.13](https://github.com/vuejs/vue/tree/v2.5.13)
- Version-specific licence: [`LICENSE`](https://github.com/vuejs/vue/blob/v2.5.13/LICENSE)
- Copyright: the bundled artifact identifies `2014-2017 Evan You`; the release licence identifies `2013-present, Yuxi (Evan) You`.
- Licence: MIT. Complete text copied from the tagged release is in [`licenses/vue-2.5.13-MIT.txt`](licenses/vue-2.5.13-MIT.txt).
- SHA-256 of the CRLF checkout variant (not the release-archive bytes): `7ed51bb2054f2cfd8fb2b0d9abd4bc4cd37c657a77d0e287206e25bfc0b053bf`
- SHA-256 of the committed/package LF bytes, identical to official `v2.5.13/dist/vue.runtime.min.js`: `028919b1be382068779c7e24e914580e7a42058cacb6708ad0590ddc8dc43652`
- Verification: the committed/package LF bytes and official artifact are byte-for-byte identical. The Windows checkout variant differs only in line endings, with 5 CRLF line endings versus 5 LF line endings in the committed/package and official bytes; this accounts for the 5-byte file-size difference.

## Axios 0.17.1

- Local path: `app/scripts/libraries/axios.min.js`
- Version-specific release: [Axios v0.17.1 tag](https://github.com/axios/axios/releases/tag/v0.17.1)
- Version-specific distribution artifact: [`dist/axios.min.js`](https://github.com/axios/axios/blob/v0.17.1/dist/axios.min.js)
- Version-specific source tree: [Axios v0.17.1](https://github.com/axios/axios/tree/v0.17.1)
- Version-specific licence: [`LICENSE`](https://github.com/axios/axios/blob/v0.17.1/LICENSE)
- Copyright: the bundled artifact identifies `2017 by Matt Zabriskie`; the release licence identifies `2014 Matt Zabriskie`.
- Licence: MIT. Complete text copied from the tagged release is in [`licenses/axios-0.17.1-MIT.txt`](licenses/axios-0.17.1-MIT.txt).
- SHA-256 of the CRLF checkout variant (not the release-archive bytes): `d9ca2f407cd7a61c3a4b75d17d544bbc38cdb2fed490d0c6351f45cfe6db4017`
- SHA-256 of the committed/package LF bytes, identical to official `v0.17.1/dist/axios.min.js`: `03cdc51eddb62db48e3d837d746b3be21fc9d23a9cdd365aa4752995fdaeba92`
- Verification: the committed/package LF bytes and official artifact are byte-for-byte identical. The Windows checkout variant differs only in line endings, with 8 CRLF line endings versus 8 LF line endings in the committed/package and official bytes; this accounts for the 8-byte file-size difference.

## Icon attribution

The following attribution is inherited from the existing README. Icon
provenance was not independently verified here:

> Icon made by [Smashicons](https://www.flaticon.com/authors/smashicons) from [www.flaticon.com](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/ "Creative Commons BY 3.0")

The linked source is [Smashicons on Flaticon](https://www.flaticon.com/authors/smashicons); the linked licence is [Creative Commons Attribution 3.0](http://creativecommons.org/licenses/by/3.0/). The README retains this attribution.

## Scope and verification notes

- `app/scripts/libraries` contains the Vue runtime and Axios files listed above; no other bundled library files were identified.
- The licence files in `licenses/` are complete copies of the corresponding official release `LICENSE` files.
- The comparisons above disclose the line-ending-only hash differences; neither bundled library was replaced.
- Broader extension data, privacy, and authentication documentation is maintained separately from these library notices.
