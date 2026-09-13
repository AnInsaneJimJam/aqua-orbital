# Frontend assets

## Current application

- `apps/web/public/brand/orbital.svg` is the static Orbital mark used by the app and Privy. `favicon.svg` provides the browser icon; loading states use the same static mark.
- `components/Saturn.tsx` and `components/saturnScene.ts` draw the landing illustration. Token glyphs orbit a stationary, dithered planet. Motion stops for reduced-motion preferences, hidden tabs, and offscreen content. `public/brand/saturn-static.svg` is the generated static fallback, checked against the same scene data.
- `public/brand/tokens/usdc.svg` comes from [Circle's brand assets](https://www.circle.com/pressroom). The oUSD6 and oUSD18 glyphs identify this application's demo tokens.
- The illustration is presentation artwork, not a chart of liquidity or live protocol activity.

## Fonts

Space Grotesk and Instrument Serif Regular/Italic are served locally through
`next/font/local`. Original OFL notices remain beside the font files in
`apps/web/src/fonts`. Sources: [Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk)
and [Instrument Serif](https://github.com/google/fonts/tree/main/ofl/instrumentserif).

## Earlier artwork

The first frontend used an owner-supplied WebM illustration from the
[Paradigm Orbital paper](https://www.paradigm.xyz/writing/orbital), plus a derived
poster and a playback component. The Saturn redesign superseded that unused
media path; the files were removed during cleanup. Their original bytes,
checksums, and attribution remain in the
[previous asset record](https://github.com/AnInsaneJimJam/aqua-orbital/blob/5ff7bd940a1e6b961523b34364163f4599a232e9/docs/ASSETS.md).
Historical design screenshots remain dated verification records.

Presentation assets do not establish financial correctness, authorship of the
underlying research, or endorsement by an upstream project.
