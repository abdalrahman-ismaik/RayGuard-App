# Console typography assets

Upright fonts from the [author’s Barlow repository](https://github.com/jpt/barlow), inspected on **26 September 2026**.
Pinned revision: `dc2940e2e04ef4ec96c07e23e0f02aefbddd343b`.
These are unchanged upstream WOFF2 files, distributed under the included [SIL Open Font License 1.1](OFL.txt).
They load from the local app, with no font CDN or runtime download.

| File | Weight | Verified full name | Bytes | SHA-256 |
|---|---|---|---|---|
| `Barlow-Regular.woff2` | 400 | Barlow Regular | 58,964 | `2904d763039d78176366e8e32c2c8cebecf2da19e249a7c077cd8c8a736c5cd4` |
| `Barlow-Medium.woff2` | 500 | Barlow Medium | 59,180 | `026d66f2f95c28f8da01f432139c3d68c2f0b96961a3e3a7ccb884e7f640aaba` |
| `Barlow-SemiBold.woff2` | 600 | Barlow SemiBold | 59,936 | `444b951177325b7a2f1ee61412a0d66c04d0e1ee438ef14430025f1b128d557f` |
| `BarlowSemiCondensed-SemiBold.woff2` | 600 | Barlow Semi Condensed SemiBold | 64,440 | `bae9a20f1461da5276b405097cfd4ad72a888632b65780ca3a0b996cb4aab3ad` |

Total: **242520 bytes**. No variable, italic or unused weights are bundled.

Register the first three as CSS family `Barlow` with weights 400/500/600; register the fourth as `Barlow Semi Condensed` with weight 600. Each font is upright (`font-style: normal`) and should use `font-display: swap`.

[provenance.json](provenance.json) records exact asset URLs, hashes, name-table values and inspected weight/style.
Choosing these faces is a project design decision, not evidence of improved detection or validated operator performance.
