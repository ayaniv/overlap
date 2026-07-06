# Compact share-link wire format for `shareCodec.ts`

## Problem

The `#c=` share link encodes the full `ClockConfig` JSON (verbose object keys,
repeated per location) through `lz-string`. For the default config (home +
4 rings, no meetings) this produces a 509-character string. Most of the
length is redundant key names (`"timezoneId"`, `"workStart"`, etc.) repeated
once per location — restructuring the payload before compression gets a
meaningfully shorter link out of the same compressor, for free.

## Decisions locked during brainstorming

- **No backward compatibility** with already-shared `#c=` links. This is a
  young portfolio demo; nobody depends on the old format yet, so the codec
  can just change outright with no version byte or fallback path.
- **Keep the codec synchronous.** `encodeConfig`/`decodeConfig` stay plain
  sync functions — no dependency on the browser's async `CompressionStream`
  API. This avoids reworking `useClockConfig`'s synchronous
  `useState(() => resolveInitialConfig(...))` initializer, which can't await
  and would otherwise flash the default/local config before a shared link's
  real config swaps in.
- **Reshape the JSON payload, keep `lz-string` as the compressor.** Measured
  against the real default-config example link:
  - current (full object JSON + lz-string): 509 chars
  - tuple-shaped JSON + lz-string (this design): 320 chars (~37% shorter)
  - tuple-shaped JSON + fflate raw-deflate (rejected alternative): 266 chars
    (~48% shorter) but costs a new dependency and ~2.5KB gzip added to the
    bundle (fflate's deflate/inflate ≈ 4.2KB gzip vs. lz-string's ≈ 1.7KB
    already paid for). Given `plan.md` names "instantly-loading demo" as the
    project's top signal, the extra ~11 points of reduction isn't worth a
    bundle-size regression, so this was rejected in favor of the
    zero-dependency, zero-bundle-cost reshape-only option.

## Architecture

Add a private wire format inside `src/clock/shareCodec.ts`, invisible to the
rest of the app:

```ts
type WireLocation = [
  id: string,
  label: string,
  timezoneId: string,
  color: string,
  workStart: number,
  workEnd: number,
];
type WireMeeting = [id: string, startISO: string, title: string];
type WireConfig = { h: WireLocation; r: WireLocation[]; m: WireMeeting[] };
```

`encodeConfig`: `ClockConfig` → `toWire` → `JSON.stringify` →
`compressToEncodedURIComponent` (last step unchanged from today).

`decodeConfig`: `decompressFromEncodedURIComponent` → `JSON.parse` →
validate wire shape (`isWireConfig`) → `fromWire` → `ClockConfig`.

`toWire`/`fromWire`/`isWireConfig` are private to `shareCodec.ts`. The
public API (`encodeConfig(config: ClockConfig): string`,
`decodeConfig(encoded: string): ClockConfig | null`) keeps its exact current
signature, so nothing outside this file changes:

- `types.ts` — untouched; `ClockConfig`/`Location`/`Meeting` stay the
  runtime shape used everywhere else in the app.
- `configValidation.ts` — untouched; `isValidClockConfig` continues to
  guard the plain-object shape used for `localStorage` persistence
  (`persistConfig` in `useClockConfig.ts` still does
  `JSON.stringify(config)` directly — only the URL hash uses the compact
  wire format).
- `useClockConfig.ts`, `ControlCluster.tsx` — untouched; both only call the
  existing `encodeConfig`/`decodeConfig` functions by their unchanged
  signatures.

## Error handling

Mirrors the three existing failure branches in `decodeConfig` exactly:

1. Decompression fails (garbage/corrupt string) → `null`, no log.
2. Decompresses but isn't valid JSON → `null` + `console.error`.
3. Valid JSON but the wrong shape → `null` + `console.error`.

The new `isWireConfig` guard handles branch 3: it checks `h`/`r`/`m` exist
with the right array lengths and per-slot types *before* `fromWire` reads
any tuple index, so malformed input can't throw mid-reconstruction (e.g. a
non-array `h`, or a location tuple with the wrong arity or a non-number in
the `workStart`/`workEnd` slots).

## Testing

`src/clock/shareCodec.test.ts` keeps its existing cases as-is (round-trip,
URL-hash-safe character-set regex, all three error branches) — these should
keep passing unmodified since the compressor and its output alphabet are
unchanged, only the pre-compression JSON shape differs.

Add new cases:

- A wire-shaped-but-wrong-arity array (e.g. a 4-element location tuple) is
  rejected the same way `{foo:'bar'}` is rejected today (branch 3: `null` +
  logged error).
- The round-trip test remains the primary proof the reshape is lossless
  (encode → decode returns a deep-equal `ClockConfig`).
