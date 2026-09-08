# Frontend asset provenance

Recorded 2026-09-09. The owner supplied `orbital.webm` and `svglogo.svg` in the repository root and explicitly requested their use as the frontend identity. They were moved into the app's public media/brand directories without modifying their bytes. These are supplied presentation assets, not authenticated financial evidence.

## Supplied illustration and logo

- Video: 1024 × 768, VP9 WebM, 14.4 seconds, 50 frames/second, no audio stream, 1,372,889 bytes. The owner identified it as the [Paradigm Orbital paper visualization](https://www.paradigm.xyz/writing/orbital). The landing figure links this source and credits Paradigm. It does not imply Paradigm built or endorsed this application. The clip is not a live pool chart.
- Logo: original SVG path geometry and source comment retained. Its embedded comment identifies SVG Repo / SVG Repo Mixer Tools. No independent authorship or license determination is claimed. The header renders the supplied asset with a CSS color filter; the favicon is a copy with only a dark-mode fill rule added, preserving all original paths.
- Poster: extracted from the supplied video at 5.5 seconds with `ffmpeg -ss 5.5 -i orbital.webm -frames:v 1 -q:v 3 orbital-poster.jpg`. It preserves the 4:3 composition. Reduced-motion, no-script and video failure states retain this descriptive still.

## Local fonts

Downloaded from the primary [Google Fonts Instrument Serif repository](https://github.com/google/fonts/tree/main/ofl/instrumentserif) and [Space Grotesk repository](https://github.com/google/fonts/tree/main/ofl/spacegrotesk). Original OFL notices are retained beside the font files. Next's `next/font/local` serves these files from the application; builds and page views do not require Google font requests. Instrument Serif Regular is used for the landing headline, Space Grotesk variable 300–700 for the interface, and system monospace for figure annotations and exact addresses.

## Retained checksums

| Asset | Repository path | SHA-256 |
| --- | --- | --- |
| Video | `apps/web/public/media/orbital.webm` | `557bd36953ec0efffe3224f823853decf6bcf073883568b5a98a7184b41793f4` |
| SVG logo | `apps/web/public/brand/orbital.svg` | `eedf91df231373917a152141ac81f90404a2e71a5d289f4bce3302f2b6090591` |
| Poster | `apps/web/public/media/orbital-poster.jpg` | `ecf3dfe5123681b07916e6324504f51e5c4c19895815203a9b2f17c195ec68ea` |
| Instrument Serif | `apps/web/src/fonts/InstrumentSerif-Regular.ttf` | `498efd461f6ddfcb7a111bf9a565709d2085d48201d501ead960d93e84ffbb88` |
| Space Grotesk | `apps/web/src/fonts/SpaceGrotesk.ttf` | `acad6de1fc93436f5c0f1f4137751ef04f1aea3063e7036535970ffcfbd79f72` |

## Editing boundaries

`OrbitalVisual` owns only media playback. It defaults to a poster, checks reduced-motion preference before automatic playback, pauses outside the viewport or in a hidden tab, and exposes a keyboard-accessible play/pause control. The original 4:3 video is not stretched or cropped. `content.ts` owns autoplay/visibility defaults; CSS owns layout and ordinary transition duration. A user may explicitly play even when reduced motion is requested. An autoplay refusal leaves a usable Play button; a media-load failure leaves the poster and a still-illustration label.

Exact financial values, transaction construction and receipt recovery remain in the existing SDK/controllers. Visual assets, tokens, fonts and layout can be replaced without changing those contracts.
