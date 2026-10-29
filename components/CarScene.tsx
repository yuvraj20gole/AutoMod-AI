"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import * as THREE from "three";
import CutawayLabels from "./CutawayLabels";

useGLTF.preload("/models/car-new.glb");

const HEADLIGHT_COLOR = "#E8F4FF";
const ENGINE_AMBER = "#FF6B00";
const ENGINE_RED = "#FF3300";
const UNDERGLOW_COLOR = "#FF2200";
const CUSTOM_COLOR = "#00BFFF";
const PERF_COLOR = "#FF4500";
const BODY_CARBON = "#1a1a2e";
const CARBON_TARGET = new THREE.Color(BODY_CARBON);

const BASE_ROTATION_Y = Math.PI;

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

type SceneProps = {
  scrollYProgress: MotionValue<number>;
  loadStartRef: MutableRefObject<number | null>;
};

function CarModel({ scrollYProgress, loadStartRef }: SceneProps) {
  const { scene } = useGLTF("/models/car-new.glb");

  const carRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);

  const headlightMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const bodyPanels = useRef<
    {
      mat: THREE.Material;
      baseOpacity: number;
      baseColor: THREE.Color | null;
    }[]
  >([]);

  useEffect(() => {
    if (!scene) return;

    const lights: THREE.MeshStandardMaterial[] = [];
    const candidates: { mesh: THREE.Mesh; volume: number }[] = [];

    scene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      const name = mesh.name.toLowerCase();
      const matName = (
        (mesh.material as THREE.Material | undefined)?.name || ""
      ).toLowerCase();

      const looksLikeLight =
        /light|lamp|headlight/.test(name) ||
        /light|lamp|headlight/.test(matName);

      if (looksLikeLight) {
        const baseMat = Array.isArray(mesh.material)
          ? mesh.material[0]
          : mesh.material;
        if (baseMat && "emissive" in baseMat) {
          const std = (baseMat as THREE.MeshStandardMaterial).clone();
          std.emissive = new THREE.Color(HEADLIGHT_COLOR);
          std.emissiveIntensity = 0;
          if (Array.isArray(mesh.material)) {
            mesh.material = [std, ...mesh.material.slice(1)];
          } else {
            mesh.material = std;
          }
          lights.push(std);
        }
        return;
      }

      const isWheel = /wheel|tire|tyre|rim|brake|disc|caliper/.test(name);
      if (isWheel) return;

      const isChassis = /chassis|frame|axle|engine|block|suspension/.test(name);
      if (isChassis) return;

      const mat = mesh.material as THREE.Material | undefined;
      const isGlass =
        !!mat &&
        (mat.transparent ||
          (mat as THREE.MeshPhysicalMaterial).transmission > 0);
      if (isGlass) return;

      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      mesh.geometry.boundingBox?.getSize(size);
      const volume = size.x * size.y * size.z;
      if (volume <= 0) return;

      candidates.push({ mesh, volume });
    });

    const maxVol = candidates.reduce((m, c) => Math.max(m, c.volume), 0);
    const panels: {
      mat: THREE.Material;
      baseOpacity: number;
      baseColor: THREE.Color | null;
    }[] = [];

    candidates.forEach(({ mesh, volume }) => {
      if (volume < maxVol * 0.05) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const cloned = mats.map((m) => {
        if (!m) return m;
        const c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
        c.side = THREE.DoubleSide;
        const baseColor =
          "color" in c
            ? (c as THREE.MeshStandardMaterial).color.clone()
            : null;
        panels.push({
          mat: c,
          baseOpacity:
            (c as THREE.Material & { opacity?: number }).opacity ?? 1,
          baseColor,
        });
        return c;
      }) as THREE.Material[];
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
    });

    headlightMats.current = lights;
    bodyPanels.current = panels;
    loadStartRef.current = performance.now();
  }, [scene, loadStartRef]);

  useFrame(() => {
    const p = scrollYProgress.get();

    if (carRef.current) {
      let y: number;
      if (p < 0.15) y = BASE_ROTATION_Y;
      else if (p < 0.55)
        y = BASE_ROTATION_Y + ((p - 0.15) / 0.4) * Math.PI * 2;
      else if (p < 0.8) y = BASE_ROTATION_Y + Math.PI * 2;
      else
        y =
          BASE_ROTATION_Y +
          Math.PI * 2 +
          smoothstep((p - 0.8) / 0.2) * 0.65;
      carRef.current.rotation.y = y;
      carRef.current.rotation.x = -0.04;
    }

    if (loadStartRef.current !== null) {
      const elapsed = (performance.now() - loadStartRef.current) / 1000;
      const t = smoothstep(clamp01((elapsed - 1.0) / 1.5));
      const intensity = t * 3.0;
      for (const m of headlightMats.current) m.emissiveIntensity = intensity;
    }

    const enterT = smoothstep(clamp01((p - 0.55) / 0.13));
    const exitT = smoothstep(clamp01((p - 0.78) / 0.04));
    const xrayMix = clamp01(enterT - exitT);

    for (const panel of bodyPanels.current) {
      const mat = panel.mat as THREE.MeshStandardMaterial & { opacity: number };
      mat.opacity = (1 - xrayMix * 0.92) * panel.baseOpacity;
      mat.depthWrite = xrayMix === 0;
      if (panel.baseColor) {
        mat.color.lerpColors(panel.baseColor, CARBON_TARGET, xrayMix);
      }
    }

    if (innerRef.current) {
      let s: number;
      if (p < 0.6) s = 1;
      else if (p < 0.72) s = lerp(1, 1.04, (p - 0.6) / 0.12);
      else if (p < 0.78) s = 1.04;
      else if (p < 0.8) s = lerp(1.04, 1, (p - 0.78) / 0.02);
      else s = 1;
      innerRef.current.scale.setScalar(s);
    }
  });

  return (
    <group ref={carRef} position={[0, -0.3, 0]}>
      <group ref={innerRef}>
        <primitive object={scene} scale={1} />
      </group>
    </group>
  );
}

function HeadlightSpots({
  loadStartRef,
}: {
  loadStartRef: MutableRefObject<number | null>;
}) {
  const leftRef = useRef<THREE.SpotLight>(null);
  const rightRef = useRef<THREE.SpotLight>(null);
  const leftTarget = useRef<THREE.Object3D>(null);
  const rightTarget = useRef<THREE.Object3D>(null);

  useEffect(() => {
    if (leftRef.current && leftTarget.current)
      leftRef.current.target = leftTarget.current;
    if (rightRef.current && rightTarget.current)
      rightRef.current.target = rightTarget.current;
  }, []);

  useFrame(() => {
    if (loadStartRef.current === null) return;
    const elapsed = (performance.now() - loadStartRef.current) / 1000;
    const t = smoothstep(clamp01((elapsed - 1.0) / 1.5));
    const i = t * 3.0;
    if (leftRef.current) leftRef.current.intensity = i;
    if (rightRef.current) rightRef.current.intensity = i;
  });

  return (
    <>
      <group ref={leftTarget} position={[-0.7, 0.3, 8]} />
      <group ref={rightTarget} position={[0.7, 0.3, 8]} />
      <spotLight
        ref={leftRef}
        position={[-0.7, 0.3, 1.8]}
        color={HEADLIGHT_COLOR}
        intensity={0}
        angle={0.55}
        penumbra={0.6}
        distance={14}
      />
      <spotLight
        ref={rightRef}
        position={[0.7, 0.3, 1.8]}
        color={HEADLIGHT_COLOR}
        intensity={0}
        angle={0.55}
        penumbra={0.6}
        distance={14}
      />
    </>
  );
}

function DynamicLights({
  scrollYProgress,
}: {
  scrollYProgress: MotionValue<number>;
}) {
  const engineRefs = useRef<(THREE.PointLight | null)[]>([null, null, null, null]);
  const underglow = useRef<(THREE.PointLight | null)[]>([null, null]);
  const sweepRef = useRef<THREE.SpotLight>(null);
  const sweepTarget = useRef<THREE.Object3D>(null);

  useEffect(() => {
    if (sweepRef.current && sweepTarget.current)
      sweepRef.current.target = sweepTarget.current;
  }, []);

  useFrame(() => {
    const p = scrollYProgress.get();
    const engineIn = smoothstep(clamp01((p - 0.58) / 0.05));
    const engineOut = 1 - clamp01((p - 0.78) / 0.04);
    const t = engineIn * engineOut;
    const amberI = t * 4;
    const redI = t * 1.5;
    if (engineRefs.current[0]) engineRefs.current[0].intensity = amberI;
    if (engineRefs.current[1]) engineRefs.current[1].intensity = amberI;
    if (engineRefs.current[2]) engineRefs.current[2].intensity = amberI;
    if (engineRefs.current[3]) engineRefs.current[3].intensity = redI;

    const perfT = clamp01((p - 0.8) / 0.2);
    for (const l of underglow.current) if (l) l.intensity = perfT * 1.2;

    if (sweepRef.current) {
      sweepRef.current.intensity = perfT * 3;
      sweepRef.current.position.x = lerp(-5, 5, perfT);
    }
  });

  return (
    <>
      <pointLight
        ref={(el) => {
          engineRefs.current[0] = el;
        }}
        position={[0, 0.4, 0.5]}
        color={ENGINE_AMBER}
        intensity={0}
        distance={2.0}
      />
      <pointLight
        ref={(el) => {
          engineRefs.current[1] = el;
        }}
        position={[-0.35, 0.2, 0.3]}
        color={ENGINE_AMBER}
        intensity={0}
        distance={2.0}
      />
      <pointLight
        ref={(el) => {
          engineRefs.current[2] = el;
        }}
        position={[0.35, 0.2, 0.3]}
        color={ENGINE_AMBER}
        intensity={0}
        distance={2.0}
      />
      <pointLight
        ref={(el) => {
          engineRefs.current[3] = el;
        }}
        position={[0, 0.1, 0.8]}
        color={ENGINE_RED}
        intensity={0}
        distance={1.5}
      />
      <pointLight
        ref={(el) => {
          underglow.current[0] = el;
        }}
        position={[-1, -0.8, 0]}
        color={UNDERGLOW_COLOR}
        intensity={0}
        distance={3}
      />
      <pointLight
        ref={(el) => {
          underglow.current[1] = el;
        }}
        position={[1, -0.8, 0]}
        color={UNDERGLOW_COLOR}
        intensity={0}
        distance={3}
      />
      <group ref={sweepTarget} position={[0, 0, 0]} />
      <spotLight
        ref={sweepRef}
        position={[-5, 4, 5]}
        color="#FFFFFF"
        intensity={0}
        angle={0.5}
        penumbra={0.5}
        distance={20}
      />
    </>
  );
}

function SpeedParticles({
  scrollYProgress,
}: {
  scrollYProgress: MotionValue<number>;
}) {
  const COUNT = 150;
  const pointsRef = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3] = -4 + Math.random() * 8;
      arr[i * 3 + 1] = -0.5 + Math.random() * 1.5;
      arr[i * 3 + 2] = -8 + Math.random() * 5;
    }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);

  useFrame(() => {
    const p = scrollYProgress.get();
    if (p < 0.8) {
      if (matRef.current) matRef.current.opacity = 0;
      return;
    }
    const visible = clamp01((p - 0.8) / 0.02);
    if (matRef.current) matRef.current.opacity = visible;

    const arr = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 2] += 0.05;
      if (arr[i * 3 + 2] > 2) {
        arr[i * 3 + 2] = -8 - Math.random() * 2;
        arr[i * 3] = -4 + Math.random() * 8;
        arr[i * 3 + 1] = -0.5 + Math.random() * 1.5;
      }
    }
    geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        ref={matRef}
        size={0.03}
        color="#AAEEFF"
        transparent
        opacity={0}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function CameraRig({
  scrollYProgress,
}: {
  scrollYProgress: MotionValue<number>;
}) {
  const { camera } = useThree();
  const targetPos = useMemo(() => new THREE.Vector3(0, 1.8, 8.5), []);
  const targetLook = useMemo(() => new THREE.Vector3(0, 0.6, 0), []);

  useFrame(() => {
    const p = scrollYProgress.get();
    let x: number, y: number, z: number;

    if (p < 0.15) {
      x = 0;
      y = 1.8;
      z = 8.5;
    } else if (p < 0.55) {
      const t = smoothstep((p - 0.15) / 0.4);
      x = lerp(0, 2.5, t);
      y = lerp(1.8, 1.2, t);
      z = lerp(8.5, 6.0, t);
    } else if (p < 0.8) {
      const t = smoothstep((p - 0.55) / 0.25);
      x = lerp(2.5, 1.8, t);
      y = lerp(1.2, 2.0, t);
      z = lerp(6.0, 6.5, t);
    } else {
      const t = smoothstep((p - 0.8) / 0.2);
      x = lerp(1.8, 2.0, t);
      y = lerp(2.0, 0.6, t);
      z = lerp(6.5, 6.8, t);
    }

    targetPos.set(x, y, z);
    targetLook.set(0, 0.6, 0);
    camera.position.lerp(targetPos, 0.08);
    camera.lookAt(targetLook);
  });

  return null;
}

function HtmlOverlays({
  scrollYProgress,
}: {
  scrollYProgress: MotionValue<number>;
}) {
  const heroHeadingOpacity = useTransform(scrollYProgress, (v) =>
    v < 0.12 ? 1 : v < 0.2 ? 1 - (v - 0.12) / 0.08 : 0,
  );
  const heroHeadingY = useTransform(
    scrollYProgress,
    [0, 0.12, 0.2],
    [0, 0, -40],
  );
  const heroSubOpacity = useTransform(scrollYProgress, (v) =>
    v < 0.1 ? 1 : v < 0.18 ? 1 - (v - 0.1) / 0.08 : 0,
  );
  const heroSubY = useTransform(scrollYProgress, [0, 0.1, 0.18], [0, 0, -40]);

  const customOpacity = useTransform(scrollYProgress, (v) => {
    if (v < 0.55) return 0;
    if (v < 0.6) return (v - 0.55) / 0.05;
    if (v < 0.75) return 1;
    if (v < 0.8) return 1 - (v - 0.75) / 0.05;
    return 0;
  });
  const customY = useTransform(scrollYProgress, (v) => {
    if (v < 0.55) return 30;
    if (v < 0.6) return 30 - ((v - 0.55) / 0.05) * 30;
    return 0;
  });

  const customSubOpacity = useTransform(scrollYProgress, (v) => {
    if (v < 0.58) return 0;
    if (v < 0.63) return (v - 0.58) / 0.05;
    if (v < 0.75) return 1;
    if (v < 0.8) return 1 - (v - 0.75) / 0.05;
    return 0;
  });
  const customSubY = useTransform(scrollYProgress, (v) =>
    v < 0.75 ? 0 : v < 0.8 ? -((v - 0.75) / 0.05) * 30 : -30,
  );

  const perfOpacity = useTransform(scrollYProgress, (v) => {
    if (v < 0.8) return 0;
    if (v < 0.86) return Math.max(0, (v - 0.82) / 0.04);
    return 1;
  });
  const perfY = useTransform(scrollYProgress, (v) =>
    v < 0.8 ? 60 : Math.max(0, 60 - ((v - 0.82) / 0.04) * 60),
  );

  return (
    <div className="fixed inset-0 z-10 pointer-events-none">
      <div className="absolute top-[8vh] left-0 right-0 z-30 pointer-events-none flex flex-col items-center text-white text-center px-6">
        <motion.div style={{ opacity: heroHeadingOpacity, y: heroHeadingY }}>
          <motion.h1
            initial={{ opacity: 0, y: -30, letterSpacing: "0.5em" }}
            animate={{ opacity: 1, y: 0, letterSpacing: "0.05em" }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 2.0 }}
            style={{ textShadow: "0 0 30px rgba(255,255,255,0.3)" }}
            className="text-6xl md:text-7xl font-bold"
          >
            AutoMod AI
          </motion.h1>
        </motion.div>

        <motion.div style={{ opacity: heroSubOpacity, y: heroSubY }}>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 2.8 }}
            className="mt-4 text-base md:text-lg text-neutral-300 max-w-xl mx-auto"
          >
            Transform any car with AI-powered modifications and real-time previews
          </motion.p>
        </motion.div>
      </div>

      <motion.h2
        style={{
          opacity: customOpacity,
          y: customY,
          fontSize: "clamp(3rem, 8vw, 7rem)",
          fontWeight: 900,
          color: CUSTOM_COLOR,
          textShadow:
            "0 0 40px rgba(0,191,255,0.9), 0 0 80px rgba(0,191,255,0.4)",
          lineHeight: 1,
        }}
        className="absolute top-[8vh] left-0 right-0 z-30 pointer-events-none text-center"
      >
        Customization
      </motion.h2>

      <motion.div
        style={{ opacity: customSubOpacity, y: customSubY }}
        className="absolute top-[26vh] left-0 right-0 z-20 pointer-events-none text-center text-cyan-100/90 px-6"
      >
        <p className="text-base md:text-lg max-w-xl mx-auto">
          From wheels to spoilers, build your dream car digitally
        </p>
      </motion.div>

      <motion.h2
        style={{
          opacity: perfOpacity,
          y: perfY,
          fontSize: "clamp(3rem, 8vw, 7rem)",
          fontWeight: 900,
          color: PERF_COLOR,
          textShadow:
            "0 0 40px rgba(255,69,0,0.9), 0 0 80px rgba(255,69,0,0.4)",
          lineHeight: 1,
        }}
        className="absolute top-[8vh] left-0 right-0 z-30 pointer-events-none text-center"
      >
        Performance
      </motion.h2>

      <motion.div
        style={{ opacity: perfOpacity, y: perfY }}
        className="absolute top-[26vh] left-0 right-0 z-20 pointer-events-none text-center text-white/90 px-6"
      >
        <p
          className="text-base md:text-lg max-w-2xl mx-auto leading-relaxed"
          style={{
            textShadow:
              "0 0 40px rgba(255,69,0,0.8), 0 0 80px rgba(255,69,0,0.4)",
          }}
        >
          Unleash every horsepower. Tune brakes, suspension, exhaust and engine
          mods with AI precision.
        </p>
      </motion.div>
    </div>
  );
}

export default function CarScene() {
  const { scrollYProgress } = useScroll();
  const loadStartRef = useRef<number | null>(null);

  return (
    <div className="relative bg-black text-white">
      <div style={{ height: "800vh" }} aria-hidden />

      <div className="fixed inset-0 z-0">
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [0, 1.8, 8.5], fov: 45 }}
        >
          <color attach="background" args={["#070707"]} />
          <fog attach="fog" args={["#000000", 8, 20]} />

          <ambientLight intensity={2.5} />
          <hemisphereLight args={["#ffffff", "#222222", 1.0]} />
          <directionalLight position={[5, 8, 5]} intensity={2.5} />
          <directionalLight
            position={[-3, 5, -3]}
            intensity={1.2}
            color="#ffffff"
          />
          <directionalLight position={[0, -2, 5]} intensity={0.8} />
          <pointLight
            position={[0, 2, 5]}
            intensity={6}
            color="#ffffff"
            distance={12}
          />
          <pointLight position={[-4, 2, 2]} intensity={3} color="#ffffff" />
          <pointLight position={[4, 2, 2]} intensity={3} color="#ffffff" />
          <pointLight position={[0, 6, 0]} intensity={3} color="#e8e8ff" />
          <pointLight position={[0, 2, -4]} intensity={1.5} color="#4488ff" />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.8, 0]}>
            <planeGeometry args={[50, 50]} />
            <shadowMaterial opacity={0.35} />
          </mesh>

          <Suspense fallback={null}>
            <CarModel
              scrollYProgress={scrollYProgress}
              loadStartRef={loadStartRef}
            />
          </Suspense>

          <HeadlightSpots loadStartRef={loadStartRef} />
          <DynamicLights scrollYProgress={scrollYProgress} />
          <SpeedParticles scrollYProgress={scrollYProgress} />
          <CameraRig scrollYProgress={scrollYProgress} />
        </Canvas>
      </div>

      <HtmlOverlays scrollYProgress={scrollYProgress} />
      <CutawayLabels scrollYProgress={scrollYProgress} />
    </div>
  );
}
