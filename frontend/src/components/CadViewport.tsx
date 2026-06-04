/** Main 3D viewport - fixed scaling, camera auto-fit, better lighting. */
 
import { useEffect, useRef, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, GizmoHelper, GizmoViewport, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { CadObject, ExpertTool, SelectionMode, TransformMode } from "../utils/types";
 
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
  onSelect,
  transformMode,
  onTransformCommit,
  printerVolume,
  selectionMode,
  expertMode,
  edgeOperation,
  onEdgeAmount,
}: {
  obj: CadObject;
  selected: boolean;
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
  onEdgeAmount: (x: number, y: number, operation: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
 
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
        e.stopPropagation();
        onSelect();
        if (expertMode && selectionMode === "edge") {
          onEdgeAmount(e.nativeEvent.clientX, e.nativeEvent.clientY, edgeOperation);
        }
      }}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={selected ? "#28c4ea" : obj.color || "#aeb0b3"}
        roughness={0.4}
        metalness={0.3}
        emissive={selected ? "#0b6c84" : "#000000"}
        emissiveIntensity={selected ? 0.22 : 0}
      />
    </mesh>
    {selected && (
      <lineSegments>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial
          color={selectionMode === "edge" ? "#facc15" : selectionMode === "face" ? "#a78bfa" : "#7dd3fc"}
          transparent
          opacity={selectionMode === "body" ? 0.45 : 0.95}
        />
      </lineSegments>
    )}
    </group>
    {selected && transformMode !== "off" && groupRef.current && (
      <TransformControls
        object={groupRef.current}
        mode={transformMode}
        size={0.85}
        translationSnap={2}
        rotationSnap={THREE.MathUtils.degToRad(5)}
        scaleSnap={0.05}
        onMouseUp={() => {
          const group = groupRef.current;
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
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[px, 0.12, py]} />
        <meshStandardMaterial 
          color="#252528" 
          roughness={0.95}
          metalness={0.05}
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
          <meshStandardMaterial color="#4fc3f7" emissive="#2a7f99" />
        </mesh>
      ))}
      {/* Border frame - enhanced visibility */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(px, 0.5, py)]} />
        <lineBasicMaterial color="#4a4b50" linewidth={2} />
      </lineSegments>
    </group>
  );
}
 
// ---------------------------------------------------------------------------
// Main props
// ---------------------------------------------------------------------------
 
interface CadViewportProps {
  objects: CadObject[];
  selectedObjectId: string;
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
  onApplyExpertOperation?: (operation: string, amountOverride?: number) => void;
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
          setEnd(e.point.clone());
        }}
        onPointerUp={(e) => {
          if (e.button !== 0) return;
          if (!enabled || !start) return;
          e.stopPropagation();
          const finish = e.point.clone();
          const minX = Math.min(start.x, finish.x);
          const maxX = Math.max(start.x, finish.x);
          const minZ = Math.min(start.z, finish.z);
          const maxZ = Math.max(start.z, finish.z);
          const width = maxX - minX;
          const depth = maxZ - minZ;
          if (Math.max(Math.abs(width), Math.abs(depth)) >= 2) {
            const center: [number, number] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
            const size: [number, number] = [Math.abs(width), Math.abs(depth)];
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
    value: string;
  } | null>(null);

  return (
    <div className="relative w-full h-full bg-cadio-bg" onContextMenu={(e) => e.preventDefault()}>
      <div className="hidden md:flex absolute left-3 top-4 z-10 w-44 flex-col gap-1.5 rounded-lg border border-cadio-border bg-[#2b2b2e]/92 p-2 shadow-xl backdrop-blur">
        <button
          onClick={() => onSetExpertMode?.(!expertMode)}
          className={`px-3 py-2 rounded-md text-left text-xs font-semibold ${expertMode ? "bg-cadio-accent text-[#111]" : "bg-[#38383b] text-cadio-text"}`}
        >
          Modeling
        </button>
        {(["select", "rectangle", "circle", "hole"] as ExpertTool[]).map((tool) => (
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
        camera={{ position: [300, 220, 300], fov: 42, near: 0.1, far: 10000 }}
        gl={{ antialias: true, alpha: false }}
      >
      <color attach="background" args={["#1c1c1f"]} />
 
      {/* Lighting - enhanced for clarity */}
      <ambientLight intensity={1.2} color="#ffffff" />
      <directionalLight
        position={[200, 250, 150]}
        intensity={2.0}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={2000}
        shadow-camera-left={-400}
        shadow-camera-right={400}
        shadow-camera-top={400}
        shadow-camera-bottom={-400}
      />
      <directionalLight position={[-150, 120, -120]} intensity={0.8} color="#c0d9ff" />
      <pointLight position={[0, 250, 0]} intensity={0.6} color="#ffffff" />
 
      {/* Grid - improved visibility */}
      <Grid
        args={[printerVolume[0] * 2.2, printerVolume[1] * 2.2]}
        cellSize={10}
        cellThickness={0.6}
        cellColor="#2f3033"
        sectionSize={50}
        sectionThickness={1.8}
        sectionColor="#45464a"
        fadeDistance={1000}
        fadeStrength={2.0}
        position={[0, -0.035, 0]}
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
          selected={obj.id === selectedObjectId}
          onSelect={() => onSelectObject(obj.id)}
          transformMode={transformMode}
          onTransformCommit={onTransformCommit}
          printerVolume={printerVolume}
          selectionMode={selectionMode}
          expertMode={expertMode}
          edgeOperation={edgeOperation}
          onEdgeAmount={(x, y, operation) => {
            setEdgeInput({ x, y, operation, value: String(operationAmount || 3) });
          }}
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
        maxPolarAngle={Math.PI / 2 + 0.1}
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
              onApplyExpertOperation?.(edgeInput.operation, amount);
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
