/** Main 3D viewport component with scene setup, lighting, grid, and ground plane. */

import { Canvas } from "@react-three/fiber";
import { Grid, GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { CadObject, TransformMode } from "../utils/types";
import SceneObjects from "./SceneObjects";

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
}

/** Ground plane component */
function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial 
        color="#252528"
        roughness={0.9}
        metalness={0.1}
      />
    </mesh>
  );
}

/** Coordinate axes with labels */
function CoordinateAxes() {
  return (
    <group>
      {/* X axis - Red */}
      <mesh position={[50, 0.5, 0]}>
        <boxGeometry args={[100, 1, 1]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      {/* Y axis - Green */}
      <mesh position={[0, 50, 0]}>
        <boxGeometry args={[1, 100, 1]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      {/* Z axis - Blue */}
      <mesh position={[0, 0.5, 50]}>
        <boxGeometry args={[1, 1, 100]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      {/* Origin marker */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[2, 16, 16]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

export default function CadViewport({
  objects,
  selectedObjectId,
  onSelectObject,
  transformMode,
  onTransformCommit,
}: CadViewportProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [200, 150, 200], fov: 50 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      {/* Background - light dark grey as requested */}
      <color attach="background" args={["#1e1e22"]} />
      
      {/* Fog for depth */}
      <fog attach="fog" args={["#1e1e22", 300, 800]} />

      {/* Enhanced Lighting Setup */}
      <ambientLight intensity={0.6} color="#ffffff" />
      
      {/* Main directional light */}
      <directionalLight
        position={[150, 200, 100]}
        intensity={1.5}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={500}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
      />
      
      {/* Fill light from opposite side */}
      <directionalLight
        position={[-100, 100, -50]}
        intensity={0.5}
        color="#b4c7e7"
      />
      
      {/* Rim light for depth */}
      <pointLight position={[0, 100, -150]} intensity={0.4} color="#94a3b8" />
      
      {/* Overhead fill */}
      <hemisphereLight args={["#b4c7e7", "#1e1e22", 0.4]} />

      {/* Ground plane */}
      <GroundPlane />

      {/* Grid - visible light grey lines */}
      <Grid
        args={[600, 600]}
        position={[0, 0.05, 0]}
        cellSize={10}
        cellThickness={0.6}
        cellColor="#3a3a40"
        sectionSize={50}
        sectionThickness={1.2}
        sectionColor="#4a4a52"
        fadeDistance={500}
        fadeStrength={1}
        infiniteGrid={false}
      />

      {/* Coordinate axes */}
      <CoordinateAxes />

      {/* Scene objects */}
      <SceneObjects
        objects={objects}
        selectedObjectId={selectedObjectId}
        onSelectObject={onSelectObject}
        transformMode={transformMode}
        onTransformCommit={onTransformCommit}
      />

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={50}
        maxDistance={600}
        maxPolarAngle={Math.PI / 2.1}
      />

      {/* Orientation gizmo */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="white"
        />
      </GizmoHelper>
    </Canvas>
  );
}
