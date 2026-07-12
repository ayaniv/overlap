# iOS Home-Screen Widget — Feasibility Notes

> Status: **exploration only, not started.** Captured 2026-07-10 to resume over the weekend.
> This is a scoping/feasibility summary, not an approved design doc. When ready to build,
> pick a packaging path (below), then run brainstorming → writing-plans to spec it.

## Goal

Turn overlap (the radial multi-timezone clock) into a real iOS home-screen **widget** —
not a PWA / Add-to-Home-Screen icon, an actual WidgetKit widget.

## The unavoidable core

A home-screen widget on iOS is a **WidgetKit extension, and WidgetKit renders SwiftUI only.**
The live SVG + JS clock cannot run inside it. So regardless of path, the genuinely new work is:

1. **Port the pure ring/arc math** from `src/clock/geometry.ts` + `src/clock/cityTime.ts` to Swift
   — angles, working-hours arc start/end, in/out-of-hours flags. Pure math, no rendering.
2. **Redraw it in SwiftUI** (`Canvas` / `Path`) — the native equivalent of the `<svg>` arcs,
   mirroring the visual language (per-city `color`, glow vs dimmed) without pixel-matching web.

The geometry transfers cleanly because it's a closed-form function of `(time, locations)` —
the clock just rotates predictably; no simulation needed to compute a future position.

## The honest limitation on "live"

- **No smooth sweeping needle** — WidgetKit doesn't run continuous animation.
- **Not even guaranteed minute-accurate rings.** A timeline *can* carry many pre-computed
  future entries (cheap — each is pure math), and iOS renders them at their scheduled times
  without re-invoking the provider. BUT iOS throttles custom-drawn (`Canvas`) widget views to
  protect battery and does **not** promise per-minute updates for them.
  - Realistic: rings usually fresh within a few minutes, sometimes staler.
  - The center home-time **digit** CAN tick live via system `Text(date, style: .time)`.
  - Context: a true minute-precise analog clock widget has long been a known pain point on iOS.
- Set expectations accordingly: rings refresh periodically, not smoothly.

## Two ways to package it

### Option A — Lean native (recommended if building)
- Small SwiftUI app: a config screen + hosts the widget.
- Web app stays a plain Vercel site, **untouched**.
- Widget config is native (long-press → Edit Widget) — self-contained, no App Group bridge.
- Cost: a real Swift port, but minimal coupling and no web-wrapper baggage.

### Option B — Capacitor wrapper
- Wrap the existing web app as the iOS app; widget still native SwiftUI.
- Config mirrored app → widget via a native bridge plugin writing to a shared **App Group**
  container, then `WidgetCenter.shared.reloadAllTimelines()`.
- Reuses the JS app, BUT drags in:
  - **OAuth-in-webview problem** — Google blocks its sign-in inside embedded webviews
    (`disallowed_useragent`); the Calendar OAuth flow must be routed through the system browser.
  - **App Store 4.2 rejection risk** — "just a repackaged website" (the native widget helps but
    isn't a guaranteed pass).

| | A — Lean native | B — Capacitor |
|---|---|---|
| App shell | Small SwiftUI config + widget host | Wrap the web app |
| Web app | Untouched (Vercel) | Becomes the iOS app too |
| Config → widget | Native picker (long-press) | App Group bridge mirrors live in-app config |
| New baggage | A real Swift port | Bridge plugin + OAuth-in-webview fix + 4.2 risk |

## Costs either way

- **Apple Developer Program — $99/yr** (needed for App Store *and* TestFlight; free Apple ID
  only allows 7-day personal device installs).
- Xcode + a new Widget Extension target.
- A handful of Swift unit tests on the ported geometry (mirror the existing Vitest geometry
  tests) to catch drift between `geometry.swift` and `geometry.ts`.

## Bottom line

Feasible. Budget it as **"write a focused SwiftUI widget target with a small Swift geometry
port,"** NOT "reuse the React app on mobile" — the React app essentially doesn't come along for
the widget surface. Recommended path: **A (lean native)** unless there's a strong reason to ship
the web app itself as an App Store app.

## When resuming

1. Decide A vs B (default: A).
2. Confirm distribution intent (App Store vs TestFlight-only) — both need the $99 account.
3. Re-run `superpowers:brainstorming` to lock the design, then `writing-plans` for the plan.
