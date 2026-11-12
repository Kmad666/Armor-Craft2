# Architecture

Stack: TypeScript, React 18, Three.js via react-three-fiber, zustand, Vite. Vitest + Playwright for tests.

## Principle

The design is plain JSON (`src/core/types.ts`). The 3D scene is always *derived* from it. A component
instance stores a template id, shape parameters, a transform, materials, layer info and an attachment;
never a mesh. Saving, undo, mirroring and custom parts are therefore all operations on small data.

## Modules

| Path | Responsibility |
| --- | --- |
| `src/body/` | Mannequin: body-part profiles (stacks of superellipse cross-sections), frames, regions. The same profiles build the mannequin mesh and fit the armor. |
| `src/geometry/MeshBuilder.ts` | Parametric surface builder: `P(u, v, offset)` grids, wall thickness, rims, material groups, attachment surfaces, deformers, mirroring. |
| `src/geometry/families/` | Procedural generators: `shell` (torso/limb shells, cloth, mail, skirts), `dome` (helmets), `cap` (pauldrons, cops), `gauntlet`, `footwear`, and accessories (`horn`, `crest`, `plate`, `medallion`, `chain`). |
| `src/geometry/build.ts` | Template + params -> cached geometry, parameter clamping. |
| `src/catalog/` | Data-driven template and material definitions. |
| `src/state/ops.ts` | Every edit as a pure function `Design -> Design` (add, attach, mirror, reorder, custom parts...). |
| `src/state/layering.ts` | Layer manager: real shell offsets per layer, and "squeeze" of soft layers under upper ones. |
| `src/state/store.ts` | zustand store: design, selection, tools, undo/redo, persistence actions. |
| `src/persistence/` | Versioned schema validation, migrations, localStorage storage, autosave. |
| `src/scene/` | R3F scene, component rendering, morph handles, gizmos, picking, placement ghost. |
| `src/ui/` | Top bar, hierarchy, inspector, catalogue, dialogs, tutorial, thumbnail renderer. |
| `src/presets/` | The three demonstration designs, assembled with the same ops the UI uses. |

## Key mechanisms

- **Fitting**: shell families sample the body profile at each height and add an offset, so pieces conform to the body part they belong to.
- **Layering**: `computeFit` sums the thickness of everything below a piece that overlaps its body coverage. Layers are separated by geometry, not depth tricks. Cloth/mail under a higher layer is pressed flat in the covered range.
- **Morphing / trimming**: handles are emitted by the geometry family alongside the mesh, each bound to one parameter and a drag axis. Dragging changes the parameter; geometry is regenerated. Nothing is destroyed, so every edit is reversible.
- **Attachments**: a raycast hit is converted to parametric surface coordinates `(surface, u, v)` using per-vertex attributes. The accessory's frame is re-evaluated from the parent's current surface, so it follows reshaping. Hits on non-parametric geometry fall back to a static parent-local frame.
- **Symmetry**: right-side geometry is the left build with x flipped and winding reversed (no negative scale). Linked partners receive mirrored params, transforms, materials and attachments.
- **History**: immutable design snapshots; a drag is bracketed by `beginEdit` / `endEdit` so it is one undo step.

## Adding a component

Add one entry to `src/catalog/templates.ts`: pick a family, give its structural `cfg`, a parameter
`preset`, default materials, category and eras. The editor, handles, layering, thumbnails, save format
and tests pick it up automatically (the unit suite builds every template).

A new *kind* of shape is a new `Family` (`src/geometry/types.ts`): parameter definitions plus a
`build()` that returns geometry, handles and a pivot. Register it in `FAMILIES` in `build.ts`.

## Save format

`{ app: "armor-atelier", schema: 1, id, name, symmetry, mannequin, instances, roots, orderCounter }`.
`parseDesign` validates everything, clamps parameters, fills parameters added by later versions,
drops unknown templates with warnings and rejects newer schema versions. Add migrations to
`MIGRATIONS` in `src/persistence/schema.ts` when bumping `SCHEMA_VERSION`.
