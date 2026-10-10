# Ch2 riddle phase: the Willow stays visible

Real Metal, 1280x720, `apps/game/tests/vfx/metal-willow-fix.metal.ts` (moment `riddle0`, run with `R_AT=1`): consecutive frames from the first frame a riddle panel is live. The probe renders each frame with and without the boss mesh and diffs them (boss luma vs backdrop luma, ratio = (max+16)/(min+16)).

- `before-riddle-hud-on.jpg` / `after-riddle-hud-on.jpg`: 4 consecutive frames, HUD on. Before: the panel and 3 leaves sit on the face and trunk. After: the clue panel is left of the trunk (under the hero panel), the leaves sit clear of it, and the trunk, face and root collar are keep-outs for the layout.
- `before-riddle-hud-off.jpg` / `after-riddle-hud-off.jpg`: the same GL frames with the HUD canvas hidden.

Luma (boss/backdrop ratio, 24 consecutive riddle frames): before 1.31-1.84 (rim-flash dips to 1.3-1.4); after min 1.73, mean 1.83, max 1.90. The Hush Spell fix reference is ~1.8.

Note: in this harness the riddle body was already a dark violet silhouette (about p1's 1.85); the sign-off "pale lavender ghost" (#25) did not reproduce. The render change therefore only guards against it: no pale hit wash (a held dark tint) and a 0.02 rim cap while the face state is `riddle`, and a dimmer face light. The main fix is the layout.
