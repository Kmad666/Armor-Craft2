# Testing

## Automated

`npm test` - 141 unit tests:
- every catalogue template builds finite geometry for both sides
- parameter clamping; cuirass trim raises only the lower edge and is reversible; local deformation
- mirrored builds are exact reflections with correct normals
- layer ordering, offsets, squeeze, reordering
- symmetry propagation, break link, mirror create/update
- attachments ride reshaped surfaces; frames; nesting; delete; duplicate; snap; repeat
- serialization round trip, malformed input, migrations, storage, autosave
- undo/redo, grouped drags, cancel, locking

`npm run test:e2e` - 13 Playwright tests in headless Chrome (software WebGL), using real mouse input
for handle drags, gizmos, placement, sliding and drag-and-drop. They cover acceptance scenarios A-H
from the brief plus the tutorial, scene list, catalogue filters, camera views and the designs dialog.
Screenshots are written to `shots/`.

Last full run: 141/141 unit, 13/13 browser.

## Manual QA scripts

1. **Layers**: equip Cloth Tunic, Mail Shirt, Full Cuirass. Select the cuirass, drag the amber bottom handle up. Mail appears beneath; drag down to restore. Hide the mail in the scene list to see the tunic.
2. **Faceplate**: equip Roman Galea, click Simple Faceplate (Head > Faceplates), click the mouth area. Move the helmet with W; the plate follows. Save, reload, load.
3. **Horns**: equip Spangenhelm, click Curved Horn (Accessories), click the side of the dome. Two horns appear. Select one, Break link, change its length.
4. **Custom part**: with the helmet selected, Save as custom part. New design, Custom tab, click it.
5. **Import errors**: import a non-JSON file; an error toast appears and the design is untouched.

## Not covered by automation

- Real-GPU frame rate (tests run on a software rasterizer). Geometry rebuilds measure 1-11 ms per component in Node.
- Touch input and narrow-screen layout (a basic overlay layout exists but is untested).
- Firefox and Safari.
