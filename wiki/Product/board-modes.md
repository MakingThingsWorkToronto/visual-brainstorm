# Board Modes

The `kind` field of a board. Kinds are rendering/authoring hints — the studio renders all of
them with the same survey machinery; Claude varies the SVG content and option count.

| Kind | What the options are | Typical survey |
|---|---|---|
| `icon-grid` | candidate icons/glyphs/logos | multi-select 2–4, remix on, axes: style dials |
| `moodboard` | style tiles: color, texture, typography, composition studies | multi-select, per-option notes |
| `system-map` | architecture diagrams: boxes/arrows variants of the same system | single/dual select, elaboration-heavy |
| `storyboard` | user-flow frames or scene sequences | select the frames that ring true |
| `mindmap` | radial concept expansions from a seed idea | select branches to grow next round |
| `matrix` | comparison grids (options × criteria rendered as SVG) | select the row/framing that fits |
| `palette` | color systems with swatches + sample applications | select + axis dials (warm↔cool etc.) |
| `freeform` | anything | whatever Claude configures |

## Roadmap (visionary backlog — implement via `discussion/` plans)

- **Sketch-back annotations.** Draw on an option in the studio; strokes return to Claude as an
  SVG overlay — pointing beats describing.
- **Idea lineage tree.** Every option records its parents (selection/remix provenance already
  captured); render the session as a family tree of ideas; export as SVG.
- **Forked branches.** Park a direction, explore another, return — sessions as a DAG, not a line.
- **Voting rounds.** Multi-stakeholder mode: share the bridge URL on LAN, aggregate votes.
- **Exports.** Accepted artifacts → SVG sprite sheet, `<symbol>` library, React icon components,
  README gallery.
- **Live co-draw.** Claude streams SVG progressively (shimmer → shape) for whiteboard feel.
- **Board-kind plugins.** A kind is just a hint — third parties register custom renderers
  (mashup culture applied to ourselves).
