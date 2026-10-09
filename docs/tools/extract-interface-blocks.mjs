import fs from "node:fs";
const [md, out] = process.argv.slice(2);
const src = fs.readFileSync(md, "utf8");
const re = /```ts (sim|content|shared)\n([\s\S]*?)```/g;
const parts = { sim: [], content: [], shared: [] };
for (const m of src.matchAll(re)) parts[m[1]].push(m[2].split("\n").filter((l) => !/^import /.test(l)).join("\n"));
const hdr = {
  content: 'import { z } from "zod";\n',
  sim: 'import { TYPABLE_CHARS } from "./content.ts";\nimport type { DamageType, Rarity, GearSlot, WeaponArchetype, ContentBundle, StarChallenge } from "./content.ts";\n',
  shared: 'import { z } from "zod";\nimport { Rarity } from "./content.ts";\nimport type { LoadoutSource } from "./sim.ts";\n',
};
fs.mkdirSync(out, { recursive: true });
for (const k of Object.keys(parts)) fs.writeFileSync(`${out}/${k}.ts`, hdr[k] + parts[k].join("\n"));
fs.writeFileSync(`${out}/tsconfig.json`, JSON.stringify({ extends: "./tsconfig.base.json", include: ["sim.ts", "content.ts", "shared.ts", "probe.ts"] }));
console.log(Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])));
