export { AmbientDirector, type FlameRef } from "./ambient/ambient";
export { type ParticleSpawn, Particles } from "./ambient/particles";
export {
  type AmbientKind,
  BIOME_IDS,
  BIOMES,
  type BiomeId,
  type BiomeMood,
  blendMood,
  isBiomeId,
  validateMood,
} from "./biomes";
export { BATTLE_POSE, BOSS_INTRO_POSE, type CameraPose, DioramaCamera, WALK_POSE } from "./camera";
export { type LightDef, LightRig, MAX_LIGHTS, TORCH_COLOR } from "./lighting";
export { ADDITIVE, FxKind, fxMaterial } from "./materials/fx";
export { SpriteActor, SpriteResources } from "./materials/sprite";
export { type PostEffects, PostPipeline } from "./post/pipeline";
export {
  AutoQuality,
  isQualityTier,
  percentile,
  QUALITY_TIERS,
  type QualitySettings,
  type QualityTier,
  tierSettings,
} from "./quality";
export { RenderWorld, type RenderWorldOptions } from "./RenderWorld";
export { computeOutputSize, createRenderer } from "./renderer";
export { ProceduralSpriteSource } from "./sprites/ProceduralSpriteSource";
export type { BackdropKind, SpriteFrame, SpriteSource } from "./sprites/SpriteSource";
