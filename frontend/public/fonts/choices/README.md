# Local appearance font choices

Inspected and downloaded from the primary font repositories on **26 September 2026**.
All five fonts use SIL Open Font License 1.1; exact upstream license texts are included.
These upright variable assets are served locally. No font CDN is contacted at runtime.
Existing IBM Plex Sans files and their provenance remain in the parent directory; Segoe UI/system uses the installed system font.

| Family / primary source | Pinned revision | Bundled file | Bytes | SHA-256 |
|---|---|---|---|---|
| [Geist](https://github.com/vercel/geist-font) | `10dc7658f13c38a474cde201bb09a4617267545b` | `GeistVariable.woff2` | 69,760 | `2ffebe993e969069a9789d15164b7715d42491b5835516c5e3b935d5f81b05f1` |
| [Inter](https://github.com/rsms/inter) | `353b61b9f4430d5f420d56605a6e7993e0941470` | `InterVariable.woff2` | 352,240 | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` |
| [Manrope](https://github.com/googlefonts/manrope) | `468c0dbe38efa331b80bfe9448256abe27be44c3` | `ManropeVariable.woff2` | 53,892 | `30b83738add8c9edd9e3450b98036a9a8fb5668d0cbd4eb0ce5fe6761197f21f` |
| [PublicSans](https://github.com/uswds/public-sans) | `d3df3455fb94643925f816276e81b231bc31619f` | `PublicSansVariable.woff2` | 42,020 | `0dc1736888d7214101b9c20f93f174ea076b4edda3d2b3fb1a7ea934f7915658` |
| [SourceSans3](https://github.com/adobe-fonts/source-sans) | `87b37a2daaed80fcb8e8ccb0085c4d72ddade12e` | `SourceSans3Variable.woff2` | 170,188 | `5f16566f7a40d39b339ad26be151fa5a1ab1f0c2574c7a2e619765584a1acbd8` |

Total new WOFF2 bytes: **688100**.

Public Sans upstream supplies variable TTF. It was repackaged losslessly as WOFF2 using fontTools **4.66.0**, without subsetting, glyph edits or name-table edits. The other four WOFF2 files are upstream bytes unchanged.

[provenance.json](provenance.json) records exact download URLs, source and bundled hashes, font metadata/axes and license hashes.
Font choice is an interface preference, not a measured readability or performance claim.
