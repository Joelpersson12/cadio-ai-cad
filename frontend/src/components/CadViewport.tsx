/** Main 3D viewport component with scene setup, lighting, and grid. */

import { Canvas } from "@react-three/fiber";
import { Grid, GizmoHelper, GizmoViewport } from "@react-three/drei";
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
      <color attach="background" args={["#0f1117"]} />

      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[120, 150, 80]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-120, 80, -90]} intensity={0.4} />

      {/* Grid and axes */}
      <Grid
        args={[600, 600]}
        cellSize={10}
        cellThickness={0.4}
        sectionSize={50}
        sectionThickness={1.2}
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
