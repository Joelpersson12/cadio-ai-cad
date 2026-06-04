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
      {/* Base plate - visible and textured */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <boxGeometry args={[px, 1, pz]} />
        <meshStandardMaterial 
          color="#1a2a3a" 
          roughness={0.95}
          metalness={0.05}
        />
      </mesh>
      {/* Corner markers for orientation */}
      {[
        [-px / 2, 0, -pz / 2],
        [px / 2, 0, -pz / 2],
        [-px / 2, 0, pz / 2],
        [px / 2, 0, pz / 2],
      ].map((pos, i) => (
        <mesh key={i} position={[pos[0], pos[1], pos[2]]}>
          <sphereGeometry args={[2, 8, 8]} />
          <meshStandardMaterial color="#4fc3f7" emissive="#2a7f99" />
        </mesh>
      ))}
      {/* Border frame - enhanced visibility */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(px, 0.5, pz)]} />
        <lineBasicMaterial color="#5fd6ff" linewidth={2} />
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
        args={[printerVolume[0] * 2.2, printerVolume[2] * 2.2]}
        cellSize={10}
        cellThickness={0.6}
        cellColor="#1a3a4a"
        sectionSize={50}
        sectionThickness={1.8}
        sectionColor="#2a5a7a"
        fadeDistance={1000}
        fadeStrength={2.0}
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