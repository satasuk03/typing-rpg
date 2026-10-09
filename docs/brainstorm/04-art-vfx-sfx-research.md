# 04 — Art, VFX & SFX Research: Reproducing HD-2D on the Web

Goal: move the art-style POC from "nice pixel Canvas 2D" to a real HD-2D diorama ("ต้องตระการตา" — it must be visually spectacular), and decide what v2 adopts. The target frame is the Octopath Traveler cave battle: dark rock lit by warm firelight, ember streaks, huge slash arcs, chunky damage numbers with a WEAK tag, a tilted ground plane, and blurred foreground rocks right in front of the lens.

---

## 1. What HD-2D actually is (Square Enix / Acquire / Artdink)

| Ingredient | What the shipped games do | Source |
|---|---|---|
| **2D sprites in a 3D world** | Pixel-art characters and many props are flat billboards standing in a *fully 3D* environment. The environments are real geometry, not parallax strips. | Wikipedia "HD-2D"; UE spotlight |
| **Camera** | Perspective camera tilted down at the ground (roughly a 20–30° pitch), with a narrow-ish FOV. The ground visibly recedes, and the camera moves (push-ins on bosses and skills). Triangle Strategy's hardest problem was keeping the look with a free camera. | Wikipedia; Triangle Strategy producers (4Gamer via Nintendo Life / GoNintendo) |
| **Tilt-shift + depth of field** | A narrow focus band on the action plane, blurring both background *and* foreground. This "miniature/diorama" read is the signature. Players can disable it in Octopath II with `r.DepthOfFieldQuality=0`, which confirms it is a stock UE4 DOF pass. | Wikipedia; gamepretty config guide |
| **Dynamic point lights + shadows** | Torches, spells and windows are real point lights that light pixel textures and sprites. A point light is added so characters cast shadows. The lighting work took about 1.5 months of iteration to look "a cut above other modern pixel games". | Wikipedia (Asano quote); Siliconera (Famitsu interview) |
| **Bloom, fog, volumetrics, particles** | Strong bloom on emissives, volumetric light shafts, height/distance fog, and heavy particles (embers, dust, leaves). `r.BloomQuality` is a standard UE bloom. | Wikipedia; gamepretty |
| **Restraint on resolution** | The team found that pushing resolution or saturation too far "lost the appeal of pixel art". They also raised tile and color *density* because sprites looked lonely on big screens. | Siliconera (Famitsu interview) |
| **Engine** | UE4 with a small team (about 6 programmers at peak). Blueprints plus stock post-processing. Native 720p / 30 fps on Switch. | UE spotlight; Digital Foundry via Nintendo Everything |
| **"Simple base, realistic effects on top"** | Artdink's accepted Triangle Strategy demo started from a *simplified* image and layered realistic effects over it. Detail comes from light, not from more pixels. | 4Gamer via Nintendo Life |

**Key takeaway:** HD-2D is mostly a *lighting and lens* recipe applied to low-res art. The pixels stay crisp (nearest filtering, a consistent texel density). Everything that makes it lush is post-processing and light: DOF, bloom, fog in-scatter, grading and particles.

---

## 2. Web techniques to reproduce it

### 2.1 Geometry and camera (WebGL / three.js)
- **Perspective ground plane**: one large plane in world XZ, textured in the shader with *procedural texel-snapped* patterns (`floor(worldPos * 16)` → hash). This keeps a constant 16 texels/unit density that matches the sprites, with no texture memory. Biome blends (grass → stone) use Bayer dithering, so even transitions read as pixel art.
- **Billboard sprites**: upright quads whose anchor sits at the sprite's foot. The camera yaw is fixed, so plain XY-plane quads face the camera with no shimmer. Use `alphaTest` cutout, not blending, so sprites write depth and sort for free.
- **Depth layers**: far backdrop planes (sky, mountains, treeline), midground billboards (trees, ruins, stalagmites, cave wall), the action plane (z≈0), and a **foreground layer** close to the lens. The foreground is rendered into its own target and blurred hard, which is exactly what the Octopath screenshot shows.
- **Blob + cast shadows**: a soft radial decal under each actor, plus a flattened, sheared silhouette quad that points away from the dominant light. This is cheaper than shadow maps and reads better on pixel art.

### 2.2 Lighting
- **Forward point lights in a custom shader**: a fixed uniform array (16 lights: pos+radius, color×intensity) with smooth-squared falloff. A fixed count avoids three.js shader recompiles when lights come and go.
- **Normal-ish sprite shading**: generate a normal map from each sprite's alpha (distance-to-edge gradient → hemispherical bulge). This is the automated version of SpriteIlluminator / Sprite DLight. It gives side lighting and a **rim light** when a torch is behind or beside the sprite. The Defold thread warns that baked shading breaks when sprites flip, so we flip normals.x with the sprite.
- **Texel-level light on rock**: cave walls and floors derive a normal from texel-snapped value noise, so torches rake across individual "pixels" of stone. Lighting is lightly **posterized + Bayer dithered** to stay pixel-art.
- **Volumetric glow without raymarching**: an analytic in-scatter integral of a point light along the view ray: `(atan((t−s0)/h) − atan(−s0/h)) / h`. Every torch gets a foggy halo for the cost of a few ALU ops per light.
- **Light shafts**: additive, gradient-faded cone planes (forest god rays, the cave-mouth shaft, the chest beam), plus dust motes.

### 2.3 Post-processing chain (custom, at half/quarter res where possible)
1. **Scene → HDR target** (HalfFloat + depth texture), with emissives >1.0.
2. **Background DOF / tilt-shift**: circle of confusion from linear depth around a focus distance, plus a screen-space tilt-shift term. A half-res golden-angle disc gather weights samples by their own CoC, so in-focus sprites don't bleed into the blurred background (after Dennis Gustafsson's single-pass bokeh).
3. **Foreground layer**: rendered separately, then given a large separable Gaussian at quarter res and alpha-composited on top, so huge soft silhouettes overlap the action plane.
4. **Bloom**: a soft-knee threshold and a 5-level downsample/upsample mip chain (the CoD/Unreal "dual filter" style). It is cheaper and smoother than a big Gaussian.
5. **Composite**: ACES filmic tone map (Narkowicz fit), lift/gamma/gain plus saturation and temperature per biome (a LUT-equivalent), vignette, animated film grain, **chromatic aberration** and **radial zoom blur** pulses (crits, boss hits), and **heat distortion** around fireballs (UV ripple near projected positions).
6. **Quality ladder**: render scale 1.0 → 0.75 → 0.6, DOF taps 32 → 16, and fewer bloom levels. It is chosen automatically from a rolling frame-time average.

### 2.4 VFX vocabulary (from Octopath / action-JRPG "game feel")
- **Slash arcs**: ribbon meshes over an arc, with a hot white core → colored edge, a head-to-tail fade, and additive blending. Sized *larger than the enemy*. Stack 2–3 crossing arcs for a combo.
- **Hit-stop** (60–140 ms freeze), trauma-based **screen shake**, a **zoom punch**, a CA pulse, and white hit-flash on the sprite.
- **Damage numbers**: heavy serif numerals, a thick dark outline, a pop-in overshoot then a settle, and **WEAK / CRITICAL / BREAK** tags in boxed plates (Octopath's shield/break system).
- **Embers**: velocity-stretched additive quads (instanced). Streaks crossing near the lens become bokeh through the DOF.
- **Dissolve deaths**: a noise-threshold dissolve with a hot edge, plus the sprite's own pixels released as glowing particles.

### 2.5 Procedural SFX (Web Audio API)
- **sfxr / jsfxr / ZzFX** prove that a handful of parameters (waveform, pitch slide, envelope, noise, filter) covers most game sounds. ZzFX is under 1 KB. We hand-roll the same building blocks so the file stays dependency-free:
  - **noise buffer + biquad filters** → whooshes (band-pass sweep), impacts (low-passed noise + pitched sine drop), explosions, footsteps, fire crackle, wind;
  - **inharmonic sine partials** with exponential decay → metallic crit ring, shield bell, coin jingle;
  - **oscillator chords + scheduled notes** → boss stinger, victory fanfare;
  - a **generated-impulse ConvolverNode** for reverb, whose wet level follows the biome (cave = big tail);
  - a **DynamicsCompressor** on the master bus, a master volume, mute, and an AudioContext that is created/resumed only on the first user gesture.
- **Typing feel**: very short clicks whose pitch walks up a pentatonic scale as the combo grows, a detuned low square "buzz" for typos, and a two-note chime on word completion.

---

## 3. What v2 adopts (decisions)

| Area | Decision |
|---|---|
| Renderer | three.js **0.160.0** (core only, pinned on jsDelivr) with fully custom shaders and post. No EffectComposer, so DOF, bloom and grading are controlled precisely and cheaply. |
| Art | All procedural: v1's sprite builder (hero, slimes, bat, goblin, golem, chest) is reused, plus new generated props (trees, ferns, pillars, arches, stalagmites, stalactites, crystals, torches, vines). Each gets a generated normal map. |
| Depth | 4 depth bands + a separately blurred foreground layer; a tilted perspective camera; texel-snapped procedural ground. |
| Lighting | 16 dynamic point lights (torches, fireball, slash flashes, chest, crystals, guard), sun + hemisphere ambient per biome, analytic volumetric glow, posterized texel lighting. |
| Biomes | Sunlit forest → ruined gate (dusk) → torch-lit ember cave → Golem Hollow boss. Ambient, fog, grade and audio all crossfade by camera x. |
| Post | HDR → DOF (depth + tilt-shift) → foreground blur → bloom mips → ACES + grade + vignette + grain + CA/zoom/heat pulses. Auto quality ladder; `prefers-reduced-motion` damps shake, flashes, CA and zoom. |
| UI | HUD canvas overlay *above* the WebGL canvas, so VFX can never cover word labels. Octopath-like ornate frames, Cinzel display type, and pixel type for words. Shield/BREAK counters, WEAK tags, a boss nameplate and a title card. |
| SFX | Hand-rolled Web Audio synth: ~25 one-shots + biome ambience beds + stinger + fanfare. |

---

## 4. Recommendations for the production game (beyond the POC)
1. **Engine**: for the shipped game, Unreal 5 (the HD-2D reference stack) or Godot 4 (lighter, web export), if web is not a hard requirement. If web is a hard requirement, keep three.js/WebGL2 but move to a proper render-graph (pmndrs/postprocessing) and texture atlases.
2. **Sprite pipeline**: hand-drawn sprites in **Aseprite** at a fixed texel density (e.g. 16 px = 1 m), exported with tags → JSON atlas. Author **normal + emissive maps** per sheet (SpriteIlluminator or Aseprite layers), and flip normals with the sprite.
3. **Environment kit**: modular low-poly meshes with pixel textures (nearest, no mips or a custom mip bias), plus hand-placed lights. Treat lighting as an art pass per scene, as Square Enix did (1.5 months to find the look).
4. **Readability contract**: the typing words live in a UI layer that VFX can never cover. Use high-contrast plates and a fixed type scale tested at phone width. Effects get an intensity slider (accessibility + reduced motion).
5. **Audio**: replace procedural placeholders with designed SFX banks (Wwise/FMOD or Howler on web), but keep procedural *keystroke* audio for low latency, combo pitch and infinite variation.

---

## References
- HD-2D overview (techniques, developer quotes): https://en.wikipedia.org/wiki/HD-2D
- Unreal Engine developer interview, Octopath Traveler II: https://www.unrealengine.com/en-us/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style
- UE spotlight, Octopath Traveler HD-2D: https://www.unrealengine.com/ja/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true
- Famitsu interview via Siliconera (depth, saturation, tile density): https://www.siliconera.com/project-octopath-traveler-developers-answer-project-started-troubles-developing-hd-2d/
- Triangle Strategy producers on accurate HD-2D: https://www.nintendolife.com/news/2022/05/triangle-strategy-producers-talk-hd-2d-and-why-other-devs-havent-used-it and https://gonintendo.com/contents/4132-triangle-strategy-producer-talks-about-recreating-an-accurate-hd-2d-style
- Digital Foundry Triangle Strategy tech review (DOF, ambient shading): https://nintendowire.com/news/2022/03/31/get-a-deeper-analysis-of-the-tech-behind-triangle-strategy-with-digital-foundrys-latest-review/
- Digital Foundry Octopath Traveler analysis: https://nintendoeverything.com/octopath-traveler-technical-analysis/
- Octopath II DOF/Bloom cvars (UE stock passes): https://gamepretty.com/octopath-traveler-ii-how-to-turn-off-depth-of-field/
- Normal-mapped pixel art (SpriteIlluminator): https://www.codeandweb.com/spriteilluminator/tutorials/how-to-create-dynamically-lit-2d-scenes-for-unity
- Normal map lighting caveats for pixel sprites (Defold): https://forum.defold.com/t/normal-map-lighting-for-2d-pixel-art-sprites/70967
- three.js post-processing passes overview: https://www.educative.io/courses/learn-threejs-for-computer-graphics/postprocessing-passes
- jsfxr (sfxr port, Web Audio): https://github.com/chr15m/jsfxr
- ZzFX (tiny procedural SFX): https://npmjs.com/package/zzfx
- Procedural audio with the Web Audio API: https://dev.to/hexshift/how-to-create-procedural-audio-effects-in-javascript-with-web-audio-api-199e
- Single-pass bokeh DOF technique (Dennis Gustafsson): http://blog.tuxedolabs.com/2018/05/04/bokeh-depth-of-field-in-single-pass.html
- ACES filmic fit (Krzysztof Narkowicz): https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
