/** Main 3D viewport component with scene setup, lighting, and grid. */

import { Canvas } from "@react-three/fiber";
import { Grid, GizmoHelper, GizmoViewport, OrbitControls, Environment } from "@react-three/drei";
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
      camera={{ position: [200, 180, 200], fov: 45 }}
      gl={{ antialias: true, alpha: false }}
    >
      {/* Dark background matching the app theme */}
      <color attach="background" args={["#0d0d0d"]} />

      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[120, 150, 80]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-120, 80, -90]} intensity={0.3} color="#7dd3fc" />
      <pointLight position={[60, 40, 120]} intensity={0.2} color="#ffffff" />

      {/* Environment for reflections */}
      <Environment preset="night" />

      {/* Grid and axes */}
      <Grid
        args={[600, 600]}
        cellSize={10}
        cellThickness={0.3}
        cellColor="#1e1e1e"
        sectionSize={50}
        sectionThickness={0.8}
        sectionColor="#2a2a2a"
        fadeDistance={400}
        fadeStrength={1}
      />
      <axesHelper args={[100]} />

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
        maxDistance={800}
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
