import { Mesh, PlaneGeometry, Scene, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createLightingUniforms } from "../lighting";
import { QUALITY_TIERS } from "../quality";
import { pathCenter } from "./water";
import { MAX_TWINS, REFLECT_WINDOW, WaterReflections } from "./waterReflect";

const lighting = createLightingUniforms();

function srcMat(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTint: { value: new Vector3(1, 1, 1) }, uTime: { value: 0 } },
    vertexShader: "void main(){ gl_Position = vec4(0.0); }",
    fragmentShader: "void main(){ gl_FragColor = vec4(1.0); }",
  });
}

function make(scene: Scene): WaterReflections {
  return new WaterReflections(
    scene,
    lighting,
    new PlaneGeometry(10, 10),
    new PlaneGeometry(1, 1),
    [30, 0, -15],
    [0.2, 0.23, 0.13],
    (m) => m,
  );
}

function prop(scene: Scene, mat: ShaderMaterial, x: number, y = 0): Mesh {
  const m = new Mesh(new PlaneGeometry(1, 1), mat);
  m.position.set(x, y, -3);
  scene.add(m);
  return m;
}

describe("water reflections (T2.2)", () => {
  it("adds a QualitySettings.waterReflect ladder: everything -> props only -> opaque bog", () => {
    expect(QUALITY_TIERS.map((q) => q.waterReflect)).toEqual([0, 1, 2]);
  });

  it("mirrors each prop about y = 0 and shares one material per source material", () => {
    const scene = new Scene();
    const w = make(scene);
    const sm = srcMat();
    const a = prop(scene, sm, 28, 0.5);
    const b = prop(scene, sm, 30);
    w.add(a, false);
    w.add(a, false); // idempotent
    w.add(b, false);
    expect(w.count).toBe(2);
    w.update(30);
    const twins = scene.children.filter(
      (c) => (c as Mesh).material !== sm && c !== w.surface && c !== w.skyCard,
    );
    expect(twins.length).toBe(2);
    const t = twins[0] as Mesh;
    expect(t.position.y).toBeCloseTo(-0.5);
    expect(t.scale.y).toBe(-1);
    expect(new Set(twins.map((x) => (x as Mesh).material)).size).toBe(1);
  });

  it("never shows more than MAX_TWINS twins, however many props are near", () => {
    const scene = new Scene();
    const w = make(scene);
    const sm = srcMat();
    for (let i = 0; i < 140; i++)
      w.add(prop(scene, sm, 30 - REFLECT_WINDOW + (i / 140) * REFLECT_WINDOW * 2), false);
    w.update(30);
    const shown = scene.children.filter(
      (c) => (c as Mesh).material !== sm && c !== w.surface && c !== w.skyCard && c.visible,
    );
    expect(shown.length).toBeLessThanOrEqual(MAX_TWINS);
    expect(w.visibleCount).toBe(shown.length);
    expect(shown.length).toBeGreaterThan(20);
  });

  it("skips props far from the camera and props whose base is high above the water", () => {
    const scene = new Scene();
    const w = make(scene);
    const sm = srcMat();
    w.add(prop(scene, sm, 30 + REFLECT_WINDOW + 5), false);
    w.add(prop(scene, sm, 30, 5.4), false); // a hanging lantern
    w.update(30);
    expect(w.visibleCount).toBe(0);
  });

  it("tier 1 drops actor twins, tier 2 drops every twin and the sky card and makes the surface opaque", () => {
    const scene = new Scene();
    const w = make(scene);
    const sm = srcMat();
    w.add(prop(scene, sm, 29), false);
    w.add(prop(scene, srcMat(), 31), true);
    w.setTier(0);
    w.update(30);
    expect(w.visibleCount).toBe(2);
    expect(w.surfaceMat.transparent).toBe(true);
    w.setTier(1);
    w.update(30);
    expect(w.visibleCount).toBe(1);
    w.setTier(2);
    w.update(30);
    expect(w.visibleCount).toBe(0);
    expect(w.skyCard.visible).toBe(false);
    expect(w.surfaceMat.transparent).toBe(false);
    expect(w.surfaceMat.uniforms.uWaterTier?.value).toBe(2);
  });

  it("follows an actor's frame swaps and hides the twin when the source leaves the scene", () => {
    const scene = new Scene();
    const w = make(scene);
    const actor = prop(scene, srcMat(), 30);
    w.add(actor, true);
    w.update(30);
    const twin = scene.children.find(
      (c) => c.visible && c !== actor && c !== w.surface && c !== w.skyCard,
    ) as Mesh;
    actor.geometry = new PlaneGeometry(2, 3);
    w.update(30);
    expect(twin.geometry).toBe(actor.geometry);
    scene.remove(actor);
    w.update(30);
    expect(w.visibleCount).toBe(0);
  });

  it("has no broad specular lobe in the surface shader (white-blotch regression)", () => {
    const frag = make(new Scene()).surfaceMat.fragmentShader;
    expect(frag).toContain("260.0");
    expect(frag).not.toMatch(/pow\([^)]*,\s*(8|10|12|16|24|32)\.0\)/);
  });

  it("keeps the boardwalk centre line in step with the shader", () => {
    expect(pathCenter(0)).toBeCloseTo(0.15);
    expect(pathCenter(31)).toBeCloseTo(
      0.15 + Math.sin(31 * 0.13) * 0.25 + Math.sin(31 * 0.047) * 0.35,
    );
  });
});
