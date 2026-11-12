# Design notes

- **Procedural geometry instead of authored models.** No modelling tool was available, and parameter-driven generation is what makes trimming, mirroring and reshaping non-destructive. Cost: shapes are stylised, not sculpted.
- **One body profile for mannequin and armor.** Guarantees fit and gives layer offsets for free. Cost: armor follows the fixed mannequin only.
- **Parameters, not vertex editing.** Handles change named parameters with clamped ranges, so shapes stay valid and saves stay tiny. Cost: no freeform sculpting.
- **Trim as a parameter.** The lower/upper edge is a span parameter, so shortening a cuirass regenerates the mesh rather than cutting it. Reversible by construction.
- **Squeeze instead of cloth simulation.** Soft layers are flattened where an upper layer covers them. Cheap, deterministic, and reads as a belted garment.
- **Mirroring by rebuilt geometry.** Right-hand parts are built mirrored with corrected winding rather than using negative scale, which keeps normals and lighting right.
- **Parametric attachment coordinates.** Accessories remember where on the surface they sit, not where in space, so they survive parent reshaping.
- **Accessories attach to armor, not to bare body.** Dropping one on the body attaches it to the outermost piece on that body part (this is how a faceplate joins a helmet with an open face).
- **On-demand rendering.** The canvas only redraws when something changes.
- **Era tags are filters only.** Any part combines with any other.
