# tests/canonical/api — canonical expected response bodies (endpoint × status code)

One JSON file per proven endpoint × status code (plus the WS message envelopes).
`tests/api-status-matrix.test.mjs` drives a REAL `Bridge` and asserts every response
BODY against the file here; its final test prints the endpoint × codes coverage table,
fails on any censused pair without a proof, and fails if any file in this folder goes
unused (set-equality between disk and consumed expectations — that is this folder's
stray-file guard; `canonical-data.test.mjs` only checks these files are valid JSON).

## Matching convention (dynamic fields)

Values match literally, objects key-for-key (no extra, no missing keys), arrays by
index — EXCEPT sentinel strings, which assert by type/predicate:

- `<<string>>` / `<<nonempty-string>>` / `<<number>>` / `<<boolean>>`
- `<<iso-date>>` — ISO-8601 timestamp (dynamic: stamped at request time)
- `<<abs-path>>` — absolute filesystem path (dynamic: temp dirs per test run)
- `<<contains:X>>` — string containing X (zod/JSON error text: only the issue code
  or the honest message fragment is contract, not the full serialized error)
- `<<file:relpath>>` — exact contents of `tests/canonical/<relpath>` (non-JSON bodies:
  the static studio index html)
- `<<canonical:relpath[@Schema][#dot.path]>>` — deep-match against another canonical
  file, optionally parsed through the named protocol schema first (defaults applied,
  same law as production), optionally narrowed to a subpath

Non-JSON responses (artifact SVG, static html, 503 plain text) are wrapped as
`{ "contentType": ..., "body": ... }`; plain JSON bodies are stored as-is.
