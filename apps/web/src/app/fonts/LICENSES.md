# Self-hosted font licenses (E01-S022, ADR 0006)

On-prem has no internet access, so every font this app uses is vendored into the repo
and loaded via `next/font/local` (never `fonts.googleapis.com`/`fonts.gstatic.com`).

| File | Size | Variable axes | License |
|---|---|---|---|
| `NotoSansTC[wght].woff2` | 5.16 MB | `wght` 100–900 (**font's own default: 100/Thin — always set `font-weight` explicitly**) | OFL 1.1 (`NotoSansTC-OFL.txt`) |
| `Roboto[wdth,wght].woff2` | 0.21 MB | `wght` 100–900 (default 400), `wdth` 75–100 (default 100) | OFL 1.1 (`Roboto-OFL.txt`) |
| `MaterialSymbolsOutlined[FILL,GRAD,opsz,wght].woff2` | 3.78 MB | `FILL` 0–1, `GRAD` -50–200, `opsz` 20–48, `wght` 100–700 | Apache-2.0 (`MaterialSymbols-LICENSE-2.0.txt`) |

Total: 9.15 MB (spec's `< 12 MB` budget).

## Source / provenance

- Noto Sans TC / Roboto: downloaded as TTF variable fonts from Google Fonts' official
  site, then format-converted to WOFF2 with fontTools 4.61.1 — glyph data untouched,
  only the container format changed.
- Material Symbols Outlined: downloaded as a TTF variable font from the official
  `google/material-design-icons` repository's `variablefont/` directory, converted the
  same way.

## Notes

- The three bracketed axis lists in the filenames are aligned verbatim with the E01-S022
  spec — do not rename them.
- Noto Sans TC's `wght` axis defaults to 100 (Thin). CSS must always set `font-weight`
  explicitly; relying on the font's own default renders Chinese text nearly invisible.
- No file here has been re-hinted, subsetted, or otherwise modified beyond the
  TTF→WOFF2 container conversion — full glyph sets, per this story's explicit scope
  (subsetting is a listed future optimization, not part of this story).
