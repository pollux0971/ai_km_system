# Fonts & icons (E01-S022, ADR 0006)

## Why self-hosted

On-prem deployments have no outbound internet access, so this app cannot depend on
`fonts.googleapis.com`/`fonts.gstatic.com` at runtime. Every font is vendored into
`apps/web/src/app/fonts/` and loaded through `next/font/local`, which inlines the
`.woff2` as a build asset, preloads it, and applies `font-display: swap` (no FOUT) —
see `apps/web/src/app/layout.tsx`.

## The three fonts

| CSS variable | File | Used for |
|---|---|---|
| `--font-roboto` | `Roboto[wdth,wght].woff2` | Latin body text (first in the `font-family` stack) |
| `--font-noto-sans-tc` | `NotoSansTC[wght].woff2` | Chinese text (fallback after Roboto in the stack) |
| `--font-material-symbols` | `MaterialSymbolsOutlined[FILL,GRAD,opsz,wght].woff2` | Icons, via `<Icon>` (`packages/ui/src/icon.tsx`) |

**Noto Sans TC's own variable-axis default is `wght: 100` (Thin).** Never rely on an
unset `font-weight` anywhere Chinese text might render through this font — always set
one explicitly (`globals.css`'s `body` rule sets `font-weight: 400` for exactly this
reason). Full license/provenance details: `apps/web/src/app/fonts/LICENSES.md`.

## Adding an icon

```tsx
import { Icon } from "@ai-km/ui";

<Icon name="mic" />                          // outlined, 24dp, aria-hidden
<Icon name="mic" filled />                    // filled variant (FILL axis -> 1)
<Icon name="mic" size={36} />                 // bigger — also drives the opsz axis
<Icon name="mic" label="開始錄音" />           // meaningful icon: role="img" + aria-label
```

`name` is any [Material Symbols Outlined](https://fonts.google.com/icons) icon name
(e.g. `"mic"`, `"search"`, `"close"`) rendered via font ligature — the element's text
content *is* the name, which the font substitutes for the glyph. There is no name
enum: an icon that doesn't exist in the font just renders as literal text instead of a
glyph, so double-check the name against the Material Symbols icon list when adding a
new one. `size` is clamped to the font's actual `opsz` variable-axis range (20–48);
values outside that still set `font-size` correctly, just cap the optical-size axis.

Decorative icon (no meaning beyond the visible label next to it): omit `label` — the
icon is `aria-hidden`. Icon that carries meaning on its own (e.g. an icon-only button):
pass `label`, which switches it to `role="img"` + `aria-label`.

## Subsetting (not done yet)

This story ships the full, unsubsetted glyph sets for all three fonts (9.15 MB total,
within the spec's 12 MB budget). Subsetting to the actually-used glyph/icon set is a
listed future optimization (this story's explicit Non-Goal), not something to do
ad hoc — if a future story does pursue it, keep the same filenames/CSS variables so
this document and every `<Icon>` call site stay correct.
