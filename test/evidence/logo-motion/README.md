# Logo rings and route loading — 2026-09-09

The shared logo retains all 41 supplied path definitions. Outer/inner rings rotate clockwise, the middle ring counterclockwise, and the core stays fixed. Header sizing is 48px desktop / 40px mobile with 40/28/18-second periods. The framework loading fallback reuses the component at 112px/96px and 8/6/4-second periods. Hover/focus pauses header motion; reduced motion stops all rings.

**Current verification passed:** [pivot-result.json](pivot-result.json). Six rotation phases keep each ring's core pivot within 0.000006px of the stationary core in the isolated desktop header/loading rendering. Phone layouts at 320px and 390px fit without horizontal overflow or brand/wallet overlap. Web typecheck passed. Current images: [desktop](concentric-desktop.png), [320px](concentric-mobile-320.png), [390px](concentric-mobile-390.png).

The focused browser observations use actual source CSS, font and SVG geometry with header/wallet presentation fixtures. The earlier ring observation rendered the actual React mark and loading component. No live wallet, financial transaction or full Next navigation campaign was run. The fallback has no artificial delay and appears only when Next suspends a route. This is a presentation checkpoint, separate from financial evidence.

## Retained corrections

- `result.json` and `desktop.png` / `mobile-*.png` describe the initial whole-logo rotation. The owner clarified that individual rings should rotate; that prototype is superseded.
- `rings-result.json` and `rings-*.png` verify independent direction, original geometry, reduced motion and layout in the first ring version. Those checks did not validate the common pivot. The owner identified visible wobble: CSS `50% 50%` resolved to `(172, 172)`, rather than the core `(162.829, 157.18)` because of the offset viewBox. The explicit user-space pivot fixes that error. Only `pivot-result.json` and `concentric-*.png` represent the final pivot check; prior input hashes remain historical.

The underlying supplied drawing is not a set of mathematically perfect circles. The final check verifies the shared rotation pivot without redrawing its path geometry.
