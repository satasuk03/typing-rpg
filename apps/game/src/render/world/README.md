# World layouts (T2.2)

Level worlds are built from data. A level is one JSON file in `src/assets/levels/ch<N>-l<NN>.json` that
uses a **simplified subset of the LDtk project format**, so an artist can author or edit the same level in
the real LDtk editor later.

```
layout JSON --parseLevelLayout (zod)--> LevelLayout --buildWorld(layout, renderWorld, spriteSource)--> WorldHandle
```

- `layout.ts`: types, zod schemas, the loader (`parseLevelLayout`) and cross-reference validation.
- `registry.ts`: `levelIds()`, `loadLevel(id)` (all `ch*-l*.json` files, parsed on first use).
- `WorldBuilder.ts`: `buildWorld`, `WalkPath`, `moodAtX`. **No coordinates live in code**; every position
  comes from the layout.
- Dev scene: `?scene=level&id=ch1-l03&pose=walk|battle:1|boss[&at=<x>][&tier=0|1|2][&freeze=1]`
  (`src/dev/levelScene.ts`).
- The level JSON files in `src/assets/levels/` are the source of truth; edit them by hand or in LDtk.
  (The old `generate.mjs` authoring script was deleted because it was stale.)

## Why LDtk (and not Tiled)

Our levels are entity-heavy (props, lights, anchors, camera hints with custom fields), not tile maps. LDtk's
Entities layers with typed custom fields map one-to-one onto that, and the JSON is easy to hand-write: a
level is a flat list of `entityInstances` with `fieldInstances`. Tiled would need object-layer custom
properties and a different, more verbose nesting.

## The supported subset

One level per file (like LDtk "separate level files"):

```jsonc
{
  "jsonVersion": "1.5.3",
  "levels": [{
    "identifier": "ch1-l03",
    "pxWid": 2560, "pxHei": 416,           // informational
    "fieldInstances": [ ...level fields... ],
    "layerInstances": [{ "__identifier": "Entities", "__type": "Entities", "entityInstances": [ ... ] }]
  }]
}
```

Only the first layer with `__type: "Entities"` is read. Unknown extra keys (LDtk metadata such as `iid`,
`__grid`, `__tags`) are ignored; **unknown field names and unknown entity types are errors** (typo guard).

### Coordinates

LDtk entities are placed on a 2D grid, so the level's plan view maps onto our world like this:

```
world x = px.x / 16 + xOrigin      (level field, e.g. -30)
world z = px.y / 16 + zOrigin      (level field, e.g. -16; -z is the background, +z the camera)
world y = a per-entity `y` field (height above the ground), default 0
width / height (px) / 16 = the extent of rect entities along x / z
```

`z = 0` is the action plane; the hero stands at about `z = 0.25`. Fields hold the rest. Colour/vec fields are
`Array<Float>` (`[r, g, b]` linear, may exceed 1 for glow).

### Level fields

| field | type | notes |
|---|---|---|
| `id` | String | `ch<chapter>-l<NN>`, must equal `identifier` |
| `chapter`, `name`, `note` | Int / String | `note` is a one-line art direction |
| `biome` | String | `forest`, `ruins`, `cave`, `hollow` (alias `boss`) |
| `xOrigin`, `zOrigin` | Float | px to world offsets (see above) |
| `seed` | Int | mixed into every scatter seed |
| `encounters` | JSON array | `{index (1..n), slots (1..5), waves, boss}`; anchors must exist for each |

### Entity types

| entity | rect? | fields |
|---|---|---|
| `Segment` | x extent | `biome`, `mood` (partial biome mood: `amb`, `sunCol`, `fogCol`, `exposure`, ...), `blend` (m of crossfade into the next segment). Segments must tile the level without gaps. |
| `Ground` | x + z extent | `caveFrom`, `caveTo`: x range where the ground dithers from forest dirt to cave slabs (both far right = all forest, both far left = all cave) |
| `Wall` | x extent | `cy`, `height`, `z`, `edgeX` (cliff / cave back wall; visible from about `edgeX + 7`) |
| `Backdrop` | | `kind` (`sky`/`mountains`/`treeline`), `width`, `height`, `pos` [x,y,z], `tint`, `fogK`, `rep`, `follow` |
| `Prop` | | `key` (SpriteSource key), `y`, `scale`, `flip`, `foreground`, `flame` (torch flame size, 0 = none), `light` (`{color,intensity,radius,dy,dz,scatter,flicker}`), style: `tint`, `rim`, `emis`, `dark`, `wrap` |
| `Scatter` | x + z extent | `keys[]`, `spacing [min,max]`, `y [min,max]`, `scale [min,max]`, `flipRandom`, `seed`, `foreground`, `avoidBattle` (m kept clear around the battle and walk camera centres), `gap` (0..0.95 chance a slot stays empty), plus `flame`, `light`, style like `Prop`. Deterministic: seeded RNG, one pass along x. |
| `Light` | | `y`, `radius`, `color`, `intensity`, `scatter`, `flicker` |
| `Glow` | | `y`, `size`, `color`, `intensity`, `foreground` (lantern halo, the layout twin of `RenderWorld.addGlow`) |
| `GodRay` | | `y`, `w`, `h`, `rotZ`, `color`, `intensity` |
| `RayField` | x + z extent | a row of god rays: `spacing`, `w [min,max]`, `h`, `rotZ`, `color`, optional `color2` + `colorFromX`, `intensity [min,max]`, `seed` |
| `Rune` | | `size`, `intensity` (boss-arena ground circle) |
| `AmbientZone` | x + z extent | `kind` (`pollen`, `fireflies`, `leaves`, `embers`, `spores`, `dust`, `motes`), `density` (particles/s), `y [min,max]` |
| `Anchor` | | `name`, `kind` (`start`, `end`, `hero`, `slot`, `boss`, `marker`), `encounter`, `slot`, optional `y` (height of an in-air anchor: plate at the Willow's face, riddle leaves) |
| `WalkPath` | | `points`: `[[x, z], ...]` in world coordinates, x strictly increasing |
| `Camera` | | `name` (`walk`, `battle:<n>`, `boss`) and optional `y`, `dist`, `pitch`, `fov`; the entity's x is the framing centre |

### Required anchors and cameras

For each encounter `n` with `slots` enemy slots: anchors `enc<n>.hero` and `enc<n>.slot0` ...
`enc<n>.slot<slots-1>`, and a `battle:<n>` camera. A boss encounter also needs a `boss` camera. Every level
needs anchors `start` and `end` and a `walk` camera. `walkshot` (a `marker`) is where the dev scene puts the
hero for the static walk screenshot. Anchors are names only; enemy data lives in content.

### Rules the validator enforces

- The **hero lane** `z` in (-2.2, 2.2) is clear of ground props and mid-ground scatters (heroes and enemies
  stand there). Hanging pieces (`y >= 6`) are exempt.
- Foreground pieces sit at `z >= 5` (they are drawn in the blurred foreground layer); everything else stays at
  `z <= 5.6` so it cannot cover the lens.
- Segments cover the level contiguously; encounter indices are 1..n; the walk path is monotonic in x.

### Authoring in the real LDtk editor

Create an Entities layer and define the entity types above with the listed fields (`Array<Float>` for
vectors, `Array<String>` for `keys`). Known gap: LDtk has no native JSON field type, so `mood`, `light` and
the level's `encounters` are stored as JSON values in these hand-written files; an editor workflow would
first need them split into scalar fields (or a small pre-export script). The files in `src/assets/levels/`
are valid against the loader today, but have not been opened in the LDtk app.

## Using the world

```ts
const layout = loadLevel("ch1-l03");
const handle = buildWorld(layout, renderWorld, renderWorld.source);
handle.getAnchor("enc1.hero");        // { name, kind, x, z }
handle.encounter(1);                  // { def, hero, slots[], camera }
handle.walkPath.sample(0.5);          // { x, z, tx, tz }
handle.cameraPose("battle:1");        // CameraPose for DioramaCamera.setTarget
handle.update(dt, camera.pose.x);     // per frame: per-x mood crossfade + ambient zone particles
handle.setLetterbox(true);            // boss intro bars
handle.dispose();                     // removes everything the builder added
```

`dispose()` removes the meshes, flames, god rays and static lights the builder added; GPU geometry and
materials are tracked by the RenderWorld and released with `renderWorld.dispose()`.

## Chapter 2 (T2.4)

`ch2-l01..l10.json` follow the same schema. Biomes `hushwood` (L1-L4, `leaf` ground, `*Night` backdrops), `fen` (L5-L9, `fen`
boardwalk ground, `*Dusk` backdrops) and `grove` (L10, `roots` ground with `arenaX/arenaZ` = the Willow). The hero stop z follows the
shared path centre line (`pathCenter` in `materials/water.ts`). Every encounter has an `encN.pool` marker (the warm lantern pool over
the fight). L10's boss encounter has `enc3.slot0` (kind `boss`) plus add slots, and named markers: `boss.face` (plate at the face,
`y`), `boss.arena`, `riddle.leaf0..2` (the Riddle of Leaves lane, left to right = lane 0..2, `y` = leaf height) and `riddle.clue`
(the riddle panel anchor). `?scene=level&id=ch2-l10&pose=battle:3&anchors=1` draws all anchors over the frame. The files are
produced from a seeded authoring script; edit the JSON (or re-run it) and `levels-ch2.test.ts` checks the light budget (<= 9 static
lights per camX +- 17), the water-twin cap (<= 60 incl. actors) and the foreground framing per battle pose.
