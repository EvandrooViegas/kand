# Design Study and editable generation

A **Design Study** is a visual language, not a set of templates. It answers "what makes these designs look like one family?" and lets the system compose many different layouts in that language.

```
CONTENT + DESIGN STUDY + BRAND → composition planner → Canvas document → deterministic validation/fit → editable post
```

There are three layers:

- **Design Study** (`globalDesignFamilies` / `globalDesignVersions`, `family.study`) — the visual language:
  - composition, hierarchy, typography behaviour
  - colour *roles*, contrast
  - imagery strategy
  - spacing and density
  - decorative language
  - branding placement
  - recurring rules, flexible rules and anti-patterns
- **Brand** (`flows.brandContext`) — actual colours, fonts, logo and assets.
- **Content** — headline, body, CTA, labels.

## The study

`studySchema` (`lib/designs/global/types.ts`) has two halves:

- **Prose** explains the language to people and to the planning model. These fields are `personality`, `composition`, `typography`, `colorContrast` / `colorRoles`, `imagery`, `spaceDensity`, `decorative`, `hierarchy` and `logoPlacement`. Three existing fields carry the rules:
  - `familyRules` = **recurring rules**
  - `variantRules` = **flexible rules**
  - `avoid` = **anti-patterns**
- **`grammar`** is what the composition planner reads. It holds relationships and constraints, never coordinates:

| Grammar field | Meaning |
|---|---|
| `compositions` | Composition moves the language allows: `statement`, `stacked`, `split`, `image-led`, `backdrop-type`, `list`, `closing` |
| `headline`, `body`, `emphasis` | Scale, weight, case, tracking, leading; accent treatment (`color`, `background` marker, `underline`) |
| `alignment`, `anchors` | Allowed alignments and vertical copy anchors, dominant first |
| `margin`, `density` | Spacing behaviour |
| `surfaces` | Surface roles (`dark`, `light`, `brand`), dominant first |
| `decorations` | Decorative vocabulary: `oversizedType`, `ring`, `circle`, `arc`, `line`, `dotGrid`, `pill`, `cornerBlock`, `frame`, `glow`, each with scale, opacity, colour role and frequency |
| `imagery` | Scale, positions, shape, overlap, dominance, overlay, frequency |
| `branding`, `cta` | Logo, slide number and website placement; CTA style |

Every grammar field tolerates partial model output. An unknown value falls back to a default and never discards the study.

`study.imagery.mode` is one of `none`, `background`, `fullBleed`, `cutout`, `contained`, `collage`, `mixed`, `other`. Imagery comes from the study, not from Brand Personalization.

**Reference reconstructions** (`family.variants`, ids `reference-N`) are kept as review evidence: how the importer read each reference. Generation never selects or fills them. A reconstruction that fails validation is dropped; it never fails the study.

Families saved before grammars existed (and the bundled seeds before version 3) get a grammar **derived in code** from their reconstructions (`deriveGrammar` in `study.ts`). `reconcileStudy` stores a complete grammar whenever a draft is saved.

## Study creation (`lib/designs/global/analyze.ts`)

- **One Groq multimodal call per batch** of references (`GROQ_DESIGN_VISION_MAX_IMAGES`, default 3). One or more references are accepted.
  - References in a call are studied together. Later batches receive the study so far and revise it.
  - Repeating characteristics become recurring rules. Differences become flexible rules or grammar options, never separate templates.
- **At most one text-only repair** when the output is invalid. Images are never resent.
- `reconcileStudy` then completes the grammar and removes literal hex colours from the study text.
- `referenceStyle` and `typography.*Fallback` are used only for unbranded library previews.

## Post generation

| Stage | Request | Model calls |
|---|---|---|
| Plan | `POST /api/plan-post` | 1 Groq completion for copy and composition plan together (a 2nd only if the output fails validation). Zero when existing copy is re-planned. |
| Visuals | `POST /api/resolve-assets` | Only for slides whose composition carries imagery. |
| Compose + validate | `POST /api/design-canvas` | None. |

### Plan

`studyForPlanning` sends the prose, rules, imagery strategy and allowed compositions. It never sends coordinates or reference images.

For each slide the model returns:
- a `composition`
- emphasis words
- an image subject plus stock queries

`sanitizeDesignPlan` removes invalid choices:
- compositions the study does not allow
- images on typographic compositions or no-imagery studies
- emphasis words that are not in the headline

### Compose (`lib/designs/global/compose.ts`, deterministic)

`planSlides` picks, for each slide:
- **Composition:** the plan's choice, or a deterministic choice. Covers, list-like content and closings get suitable moves. Consecutive slides avoid repeating, and the least-used move is preferred.
- **Imagery:** whether the slide has an image, following the study's frequency.
- **Placement:** alignment, anchor, image position and surface role.

`composeSlide` then builds the slide:
- **Brand roles:** dark, light, accent and on-accent colours come from the brand (`brandPalette`).
- **Text:** copy is measured and fitted as a group. Complete copy is never cut; text that cannot fit fails with a clear error.
- **Images:** placed in a deterministic frame (`imageFrame`). The asset planner uses the same frame for its briefs.
- **Decorations:** placed on the sides the copy leaves free.
- **Branding:** logo (a light or dark variant when the brand has them), slide number and handle go where the study puts them.

Every output node is an independent, editable Canvas node (`text`, `shape`, `image`, `gradient`) with a `designRole`.

### Build fallback

If copy does not fit, a calmer composition with the same imagery decision is tried before failing (`renderGlobalPost`).

### Validate

`validate.ts` checks for:
- unsupported nodes and invalid geometry
- missing images
- canvas overflow
- minimum type size
- contrast and text collisions (oversized backdrop type is exempt from the collision check)

It corrects small problems and rejects real overflow. There is no AI repair.

Each AI call logs `[ai-call] service=… model=… purpose=… referenceImages=…`. Count these per generation to audit usage.

## Library UI

- The admin page shows the reference images and four sample compositions generated from the study.
- The study itself is editable (prose, grammar controls, rules).
- Reconstructions and the raw grammar JSON sit in a collapsed *Advanced* section.
- There are no variant names, roles or template routes.
- Brand pickers preview the same four sample beats in the brand's identity.

## Limits

- Text measurement is estimated, not browser-measured. Condensed and serif fonts have correction factors.
- Contrast is checked only against the solid page background, not over photos or shapes.
- `collage` is studied and stored, but one slide currently carries one image slot, so it composes as contained imagery.
- Live vision quality, image composition and manual editor save/reopen/export need live credentials and a browser to verify.
