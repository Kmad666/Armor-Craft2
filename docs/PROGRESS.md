# Progress

## Done

- Foundation: mannequin, camera, studio lighting, panels, toolbar, shortcuts
- Catalogue: 103 templates (13 helmets, 18 torso/neck, 9 waist, 14 arm/shoulder, 6 hand, 9 leg, 5 foot, 27 accessories incl. faceplates and visors), search, category and era filters, rendered thumbnails
- Fitting and five-layer stacking with real offsets and soft-layer squeeze
- Morph handles and non-destructive trimming on every family
- Surface attachments with ghost preview, sliding, re-parenting, nesting, snap, repeat-around
- Symmetry: linked twins, mirror, break link
- Materials: 29 presets, per-component and per-region, procedural mail / weave / leather / scale textures
- Move / rotate / scale gizmos, undo/redo, duplicate, delete, lock, hide, reset
- Save / load / rename / duplicate / delete, JSON export / import, autosave recovery, custom part library
- First-run tutorial, three demonstration presets
- 141 unit tests, 13 browser tests

## Known limitations

- Mannequin has a fixed A-pose and fixed proportions.
- Cloth is shaped procedurally (folds, flare, squeeze); there is no simulation.
- Clipping is prevented by layer offsets and squeeze, not by collision. A lower layer made much wider than the one above can still poke through; the inspector warns about it.
- Accessories attached at a static point (for example a faceplate hanging in an open face) do not follow parent reshaping; use "Snap to surface" or re-place.
- Mail texture scale stretches on the flared shoulder part of the coif.
- A template is bound to its body part: a vambrace cannot be dropped on a shin.
- Touch and narrow screens have only a basic layout. Drag-and-drop from the catalogue needs a mouse; click-to-place works everywhere.
- Not deployed anywhere. `npm run build` output in `dist/` is static and can be hosted on GitHub Pages.

## Next

1. GitHub Pages deployment workflow (needs owner approval)
2. Touch-friendly handles and panel layout
3. Poses and body proportion sliders
4. Collision-based clipping checks
5. GLB export
