/** Main 3D viewport - fixed scaling, camera auto-fit, better lighting. */
 
import { useEffect, useRef, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, GizmoHelper, GizmoViewport, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { CadObject, ExpertTool, SelectionMode, TransformMode } from "../utils/types";

const VIEW_COLORS = {
  background: "#343435",
  plate: "#5a5a5c",
  plateEdge: "#74777b",
  gridCell: "#505154",
  gridSection: "#686b70",
  neutralBody: "#b9b8b3",
  selectedBody: "#28c7df",
  hoveredBody: "#cfd1d2",
  edgeSubtle: "#202124",
  edgeStrong: "#e7faff",
  edgeSelected: "#9eefff",
  edgeHover: "#38d5f4",
};

function visibleBodyColor(obj: CadObject, selected: boolean, hovered: boolean) {
  if (selected) return VIEW_COLORS.selectedBody;
  if (hovered) return obj.color && obj.color !== "#a9aaad" ? obj.color : VIEW_COLORS.hoveredBody;
  return obj.color && obj.color !== "#a9aaad" ? obj.color : VIEW_COLORS.neutralBody;
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
    const distance = Math.max(size * 2.5, 200);
    
    // Better camera positioning for isometric-like view
    camera.position.set(distance * 0.7, distance * 0.7, distance * 0.7);
    camera.near = 0.1;
    camera.far = distance * 30;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix?.();
    
    // Center on the build plate
    // @ts-ignore
    controls?.target?.set(0, size * 0.15, 0);
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
  edgeOperation,
  onEdgeAmount,
  onTransformDrag,
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
  edgeOperation: string;
  onEdgeAmount: (x: number, y: number, operation: string, objectId: string) => void;
  onTransformDrag: (dragging: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
 
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
 
  // Compute scale factor so model fits printer volume
  const scaleFactor = useMemo(() => {
    if (!geometry?.boundingBox) return 1;
    const bb = geometry.boundingBox;
    const sx = bb.max.x - bb.min.x;
    const sy = bb.max.y - bb.min.y;
    const sz = bb.max.z - bb.min.z;
    const [printerWidth, printerDepth, printerHeight] = printerVolume;
    const ratio = Math.min(
      printerWidth / (sx || 1),
      printerHeight / (sy || 1),
      printerDepth / (sz || 1),
      1,
    );
    return ratio;
  }, [geometry, printerVolume]);
 
  if (!geometry) return null;
 
  const t = obj.transform;
 
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
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (suppressSelection) return;
        e.stopPropagation();
        onSelect();
        if (expertMode && selectionMode === "edge") {
          onEdgeAmount(e.nativeEvent.clientX, e.nativeEvent.clientY, edgeOperation, obj.id);
        }
      }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      castShadow
      receiveShadow={false}
    >
      <meshPhysicalMaterial
        color={visibleBodyColor(obj, selected, hovered)}
        roughness={0.74}
        metalness={0.02}
        clearcoat={0.04}
        clearcoatRoughness={0.82}
        emissive={selected ? "#073e48" : hovered ? "#111314" : "#000000"}
        emissiveIntensity={selected ? 0.1 : hovered ? 0.04 : 0}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </mesh>
    <lineSegments>
      <edgesGeometry args={[geometry, 24]} />
      <lineBasicMaterial
        color={selected ? VIEW_COLORS.edgeSelected : hovered ? VIEW_COLORS.edgeHover : VIEW_COLORS.edgeSubtle}
        transparent
        opacity={selected ? 0.86 : hovered ? 0.72 : 0.28}
      />
    </lineSegments>
    {((selected && selectionMode !== "body") || (hovered && expertMode && selectionMode === "edge")) && (
      <lineSegments>
        <edgesGeometry args={[geometry, 8]} />
        <lineBasicMaterial
          color={selectionMode === "edge" ? VIEW_COLORS.edgeStrong : selectionMode === "face" ? "#b9a7ff" : VIEW_COLORS.edgeSelected}
          transparent
          opacity={hovered && !selected ? 1 : 0.9}
        />
      </lineSegments>
    )}
    </group>
    {active && transformMode !== "off" && groupRef.current && (
      <TransformControls
        object={groupRef.current}
        mode={transformMode}
        size={0.85}
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
      {/* Base plate - visible and textured */}
      <mesh position={[0, -0.55, 0]} receiveShadow>
        <boxGeometry args={[px, 0.04, py]} />
        <meshStandardMaterial 
          color={VIEW_COLORS.plate}
          roughness={0.82}
          metalness={0.02}
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Corner markers for orientation */}
      {[
        [-px / 2, 0, -py / 2],
        [px / 2, 0, -py / 2],
        [-px / 2, 0, py / 2],
        [px / 2, 0, py / 2],
      ].map((pos, i) => (
        <mesh key={i} position={[pos[0], pos[1], pos[2]]}>
          <sphereGeometry args={[2, 8, 8]} />
          <meshStandardMaterial color="#d6d8db" emissive="#22252a" />
        </mesh>
      ))}
      {/* Border frame - enhanced visibility */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(px, 0.5, py)]} />
        <lineBasicMaterial color={VIEW_COLORS.plateEdge} linewidth={2} />
      </lineSegments>
    </group>
  );
}

function snapSketchPoint(start: THREE.Vector3, point: THREE.Vector3, tool: ExpertTool): THREE.Vector3 {
  const snapped = point.clone();
  snapped.x = Math.round(snapped.x);
  snapped.z = Math.round(snapped.z);
  if (tool !== "line") return snapped;

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
  onApplyExpertOperation?: (operation: string, amountOverride?: number, objectIdOverride?: string) => void;
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
          const width = tool === "line" ? finish.x - start.x : maxX - minX;
          const depth = tool === "line" ? finish.z - start.z : maxZ - minZ;
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
}: CadViewportProps) {
  const [edgeOperation, setEdgeOperation] = useState("chamfer");
  const [edgeInput, setEdgeInput] = useState<{
    x: number;
    y: number;
    operation: string;
    objectId: string;
    value: string;
  } | null>(null);
  const [transformDragging, setTransformDragging] = useState(false);

  return (
    <div className="relative w-full h-full touch-none select-none bg-[#343435]" onContextMenu={(e) => e.preventDefault()}>
      <div className={`${expertMode ? "hidden md:flex" : "hidden"} absolute left-3 top-14 z-10 w-44 flex-col gap-1.5 rounded-lg border border-[#454548] bg-[#242424]/92 p-2 shadow-xl backdrop-blur`}>
        <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cadio-muted">
          Expert tools
        </div>
        {(["select", "rectangle", "circle", "line", "hole"] as ExpertTool[]).map((tool) => (
          <button
            key={tool}
            disabled={!expertMode}
            onClick={() => onSetExpertTool?.(tool)}
            className={`px-3 py-2 rounded-md text-left text-xs capitalize transition-colors ${
              expertMode && expertTool === tool
                ? "bg-[#55565b] text-white font-semibold"
                : "bg-transparent text-cadio-muted hover:bg-[#38383b] hover:text-cadio-text disabled:opacity-40"
            }`}
          >
            {tool}
          </button>
        ))}
        <div className="my-1 h-px bg-cadio-border" />
        {(["body", "face", "edge"] as SelectionMode[]).map((mode) => (
          <button
            key={mode}
            disabled={!expertMode}
            onClick={() => onSetSelectionMode?.(mode)}
            className={`px-3 py-2 rounded-md text-left text-xs capitalize transition-colors ${
              expertMode && selectionMode === mode
                ? "bg-cadio-accent text-[#111] font-semibold"
                : "bg-transparent text-cadio-muted hover:bg-[#38383b] hover:text-cadio-text disabled:opacity-40"
            }`}
          >
            {mode}
          </button>
        ))}
        <div className="my-1 h-px bg-cadio-border" />
        <label className="flex items-center justify-between gap-2 px-1 text-xs text-cadio-muted">
          H
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={sketchHeight}
            onChange={(e) => onSetSketchHeight?.(Number(e.target.value))}
            className="w-20 rounded border border-cadio-border bg-[#202023] px-2 py-1 text-cadio-text"
          />
        </label>
        <label className="flex items-center justify-between gap-2 px-1 text-xs text-cadio-muted">
          A
          <input
            type="number"
            min={0}
            step={0.5}
            value={operationAmount}
            onChange={(e) => onSetOperationAmount?.(Number(e.target.value))}
            className="w-20 rounded border border-cadio-border bg-[#202023] px-2 py-1 text-cadio-text"
          />
        </label>
        {["extrude", "fillet", "chamfer", "shell"].map((op) => (
          <button
            key={op}
            disabled={!expertMode}
            onClick={() => {
              if (selectionMode === "edge" && (op === "fillet" || op === "chamfer")) {
                setEdgeOperation(op);
                return;
              }
              onApplyExpertOperation?.(op);
            }}
            className={`rounded-md px-3 py-2 text-left text-xs capitalize disabled:opacity-40 ${
              edgeOperation === op ? "bg-[#55565b] text-white" : "bg-transparent text-cadio-muted hover:bg-[#38383b] hover:text-cadio-text"
            }`}
          >
            {op}
          </button>
        ))}
      </div>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [300, 220, 300], fov: 42, near: 0.1, far: 10000 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1.08;
        }}
        onPointerUp={() => setTransformDragging(false)}
      >
      <color attach="background" args={[VIEW_COLORS.background]} />
 
      {/* Lighting - enhanced for clarity */}
      <hemisphereLight intensity={0.95} color="#ffffff" groundColor="#56585c" />
      <ambientLight intensity={0.62} color="#ffffff" />
      <directionalLight
        position={[220, 280, 180]}
        intensity={2.15}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={2000}
        shadow-camera-left={-400}
        shadow-camera-right={400}
        shadow-camera-top={400}
        shadow-camera-bottom={-400}
        shadow-bias={-0.00008}
        shadow-normalBias={0.025}
      />
      <directionalLight position={[-220, 180, -180]} intensity={0.9} color="#e8f2ff" />
      <directionalLight position={[40, -100, 160]} intensity={0.55} color="#ffffff" />
      <pointLight position={[0, 260, 0]} intensity={0.28} color="#ffffff" />
 
      {/* Grid - improved visibility */}
      <Grid
        args={[printerVolume[0] * 2.2, printerVolume[1] * 2.2]}
        cellSize={10}
        cellThickness={0.2}
        cellColor={VIEW_COLORS.gridCell}
        sectionSize={50}
        sectionThickness={0.5}
        sectionColor={VIEW_COLORS.gridSection}
        fadeDistance={1000}
        fadeStrength={2.35}
        position={[0, -0.78, 0]}
      />
 
      {/* Build plate */}
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
          edgeOperation={edgeOperation}
          onEdgeAmount={(x, y, operation, objectId) => {
            setEdgeInput({ x, y, operation, objectId, value: String(operationAmount || 3) });
          }}
          onTransformDrag={setTransformDragging}
        />
      ))}
 
      {/* Camera auto-fit */}
      <CameraController bounds={bounds} fitKey={objects.length ? objects.map((o) => o.id).join("|") : "empty"} />
 
      {/* Orbit controls */}
      <OrbitControls
        makeDefault
        enableDamping
        enablePan
        dampingFactor={0.07}
        minDistance={20}
        maxDistance={2000}
        minPolarAngle={0}
        maxPolarAngle={Math.PI}
        mouseButtons={{
          LEFT: undefined,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.ROTATE,
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
      {edgeInput && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const amount = Number(edgeInput.value.replace("mm", "").trim());
            if (Number.isFinite(amount) && amount >= 0) {
              onSetOperationAmount?.(amount);
              onApplyExpertOperation?.(edgeInput.operation, amount, edgeInput.objectId);
            }
            setEdgeInput(null);
          }}
          className="absolute z-20 flex items-center gap-1 rounded-md border border-cadio-border bg-[#2b2b2e] p-1 shadow-xl"
          style={{ left: edgeInput.x + 10, top: edgeInput.y + 10 }}
        >
          <span className="px-1 text-[11px] capitalize text-cadio-muted">{edgeInput.operation}</span>
          <input
            autoFocus
            value={edgeInput.value}
            onChange={(e) => setEdgeInput({ ...edgeInput, value: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") setEdgeInput(null);
            }}
            className="w-16 rounded border border-cadio-border bg-[#202023] px-2 py-1 text-xs text-cadio-text outline-none"
          />
        </form>
      )}
    </div>
  );
}
