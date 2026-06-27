/** Main 3D viewport - fixed scaling, camera auto-fit, better lighting. */
 
import { useEffect, useRef, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, GizmoHelper, GizmoViewport, Html, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { CadObject, ExpertTool, SelectionMode, TransformMode } from "../utils/types";

const VIEW_COLORS = {
  background: "#111418",
  plate: "#1a2530",
  plateEdge: "#2bb8dc",
  gridCell: "#1e2832",
  gridSection: "#2bb8dc",
  neutralBody: "#d4d9e0",
  selectedBody: "#f0a020",
  hoveredBody: "#dde3ea",
  edgeSubtle: "#1a2535",
  edgeStrong: "#2bb8dc",
  edgeSelected: "#ffd060",
  edgeSelectedInk: "#7a4000",
  edgeSelectedDetail: "#ffb830",
  edgeHover: "#5ac8e0",
  measure: "#f0f4f8",
  measureAccent: "#2bb8dc",
};
const SKETCH_GRID_STEP_MM = 5;

// Plain-language labels for the editing tools so the toolbox reads like a
// consumer app, not CAD jargon.
const TOOL_LABELS: Record<ExpertTool, { label: string; hint: string; icon: string }> = {
  select: { label: "Select", hint: "Click parts to select and move them", icon: "M3 3l7.07 17 2.51-7.42L20 10.07z" },
  rectangle: { label: "Add box", hint: "Draw a rectangular block on the plate", icon: "M4 5h16v14H4z" },
  circle: { label: "Add cylinder", hint: "Draw a round cylinder on the plate", icon: "M12 4a8 8 0 100 16 8 8 0 000-16z" },
  hole: { label: "Make hole", hint: "Cut a round hole into the selected part", icon: "M12 4a8 8 0 100 16 8 8 0 000-16zm0 5a3 3 0 110 6 3 3 0 010-6z" },
  line: { label: "Split", hint: "Split a part into two along a line", icon: "M5 12h14" },
  cut: { label: "Cut slot", hint: "Cut a slot or notch out of a part", icon: "M5 7h14M5 12h14M5 17h14" },
};

const OP_LABELS: Record<string, { label: string; hint: string }> = {
  extrude: { label: "Taller", hint: "Increase the height" },
  fillet: { label: "Round", hint: "Round the edges" },
  chamfer: { label: "Bevel", hint: "Bevel (flatten) the edges" },
  shell: { label: "Hollow", hint: "Hollow the inside out" },
};

const SELECTION_LABELS: Record<SelectionMode, string> = {
  body: "Whole part",
  face: "Face",
  edge: "Edge",
};

function visibleBodyColor(_obj: CadObject, selected: boolean, hovered: boolean) {
  if (selected) return VIEW_COLORS.selectedBody;
  if (hovered) return VIEW_COLORS.hoveredBody;
  return VIEW_COLORS.neutralBody;
}

function holeTargetsFromParams(params: Record<string, number>) {
  const holes: Array<{ x: number; y: number; radius: number }> = [];
  const customCount = Math.max(0, Math.floor(params.custom_hole_count ?? 0));
  for (let index = 0; index < customCount; index += 1) {
    const x = params[`custom_hole_${index}_x`];
    const y = params[`custom_hole_${index}_y`];
    const diameter = params[`custom_hole_${index}_diameter`] ?? params.hole_diameter ?? 5;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      holes.push({ x, y, radius: Math.max(0.25, diameter / 2) });
    }
  }
  const generatedCount = Math.max(0, Math.round(params.hole_count ?? 0) - holes.length);
  if (generatedCount > 0) {
    const width = Math.max(1, params.width ?? 80);
    const depth = Math.max(1, params.depth ?? 70);
    const diameter = Math.max(1, params.hole_diameter ?? 5);
    const spacing = width / (generatedCount + 1);
    for (let index = 0; index < generatedCount; index += 1) {
      holes.push({
        x: -width / 2 + spacing * (index + 1),
        y: depth * 0.15,
        radius: diameter / 2,
      });
    }
  }
  return holes;
}

function inferEdgeTarget(
  obj: CadObject,
  geometry: THREE.BufferGeometry,
  localPoint: THREE.Vector3,
  faceNormal?: THREE.Vector3 | null,
) {
  const params = obj.parameters || {};
  const horizontalX = localPoint.x;
  const horizontalY = localPoint.z;
  for (const hole of holeTargetsFromParams(params)) {
    const distance = Math.hypot(horizontalX - hole.x, horizontalY - hole.y);
    if (Math.abs(distance - hole.radius) <= Math.max(2.5, hole.radius * 0.35)) {
      return "edge:hole";
    }
  }

  // Use face normal to identify the clicked face precisely.
  // Three.js Y-up space: Y=up/down, X=left/right, Z=front/back.
  if (faceNormal) {
    const ax = Math.abs(faceNormal.x);
    const ay = Math.abs(faceNormal.y);
    const az = Math.abs(faceNormal.z);
    const THRESHOLD = 0.65;
    if (ay >= THRESHOLD && ay >= ax && ay >= az) {
      return faceNormal.y > 0 ? "edge:top" : "edge:bottom";
    }
    if (ax >= THRESHOLD && ax >= ay && ax >= az) {
      return faceNormal.x > 0 ? "edge:right" : "edge:left";
    }
    if (az >= THRESHOLD && az >= ax && az >= ay) {
      // Three.js Z+ = backend Y+ = CadQuery >Y (back face)
      return faceNormal.z > 0 ? "edge:back" : "edge:front";
    }
  }

  // Position-based fallback for angled faces or missing normals.
  const bounds = geometry.boundingBox;
  if (bounds) {
    const height = Math.max(1, bounds.max.y - bounds.min.y);
    const edgeBand = Math.max(2, height * 0.08);
    if (localPoint.y >= bounds.max.y - edgeBand) return "edge:top";
    if (localPoint.y <= bounds.min.y + edgeBand) return "edge:bottom";
  }
  return "edge:side";
}

function edgeTargetLabel(target: string) {
  if (target.includes("hole")) return "hole edge";
  if (target.includes("top")) return "top face edges";
  if (target.includes("bottom")) return "bottom face edges";
  if (target.includes("right")) return "right face edges";
  if (target.includes("left")) return "left face edges";
  if (target.includes("front")) return "front face edges";
  if (target.includes("back")) return "back face edges";
  if (target.includes("corner")) return "corner edges";
  if (target.includes("side")) return "side edges";
  return "selected edge";
}

type MeasurementSpec = {
  id: string;
  name: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  widthMm: number;
  depthMm: number;
  heightMm: number;
  longSideMm: number;
  shortSideMm: number;
  offset: number;
};

function formatMm(value: number) {
  if (!Number.isFinite(value)) return "0 mm";
  const rounded = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded.replace(/\.0$/, "")} mm`;
}

function meshBounds(obj: CadObject) {
  if (!obj.mesh?.positions.length) return null;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const source = obj.mesh.positions;
  for (let i = 0; i < source.length; i += 3) {
    const point = new THREE.Vector3(source[i], source[i + 2], source[i + 1]);
    min.min(point);
    max.max(point);
  }
  if (![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite)) return null;
  return { min, max };
}

// Single shared scale for the entire scene.  Computes the union AABB of every
// object (in three-space, after each object's own transform), then fits that
// whole bounding box into the printer volume.  Every object is then scaled by
// this same factor about the origin, so relative positions are preserved.
function computeSceneScale(objects: CadObject[], printerVolume: [number, number, number]): number {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let found = false;
  for (const obj of objects) {
    const b = meshBounds(obj);
    if (!b) continue;
    found = true;
    const t = obj.transform;
    // transform scale/position are stored backend-space; swap to three-space.
    const tsx = t?.scale?.[0] ?? 1;
    const tsy = t?.scale?.[2] ?? 1;
    const tsz = t?.scale?.[1] ?? 1;
    const tpx = t?.position?.[0] ?? 0;
    const tpy = t?.position?.[2] ?? 0;
    const tpz = t?.position?.[1] ?? 0;
    const xs = [b.min.x * tsx + tpx, b.max.x * tsx + tpx];
    const ys = [b.min.y * tsy + tpy, b.max.y * tsy + tpy];
    const zs = [b.min.z * tsz + tpz, b.max.z * tsz + tpz];
    minX = Math.min(minX, ...xs); maxX = Math.max(maxX, ...xs);
    minY = Math.min(minY, ...ys); maxY = Math.max(maxY, ...ys);
    minZ = Math.min(minZ, ...zs); maxZ = Math.max(maxZ, ...zs);
  }
  if (!found) return 1;
  const sx = maxX - minX;
  const sy = maxY - minY;
  const sz = maxZ - minZ;
  const [printerWidth, printerDepth, printerHeight] = printerVolume;
  return Math.min(
    printerWidth / (sx || 1),
    printerHeight / (sy || 1),
    printerDepth / (sz || 1),
    1,
  );
}

function makeMeasurementSpec(obj: CadObject, printerVolume: [number, number, number], sceneScale: number): MeasurementSpec | null {
  const bounds = meshBounds(obj);
  if (!bounds) return null;
  const scaleFactor = sceneScale > 0 ? sceneScale : 1;
  const t = obj.transform;
  const sx = t?.scale?.[0] ?? 1;
  const sy = t?.scale?.[1] ?? 1;
  const sz = t?.scale?.[2] ?? 1;
  const rawWidth = bounds.max.x - bounds.min.x;
  const rawHeight = bounds.max.y - bounds.min.y;
  const rawDepth = bounds.max.z - bounds.min.z;
  const widthMm = Math.abs(rawWidth * sx);
  const depthMm = Math.abs(rawDepth * sy);
  const heightMm = Math.abs(rawHeight * sz);
  const displayBaseScale = Math.max(scaleFactor * Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz), 1), 0.01);

  return {
    id: obj.id,
    name: obj.name,
    min: bounds.min,
    max: bounds.max,
    position: [
      (t?.position?.[0] ?? 0) * scaleFactor,
      (t?.position?.[2] ?? 0) * scaleFactor,
      (t?.position?.[1] ?? 0) * scaleFactor,
    ],
    rotation: [
      THREE.MathUtils.degToRad(t?.rotation?.[0] ?? 0),
      THREE.MathUtils.degToRad(t?.rotation?.[2] ?? 0),
      THREE.MathUtils.degToRad(t?.rotation?.[1] ?? 0),
    ],
    scale: [
      sx * scaleFactor,
      sz * scaleFactor,
      sy * scaleFactor,
    ],
    widthMm,
    depthMm,
    heightMm,
    longSideMm: Math.max(widthMm, depthMm),
    shortSideMm: Math.min(widthMm, depthMm),
    offset: Math.max(8 / displayBaseScale, Math.max(rawWidth, rawDepth, rawHeight) * 0.035),
  };
}

function DimensionLine({
  start,
  end,
  label,
  color = VIEW_COLORS.measure,
}: {
  start: [number, number, number];
  end: [number, number, number];
  label: string;
  color?: string;
}) {
  const midpoint: [number, number, number] = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];
  return (
    <group>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([...start, ...end]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.96} depthTest={false} />
      </line>
      {[start, end].map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[1.5, 10, 10]} />
          <meshBasicMaterial color={color} depthTest={false} />
        </mesh>
      ))}
      <Html position={midpoint} center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap rounded-lg border border-white/30 bg-[#111]/95 px-3.5 py-2 text-base font-semibold text-white shadow-2xl">
          {label}
        </div>
      </Html>
    </group>
  );
}

function MeasurementOverlay({ specs }: { specs: MeasurementSpec[] }) {
  return (
    <>
      {specs.map((spec) => {
        const { min, max, offset } = spec;
        const baseY = min.y - offset;
        const frontZ = min.z - offset;
        const sideX = max.x + offset;
        return (
          <group
            key={spec.id}
            position={spec.position}
            rotation={spec.rotation}
            scale={spec.scale}
          >
            <group position={[(min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2]}>
              <lineSegments renderOrder={18}>
                <edgesGeometry args={[new THREE.BoxGeometry(max.x - min.x, max.y - min.y, max.z - min.z)]} />
                <lineBasicMaterial color={VIEW_COLORS.measureAccent} transparent opacity={0.8} depthTest={false} />
              </lineSegments>
            </group>
            <DimensionLine
              start={[min.x, baseY, frontZ]}
              end={[max.x, baseY, frontZ]}
              label={`Width ${formatMm(spec.widthMm)}`}
              color={VIEW_COLORS.measureAccent}
            />
            <DimensionLine
              start={[sideX, baseY, min.z]}
              end={[sideX, baseY, max.z]}
              label={`Depth ${formatMm(spec.depthMm)}`}
            />
            <DimensionLine
              start={[sideX, min.y, frontZ]}
              end={[sideX, max.y, frontZ]}
              label={`Height ${formatMm(spec.heightMm)}`}
            />
            <Html position={[(min.x + max.x) / 2, max.y + offset, (min.z + max.z) / 2]} center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
              <div className="min-w-72 rounded-2xl border border-[#3b82f6]/60 bg-[#111]/96 px-5 py-4 text-base leading-7 text-white shadow-2xl">
                <div className="mb-1.5 max-w-80 truncate text-lg font-bold text-[#3b82f6]">{spec.name}</div>
                <div>Long side: <span className="font-semibold">{formatMm(spec.longSideMm)}</span></div>
                <div>Short side: <span className="font-semibold">{formatMm(spec.shortSideMm)}</span></div>
                <div>Height: <span className="font-semibold">{formatMm(spec.heightMm)}</span></div>
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
 
// ---------------------------------------------------------------------------
// Camera auto-fit helper
// ---------------------------------------------------------------------------
 
function CameraController({
  bounds,
  fitKey,
}: {
  bounds: { x: number; y: number; z: number };
  fitKey: string;
}) {
  const { camera, controls } = useThree();
  const lastFitKey = useRef<string>("");

  useEffect(() => {
    if (lastFitKey.current === fitKey) return;
    lastFitKey.current = fitKey;

    // Calculate appropriate distance to frame the entire model
    const size = Math.max(bounds.x, bounds.y, bounds.z, 50);
    const distance = Math.max(size * 2.5, 380);
    
    // Better camera positioning for isometric-like view
    camera.position.set(distance * 0.7, distance * 0.7, distance * 0.7);
    camera.near = 1;
    camera.far = 10000;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix?.();
    
    // Orbit around the model's actual centre so you can view from below
    const centreY = Math.max(bounds.z * 0.5, size * 0.25);
    // @ts-ignore
    controls?.target?.set(0, centreY, 0);
    // @ts-ignore
    controls?.update?.();
  }, [bounds, camera, controls, fitKey]);

  return null;
}

// ---------------------------------------------------------------------------
// Mesh renderer with client-side scaling fix
// ---------------------------------------------------------------------------
 
function ScaledMesh({
  obj,
  selected,
  active,
  suppressSelection,
  onSelect,
  transformMode,
  onTransformCommit,
  printerVolume,
  selectionMode,
  expertMode,
  expertTool,
  edgeOperation,
  onEdgeAmount,
  onTransformDrag,
  mobileMode,
  sceneScale,
}: {
  obj: CadObject;
  selected: boolean;
  active: boolean;
  suppressSelection: boolean;
  onSelect: () => void;
  transformMode: TransformMode;
  onTransformCommit: (
    objectId: string,
    transform: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    },
  ) => void;
  printerVolume: [number, number, number];
  selectionMode: SelectionMode;
  expertMode: boolean;
  expertTool: ExpertTool;
  edgeOperation: string;
  onEdgeAmount: (x: number, y: number, operation: string, objectId: string, target: string) => void;
  onTransformDrag: (dragging: boolean) => void;
  mobileMode: boolean;
  sceneScale: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const geometry = useMemo(() => {
    if (!obj.mesh) return null;
    const geo = new THREE.BufferGeometry();
    const source = obj.mesh.positions;
    const positions = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 3) {
      positions[i] = source[i];
      positions[i + 1] = source[i + 2];
      positions[i + 2] = source[i + 1];
    }
    const indices = new Uint32Array(obj.mesh.indices);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.normalizeNormals();
    return geo;
  }, [obj.mesh]);
 
  // Pre-build edge geometry once so it never rebuilds when selection state changes
  const edgesGeometry = useMemo(() => {
    if (!geometry) return null;
    return new THREE.EdgesGeometry(geometry, 15);
  }, [geometry]);

  // Use the single shared scene scale so every object (model + text labels +
  // bottom plates + assembly parts) is scaled by the SAME factor about the
  // origin.  This keeps their relative positions correct — scaling each object
  // independently makes attached text/plates drift off the model.
  const scaleFactor = sceneScale > 0 ? sceneScale : 1;

  if (!geometry) return null;
 
  const t = obj.transform;
  const sketchToolActive = expertMode && expertTool !== "select";
 
  const meshPosition: [number, number, number] = [
    (t?.position?.[0] ?? 0) * scaleFactor,
    (t?.position?.[2] ?? 0) * scaleFactor,
    (t?.position?.[1] ?? 0) * scaleFactor,
  ];
  const meshRotation: [number, number, number] = [
    THREE.MathUtils.degToRad(t?.rotation?.[0] ?? 0),
    THREE.MathUtils.degToRad(t?.rotation?.[2] ?? 0),
    THREE.MathUtils.degToRad(t?.rotation?.[1] ?? 0),
  ];
  const meshScale: [number, number, number] = [
    (t?.scale?.[0] ?? 1) * scaleFactor,
    (t?.scale?.[2] ?? 1) * scaleFactor,
    (t?.scale?.[1] ?? 1) * scaleFactor,
  ];

  return (
    <>
    <group
      ref={groupRef}
      position={meshPosition}
      rotation={meshRotation}
      scale={meshScale}
    >
    <mesh
      geometry={geometry}
      raycast={sketchToolActive ? () => null : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (sketchToolActive) return;
        if (suppressSelection) return;
        const pointerType = (e.nativeEvent as PointerEvent).pointerType;
        if (pointerType !== "touch") {
          e.stopPropagation();
        }
        pointerDownPos.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return;
        if (sketchToolActive) return;
        if (suppressSelection) return;
        const pointerType = (e.nativeEvent as PointerEvent).pointerType;
        if (pointerType !== "touch") {
          e.stopPropagation();
        }
        const down = pointerDownPos.current;
        pointerDownPos.current = null;
        if (!down) return;
        const dx = e.nativeEvent.clientX - down.x;
        const dy = e.nativeEvent.clientY - down.y;
        if (Math.hypot(dx, dy) > 6) return;
        onSelect();
        if (expertMode && selectionMode === "edge") {
          const localPoint = groupRef.current
            ? groupRef.current.worldToLocal(e.point.clone())
            : e.point.clone();
          onEdgeAmount(
            e.nativeEvent.clientX,
            e.nativeEvent.clientY,
            edgeOperation,
            obj.id,
            inferEdgeTarget(obj, geometry, localPoint, e.face?.normal ?? null),
          );
        }
      }}
      onPointerOver={(e) => {
        if ((e.nativeEvent as PointerEvent).pointerType !== "touch") setHovered(true);
      }}
      onPointerOut={(e) => {
        if ((e.nativeEvent as PointerEvent).pointerType !== "touch") setHovered(false);
      }}
    >
      <meshStandardMaterial
        color={visibleBodyColor(obj, selected, hovered)}
        roughness={selected ? 0.88 : 0.92}
        metalness={0}
        envMapIntensity={0}
        emissive={selected ? "#3a1800" : "#000000"}
        emissiveIntensity={selected ? 0.04 : 0}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </mesh>
    {edgesGeometry && (
      <lineSegments renderOrder={2} geometry={edgesGeometry}>
        <lineBasicMaterial
          color={selected ? VIEW_COLORS.edgeSelectedInk : hovered ? VIEW_COLORS.edgeHover : VIEW_COLORS.edgeSubtle}
          transparent
          opacity={selected ? 0.75 : hovered ? 0.6 : 0.38}
          depthTest
        />
      </lineSegments>
    )}
    {selected && edgesGeometry && (
      <lineSegments renderOrder={3} geometry={edgesGeometry}>
        <lineBasicMaterial
          color={VIEW_COLORS.edgeSelected}
          transparent
          opacity={0.9}
          depthTest
        />
      </lineSegments>
    )}
    </group>
    {active && transformMode !== "off" && groupRef.current && (
      <TransformControls
        object={groupRef.current}
        mode={transformMode}
        size={mobileMode ? 1.2 : 0.85}
        translationSnap={2}
        rotationSnap={THREE.MathUtils.degToRad(5)}
        scaleSnap={0.05}
        onMouseDown={() => onTransformDrag(true)}
        onMouseUp={() => {
          const group = groupRef.current;
          onTransformDrag(false);
          if (!group) return;
          onTransformCommit(obj.id, {
            position: [
              group.position.x / scaleFactor,
              group.position.z / scaleFactor,
              group.position.y / scaleFactor,
            ],
            rotation: [
              THREE.MathUtils.radToDeg(group.rotation.x),
              THREE.MathUtils.radToDeg(group.rotation.z),
              THREE.MathUtils.radToDeg(group.rotation.y),
            ],
            scale: [
              group.scale.x / scaleFactor,
              group.scale.z / scaleFactor,
              group.scale.y / scaleFactor,
            ],
          });
        }}
      />
    )}
    </>
  );
}
 
// ---------------------------------------------------------------------------
// Build plate
// ---------------------------------------------------------------------------
 
function BuildPlate({ volume }: { volume: [number, number, number] }) {
  const [px, py] = volume;
  return (
    <group>
      {/* Flat plane — FrontSide only, so it vanishes when camera is below */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[px, py]} />
        <meshBasicMaterial color={VIEW_COLORS.plate} side={THREE.FrontSide} />
      </mesh>
      {/* Border frame */}
      <lineSegments position={[0, 0, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(px, 0.01, py)]} />
        <lineBasicMaterial color={VIEW_COLORS.plateEdge} />
      </lineSegments>
      {/* Corner dots */}
      {([ [-px/2, 0, -py/2], [px/2, 0, -py/2], [-px/2, 0, py/2], [px/2, 0, py/2] ] as [number,number,number][]).map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[2.5, 8, 8]} />
          <meshBasicMaterial color={VIEW_COLORS.plateEdge} />
        </mesh>
      ))}
    </group>
  );
}

function snapSketchPoint(start: THREE.Vector3, point: THREE.Vector3, tool: ExpertTool): THREE.Vector3 {
  const snapped = point.clone();
  snapped.x = Math.round(snapped.x / SKETCH_GRID_STEP_MM) * SKETCH_GRID_STEP_MM;
  snapped.z = Math.round(snapped.z / SKETCH_GRID_STEP_MM) * SKETCH_GRID_STEP_MM;
  if (tool !== "line" && tool !== "cut") return snapped;

  const dx = snapped.x - start.x;
  const dz = snapped.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return snapped;

  const snapStep = Math.PI / 4.0;
  const angle = Math.atan2(dz, dx);
  const snappedAngle = Math.round(angle / snapStep) * snapStep;
  const delta = Math.abs(Math.atan2(Math.sin(angle - snappedAngle), Math.cos(angle - snappedAngle)));
  if (delta <= THREE.MathUtils.degToRad(8)) {
    snapped.x = start.x + Math.cos(snappedAngle) * length;
    snapped.z = start.z + Math.sin(snappedAngle) * length;
  }
  return snapped;
}
 
// ---------------------------------------------------------------------------
// Main props
// ---------------------------------------------------------------------------
 
interface CadViewportProps {
  objects: CadObject[];
  selectedObjectId: string;
  selectedObjectIds?: string[];
  onSelectObject: (id: string) => void;
  transformMode: TransformMode;
  onTransformCommit: (
    objectId: string,
    transform: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    },
  ) => void;
  printerVolume?: [number, number, number];
  bounds?: { x: number; y: number; z: number };
  expertMode?: boolean;
  expertTool?: ExpertTool;
  selectionMode?: SelectionMode;
  sketchHeight?: number;
  operationAmount?: number;
  onCreatePrimitive?: (payload: {
    primitive: ExpertTool;
    center: [number, number];
    size: [number, number];
    radius?: number;
  }) => void;
  onSetExpertMode?: (enabled: boolean) => void;
  onSetExpertTool?: (tool: ExpertTool) => void;
  onSetSelectionMode?: (mode: SelectionMode) => void;
  onSetSketchHeight?: (height: number) => void;
  onSetOperationAmount?: (amount: number) => void;
  onApplyExpertOperation?: (
    operation: string,
    amountOverride?: number,
    objectIdOverride?: string,
    targetOverride?: string,
  ) => void;
  mobileMode?: boolean;
  showMeasurements?: boolean;
}

function SketchPlane({
  active,
  tool,
  printerVolume,
  onCreatePrimitive,
}: {
  active: boolean;
  tool: ExpertTool;
  printerVolume: [number, number, number];
  onCreatePrimitive?: (payload: {
    primitive: ExpertTool;
    center: [number, number];
    size: [number, number];
    radius?: number;
  }) => void;
}) {
  const [start, setStart] = useState<THREE.Vector3 | null>(null);
  const [end, setEnd] = useState<THREE.Vector3 | null>(null);
  const enabled = active && tool !== "select";
  const [px, py] = printerVolume;

  const preview = useMemo(() => {
    if (!start || !end || !enabled) return null;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minZ = Math.min(start.z, end.z);
    const maxZ = Math.max(start.z, end.z);
    const width = Math.max(0.1, maxX - minX);
    const depth = Math.max(0.1, maxZ - minZ);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    return { width, depth, cx, cz, radius: Math.max(width, depth) / 2 };
  }, [start, end, enabled]);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.04, 0]}
        visible={false}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (!enabled) return;
          e.stopPropagation();
          setStart(e.point.clone());
          setEnd(e.point.clone());
        }}
        onPointerMove={(e) => {
          if (!enabled || !start) return;
          e.stopPropagation();
          setEnd(snapSketchPoint(start, e.point, tool));
        }}
        onPointerUp={(e) => {
          if (e.button !== 0) return;
          if (!enabled || !start) return;
          e.stopPropagation();
          const finish = snapSketchPoint(start, e.point, tool);
          const minX = Math.min(start.x, finish.x);
          const maxX = Math.max(start.x, finish.x);
          const minZ = Math.min(start.z, finish.z);
          const maxZ = Math.max(start.z, finish.z);
          const width = (tool === "line" || tool === "cut") ? finish.x - start.x : maxX - minX;
          const depth = (tool === "line" || tool === "cut") ? finish.z - start.z : maxZ - minZ;
          if (Math.max(Math.abs(width), Math.abs(depth)) >= 2) {
            const center: [number, number] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
            const size: [number, number] = tool === "line" ? [width, depth] : [Math.abs(width), Math.abs(depth)];
            const radius = Math.max(size[0], size[1]) / 2;
            onCreatePrimitive?.({
              primitive: tool,
              center,
              size,
              radius: tool === "circle" || tool === "hole" ? radius : undefined,
            });
          }
          setStart(null);
          setEnd(null);
        }}
      >
        <planeGeometry args={[px * 2.2, py * 2.2]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      {preview && tool === "rectangle" && (
        <mesh position={[preview.cx, 0.35, preview.cz]}>
          <boxGeometry args={[preview.width, 0.8, preview.depth]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.35} />
        </mesh>
      )}
      {start && end && enabled && tool === "line" && (
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([start.x, 0.55, start.z, end.x, 0.55, end.z]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#7de7ff" />
        </line>
      )}
      {start && end && enabled && tool === "cut" && (() => {
        const ddx = end.x - start.x;
        const ddz = end.z - start.z;
        const len = Math.max(Math.hypot(ddx, ddz), 0.1);
        const midX = (start.x + end.x) / 2;
        const midZ = (start.z + end.z) / 2;
        const angle = -Math.atan2(ddz, ddx);
        return (
          <mesh position={[midX, 100, midZ]} rotation={[0, angle, 0]}>
            <boxGeometry args={[len, 200, 0.8]} />
            <meshBasicMaterial color="#ff6b6b" transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>
        );
      })()}
      {preview && (tool === "circle" || tool === "hole") && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[preview.cx, 0.35, preview.cz]}>
          <circleGeometry args={[preview.radius, 48]} />
          <meshBasicMaterial
            color={tool === "hole" ? "#fb7185" : "#7dd3fc"}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
 
export default function CadViewport({
  objects,
  selectedObjectId,
  selectedObjectIds = [],
  onSelectObject,
  transformMode,
  onTransformCommit,
  printerVolume = [220, 220, 250],
  bounds = { x: 100, y: 100, z: 100 },
  expertMode = false,
  expertTool = "select",
  selectionMode = "body",
  sketchHeight = 8,
  operationAmount = 2,
  onCreatePrimitive,
  onSetExpertMode,
  onSetExpertTool,
  onSetSelectionMode,
  onSetSketchHeight,
  onSetOperationAmount,
  onApplyExpertOperation,
  mobileMode = false,
  showMeasurements = false,
}: CadViewportProps) {
  const [edgeOperation, setEdgeOperation] = useState("chamfer");
  const [edgeInput, setEdgeInput] = useState<{
    x: number;
    y: number;
    operation: string;
    objectId: string;
    target: string;
    value: string;
  } | null>(null);
  const [transformDragging, setTransformDragging] = useState(false);
  
  const sceneScale = useMemo(() => computeSceneScale(objects, printerVolume), [objects, printerVolume]);

  const measurementSpecs = useMemo(() => {
    if (!showMeasurements) return [];
    const selectedIds = new Set(selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : []);
    const targets = selectedIds.size ? objects.filter((obj) => selectedIds.has(obj.id)) : objects;
    return targets
      .map((obj) => makeMeasurementSpec(obj, printerVolume, sceneScale))
      .filter((spec): spec is MeasurementSpec => Boolean(spec));
  }, [objects, printerVolume, selectedObjectId, selectedObjectIds, showMeasurements, sceneScale]);

  return (
    <div
      className="relative h-full w-full select-none bg-cadio-bg"
      style={{ touchAction: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={`${expertMode ? "hidden md:flex" : "hidden"} absolute left-6 top-[72px] z-10 w-64 flex-col gap-2 rounded-2xl border border-cadio-border/50 bg-cadio-surface/90 p-3 shadow-2xl backdrop-blur-xl transition-all`}>
        <div className="flex items-center justify-between px-2 py-1 mb-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-cadio-muted">
            Edit tools
          </div>
          <button
            type="button"
            title="Close edit tools"
            onClick={() => {
              onSetExpertTool?.("select");
              onSetExpertMode?.(false);
            }}
            className="p-1 rounded-md hover:bg-cadio-border/50 text-cadio-muted hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1">
          {(["select", "rectangle", "circle", "hole", "line", "cut"] as ExpertTool[]).map((tool) => (
            <button
              key={tool}
              disabled={!expertMode}
              title={TOOL_LABELS[tool].hint}
              onClick={() => onSetExpertTool?.(tool)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                expertMode && expertTool === tool
                  ? "bg-cadio-accent text-white shadow-lg shadow-cadio-accent/20"
                  : "text-cadio-muted hover:bg-cadio-border/30 hover:text-white disabled:opacity-30"
              }`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={TOOL_LABELS[tool].icon} /></svg>
              <span>{TOOL_LABELS[tool].label}</span>
            </button>
          ))}
        </div>
        <div className="h-px bg-cadio-border/30 my-1 mx-2" />
        <p className="px-2 pt-1 text-[9px] font-bold uppercase tracking-widest text-cadio-muted/70">Select by</p>
        <div className="grid grid-cols-3 gap-1 px-1">
          {(["body", "face", "edge"] as SelectionMode[]).map((mode) => (
            <button
              key={mode}
              disabled={!expertMode}
              onClick={() => onSetSelectionMode?.(mode)}
              className={`py-2 rounded-md text-[10px] font-bold transition-all ${
                expertMode && selectionMode === mode
                  ? "bg-cadio-accent/10 border border-cadio-accent text-cadio-accent"
                  : "border border-transparent text-cadio-muted hover:text-white"
              }`}
            >
              {SELECTION_LABELS[mode]}
            </button>
          ))}
        </div>
        <div className="my-1 h-px bg-cadio-border/30 mx-2" />
        <div className="space-y-3 px-1 pb-1">
          <p className="px-1 text-[9px] font-bold uppercase tracking-widest text-cadio-muted/70">Shape edits</p>
          <label className="flex items-center justify-between gap-2 text-[10px] font-semibold text-cadio-muted">
            <span>New shape height (mm)</span>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={sketchHeight}
              onChange={(e) => onSetSketchHeight?.(Number(e.target.value))}
              className="w-16 rounded border border-cadio-border bg-cadio-bg/50 px-2 py-1 text-white outline-none focus:border-cadio-accent"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-[10px] font-semibold text-cadio-muted">
            <span>Amount (mm)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={operationAmount}
              onChange={(e) => onSetOperationAmount?.(Number(e.target.value))}
              className="w-16 rounded border border-cadio-border bg-cadio-bg/50 px-2 py-1 text-white outline-none focus:border-cadio-accent"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {["extrude", "fillet", "chamfer", "shell"].map((op) => (
              <button
                key={op}
                disabled={!expertMode}
                title={OP_LABELS[op]?.hint}
                onClick={() => {
                  if (selectionMode === "edge" && (op === "fillet" || op === "chamfer")) {
                    setEdgeOperation(op);
                    return;
                  }
                  onApplyExpertOperation?.(op);
                }}
                className={`rounded-lg py-2 text-[10px] font-bold tracking-wide transition-all disabled:opacity-30 ${
                  edgeOperation === op ? "bg-cadio-surface border border-cadio-border text-white shadow-sm" : "text-cadio-muted hover:text-white"
                }`}
              >
                {OP_LABELS[op]?.label ?? op}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [500, 380, 500], fov: 45, near: 1, far: 5000 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl, scene }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1.2;
          scene.background = new THREE.Color(VIEW_COLORS.background);
        }}
        onPointerUp={() => setTransformDragging(false)}
      >
      {/* Key light — top-right-front, main shading source */}
      <directionalLight position={[300, 500, 300]} intensity={2.2} color="#f5f8ff" />
      {/* Fill — soft left, reduces harsh shadows */}
      <directionalLight position={[-350, 250, -150]} intensity={1.0} color="#c8dff0" />
      {/* Rim — back edge separation */}
      <directionalLight position={[0, 150, -500]} intensity={0.45} color="#ffffff" />
      {/* Bottom fill — prevents underside faces from going black */}
      <directionalLight position={[0, -300, 0]} intensity={0.6} color="#8ab4cc" />
      {/* Ambient hemisphere — warmer ground so floor-facing faces stay visible */}
      <hemisphereLight intensity={0.35} color="#dde8f0" groundColor="#3a4a5a" />
 
      <Grid
        args={[printerVolume[0] * 3, printerVolume[1] * 3]}
        cellSize={SKETCH_GRID_STEP_MM}
        cellThickness={1}
        cellColor={VIEW_COLORS.gridCell}
        sectionSize={50}
        sectionThickness={1.5}
        sectionColor={VIEW_COLORS.gridSection}
        fadeDistance={800}
        fadeStrength={1.5}
        infiniteGrid={false}
        position={[0, 0.05, 0]}
      />
 
      <BuildPlate volume={printerVolume} />
      <SketchPlane
        active={expertMode}
        tool={expertTool}
        printerVolume={printerVolume}
        onCreatePrimitive={onCreatePrimitive}
      />
 
      {/* Scaled objects */}
      {objects.map((obj) => (
        <ScaledMesh
          key={obj.id}
          obj={obj}
          selected={obj.id === selectedObjectId || selectedObjectIds.includes(obj.id)}
          active={obj.id === selectedObjectId}
          suppressSelection={transformDragging}
          onSelect={() => onSelectObject(obj.id)}
          transformMode={transformMode}
          onTransformCommit={onTransformCommit}
          printerVolume={printerVolume}
          selectionMode={selectionMode}
          expertMode={expertMode}
          expertTool={expertTool}
          edgeOperation={edgeOperation}
          onEdgeAmount={(x, y, operation, objectId, target) => {
            setEdgeInput({ x, y, operation, objectId, target, value: String(operationAmount || 3) });
          }}
          onTransformDrag={setTransformDragging}
          mobileMode={mobileMode}
          sceneScale={sceneScale}
        />
      ))}
      {showMeasurements && <MeasurementOverlay specs={measurementSpecs} />}
 
      {/* Camera auto-fit */}
      <CameraController bounds={bounds} fitKey={objects.length ? objects.map((o) => o.id).join("|") : "empty"} />
 
      {/* Orbit controls — RMB orbits (free camera), middle button pans, wheel zooms.
          LMB is reserved for selection / sketching, so it is intentionally left
          unbound here. */}
      <OrbitControls
        makeDefault
        enableDamping
        enablePan
        enableRotate
        enableZoom
        enabled={!transformDragging}
        dampingFactor={0.07}
        minDistance={20}
        maxDistance={2000}
        minPolarAngle={0}
        maxPolarAngle={Math.PI}
        mouseButtons={{
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />
 
      {/* Orientation gizmo */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={["#ff6b6b", "#4ecdc4", "#74b9ff"]}
          labelColor="white"
        />
      </GizmoHelper>
      </Canvas>
      {showMeasurements && (
        <div className="pointer-events-none absolute bottom-6 left-6 z-10 max-w-[min(560px,calc(100%-2rem))] rounded-2xl border border-[#3b82f6]/50 bg-[#0b0f14]/94 px-6 py-5 text-base text-white shadow-2xl backdrop-blur">
          <div className="text-xl font-bold text-[#3b82f6]">Real Measurements</div>
          {measurementSpecs.length ? (
            <div className="mt-3 flex flex-col gap-2">
              {measurementSpecs.map((spec) => (
                <div key={spec.id} className="flex flex-col gap-0.5">
                  <div className="max-w-[28rem] truncate text-sm font-semibold text-white/90">{spec.name}</div>
                  <div className="text-sm text-cadio-muted">
                    <span className="font-semibold text-white">{formatMm(spec.widthMm)}</span>
                    {" × "}
                    <span className="font-semibold text-white">{formatMm(spec.depthMm)}</span>
                    {" × "}
                    <span className="font-semibold text-white">{formatMm(spec.heightMm)}</span>
                    <span className="ml-1 text-cadio-muted/70">(W × D × H)</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-cadio-muted">Create or select a model to measure.</div>
          )}
        </div>
      )}
      {edgeInput && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const amount = Number(edgeInput.value.replace("mm", "").trim());
            if (Number.isFinite(amount) && amount >= 0) {
              onSetOperationAmount?.(amount);
              onApplyExpertOperation?.(edgeInput.operation, amount, edgeInput.objectId, edgeInput.target);
            }
            setEdgeInput(null);
          }}
          className="absolute z-20 flex items-center gap-1 rounded-md border border-cadio-border bg-cadio-surface p-1 shadow-xl"
          style={{ left: edgeInput.x + 10, top: edgeInput.y + 10 }}
        >
          <span className="px-1 text-[11px] capitalize text-cadio-muted">
            {edgeInput.operation} {edgeTargetLabel(edgeInput.target)}
          </span>
          <input
            autoFocus
            value={edgeInput.value}
            onChange={(e) => setEdgeInput({ ...edgeInput, value: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") setEdgeInput(null);
            }}
            className="w-16 rounded border border-cadio-border bg-cadio-bg px-2 py-1 text-xs text-white outline-none focus:border-cadio-accent"
          />
        </form>
      )}
    </div>
  );
}
