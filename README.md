# @dsh-android/dsh-client-ui-responsive

Client plugin: responsive AppFrame for the Android shell — the upstream three-column frame plus a Mobile form.

## Design

- Derived from `@deepseek-ai/dsh-client-ui-layout` (MIT) — same DOM, same slots (`sidebar`/`conversation`/`details`/`shell.overlay`), same `ctx.layout` service face.
- Three-tier breakpoints: **Wide ≥1024** (unchanged three columns), **Narrow 640–1024** (upstream auto-collapse rail), **Mobile <640** (new): sidebar → left drawer, details → bottom sheet, conversation full width, top bar with hamburger, safe-area insets.
- Honest single-column semantics reuse the existing store: drawer state = sidebar preference/narrowExpanded extension; sheet = details preference mapping; overlay stays on top (z=20).
- Compile baseline: `@deepseek-ai/*` 0.1.0-rc.6 (same as the device install). Sync upstream changes periodically; eventually contribute the mobile form back upstream.

## Build

```sh
npm install
npm run build   # tsc (lib/types) + tsdown (lib/client.js browser bundle)
```

## Mounting (android profile patch)

```yaml
- id: ui-layout
  disabled: true
- insert:
    - id: ui-responsive
      name: '@dsh-android/dsh-client-ui-responsive'
```

## Known limitations

- Derived copy drifts from upstream ui-layout (sync on upstream bumps; see UPSTREAM-ITERATION.md).
- Gestures (edge-swipe close) deferred to M1.5; drawer/sheet are tap-driven.
