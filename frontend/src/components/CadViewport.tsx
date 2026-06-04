/** Main 3D viewport - fixed scaling, camera auto-fit, better lighting. */
 
import { useEffect, useRef, useMemo } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { Grid, GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { CadObject, TransformMode } from "../utils/types";
 
// ---------------------------------------------------------------------------
// Camera auto-fit helper
// ---------------------------------------------------------------------------
 
function CameraController({ bounds }: { bounds: { x: number; y: number; z: number } }) {
  const { camera, controls } = useThree();
 
  useEffect(() => {
    const size = Math.max(bounds.x, bounds.y, bounds.z, 50);
    const distance = size * 2.2;
    camera.position.set(distance, distance * 0.8, distance);
    camera.near = 0.1;
    camera.far = distance * 20;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix?.();
    // @ts-ignore
    controls?.target?.set(0, size * 0.2, 0);
    // @ts-ignore
    controls?.update?.();
  }, [bounds, camera, controls]);
 
  return null;
}
 
// ---------------------------------------------------------------------------
// Mesh renderer with client-side scaling fix
// ---------------------------------------------------------------------------
 
function ScaledMesh({
  obj,
  selected,
  onSelect,
  printerVolume,
}: {
  obj: CadObject;
  selected: boolean;
  onSelect: () => void;
  printerVolume: [number, number, number];
}) {
  const meshRef = useRef<THREE.Mesh>(null);
 
  const geometry = useMemo(() => {
    if (!obj.mesh) return null;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(obj.mesh.positions);
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
    const [px, py, pz] = printerVolume;
    const ratio = Math.min(px / (sx || 1), py / (sy || 1), pz / (sz || 1), 1);
    return ratio;
  }, [geometry, printerVolume]);
 
  if (!geometry) return null;
 
  const t = obj.transform;
 
  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={[
        (t?.position?.[0] ?? 0) * scaleFactor,
        (t?.position?.[2] ?? 0) * scaleFactor,
        (t?.position?.[1] ?? 0) * scaleFactor,
      ]}
      rotation={[
        THREE.MathUtils.degToRad(t?.rotation?.[0] ?? 0),
        THREE.MathUtils.degToRad(t?.rotation?.[2] ?? 0),
        THREE.MathUtils.degToRad(t?.rotation?.[1] ?? 0),
      ]}
      scale={[
        (t?.scale?.[0] ?? 1) * scaleFactor,
        (t?.scale?.[2] ?? 1) * scaleFactor,
        (t?.scale?.[1] ?? 1) * scaleFactor,
      ]}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={selected ? "#4fc3f7" : "#b0bec5"}
        roughness={0.4}
        metalness={0.3}
        emissive={selected ? "#1a4a6e" : "#000000"}
        emissiveIntensity={selected ? 0.3 : 0}
      />
    </mesh>
  );
}
 
// ---------------------------------------------------------------------------
// Build plate
// ---------------------------------------------------------------------------
 
function BuildPlate({ volume }: { volume: [number, number, number] }) {
  const [px, , pz] = volume;
  return (
    <group>
      {/* Base plate */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <boxGeometry args={[px, 1, pz]} />
        <meshStandardMaterial color="#1a2030" roughness={0.9} />
      </mesh>
      {/* Border lines */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(px, 0.5, pz)]} />
        <lineBasicMaterial color="#4fc3f7" opacity={0.6} transparent />
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
}
 
export default function CadViewport({
  objects,
  selectedObjectId,
  onSelectObject,
  transformMode,
  onTransformCommit,
  printerVolume = [220, 220, 250],
  bounds = { x: 100, y: 100, z: 100 },
}: CadViewportProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [300, 220, 300], fov: 42, near: 0.1, far: 10000 }}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={["#1e1e22"]} />
 
      {/* Lighting - much brighter */}
      <ambientLight intensity={0.9} />
      <directionalLight
        position={[150, 200, 100]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={2000}
        shadow-camera-left={-300}
        shadow-camera-right={300}
        shadow-camera-top={300}
        shadow-camera-bottom={-300}
      />
      <directionalLight position={[-100, 80, -100]} intensity={0.5} color="#a0c4ff" />
      <pointLight position={[0, 200, 0]} intensity={0.4} color="#ffffff" />
 
      {/* Grid */}
      <Grid
        args={[printerVolume[0] * 2, printerVolume[2] * 2]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#2a3a4a"
        sectionSize={50}
        sectionThickness={1.5}
        sectionColor="#3a5a7a"
        fadeDistance={800}
        fadeStrength={1.5}
        position={[0, 0, 0]}
      />
 
      {/* Build plate */}
      <BuildPlate volume={printerVolume} />
 
      {/* Scaled objects */}
      {objects.map((obj) => (
        <ScaledMesh
          key={obj.id}
          obj={obj}
          selected={obj.id === selectedObjectId}
          onSelect={() => onSelectObject(obj.id)}
          printerVolume={printerVolume}
        />
      ))}
 
      {/* Camera auto-fit */}
      <CameraController bounds={bounds} />
 
      {/* Orbit controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.07}
        minDistance={20}
        maxDistance={2000}
        maxPolarAngle={Math.PI / 2 + 0.1}
      />
 
      {/* Orientation gizmo */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={["#ff6b6b", "#4ecdc4", "#74b9ff"]}
          labelColor="white"
        />
      </GizmoHelper>
    </Canvas>
  );
}