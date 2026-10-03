# artifact-preflight

Deterministic pre-delivery gate for generated visual artifacts.

**Executable Source of Truth:** this directory in `andykalyakin/agents-best-practices`.

## Architecture
```text
Visualization semantic model
        ↓
SVG / HTML
        ↓
artifact-preflight
  ├─ pinned svg-diagram geometry checks
  ├─ Safe Content Box >= 0.5 line-height
  ├─ canonical arrow family
  └─ semantic axis/quadrant assertions
        ↓
final PDF
        ↓
PDF page-boundary gate
        ↓
rendered visual QA
```

The upstream linter is vendored verbatim at commit `c30c9e3bc9a70f2b77b60c7ea27157de3a88d81a`. Runtime never follows upstream HEAD.

Default upstream profile is **geometry**, not upstream house style. Palette/font-style opinions remain owned by Andy's internal presentation/rendering conventions.

## Commands
```bash
node artifact-preflight.mjs --self-test
node artifact-preflight.mjs --json diagram.svg
node artifact-preflight.mjs --html report.html
node artifact-preflight.mjs --html report.html --pdf report.pdf --pdf-margin-pt 30
```

Exit codes: `0 PASS`, `1 FAIL`, `2 INVALID`.

## Runtime
- Node.js 22+; no npm dependencies for SVG checks.
- Python 3 + PyMuPDF for the optional final-PDF page-boundary gate.

## Semantic matrix contract
For coordinate/matrix visuals, annotate each quadrant's bounding rect:
```xml
<rect data-preflight-role="quadrant" data-x-pole="low" data-y-pole="high" .../>
```
The validator asserts low→high left-to-right on X and low→high bottom-to-top on Y. Quadrant semantics therefore cannot drift independently from the declared axes.

## Update policy
A new upstream version is an explicit reviewed change: inspect commit → repin vendor → run self-test and regression artifacts → update provenance only after PASS.
