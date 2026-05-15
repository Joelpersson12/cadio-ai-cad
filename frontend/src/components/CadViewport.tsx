/** Main 3D viewport component with scene setup, lighting, grid, and build plate. */

import { Canvas } from "@react-three/fiber";
import { Grid, GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { GenerateResponse } from "../utils/api";
import GeneratedMesh from "./GeneratedMesh";

interface CadViewportProps {
  meshData: GenerateResponse | null;
}

/** Build plate / ground plane */
function BuildPlate() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial 
        color="#2a2a30"
        roughness={0.9}
        metalness={0.1}
      />
    </mesh>
  );
}

/** Coordinate axes with arrows */
function CoordinateAxes() {
  const axisLength = 80;
  const axisThickness = 1;
  
  return (
    <group position={[0, 0.5, 0]}>
      {/* X axis - Red */}
      <mesh position={[axisLength / 2, 0, 0]}>
        <boxGeometry args={[axisLength, axisThickness, axisThickness]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      <mesh position={[axisLength + 4, 0, 0]}>
        <coneGeometry args={[3, 8, 8]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      
      {/* Y axis - Green */}
      <mesh position={[0, axisLength / 2, 0]}>
        <boxGeometry args={[axisThickness, axisLength, axisThickness]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      <mesh position={[0, axisLength + 4, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[3, 8, 8]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      
      {/* Z axis - Blue */}
      <mesh position={[0, 0, axisLength / 2]}>
        <boxGeometry args={[axisThickness, axisThickness, axisLength]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      <mesh position={[0, 0, axisLength + 4]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[3, 8, 8]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      
      {/* Origin sphere */}
      <mesh>
        <sphereGeometry args={[2, 16, 16]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

/** Placeholder cube when no mesh is loaded */
function PlaceholderCube() {
  return (
    <mesh position={[0, 25, 0]} castShadow>
      <boxGeometry args={[50, 50, 50]} />
      <meshStandardMaterial 
        color="#4a5568" 
        opacity={0.3} 
        transparent 
        wireframe
      />
    </mesh>
  );
}

export default function CadViewport({ meshData }: CadViewportProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [150, 120, 150], fov: 50 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      {/* Background - light dark grey */}
      <color attach="background" args={["#1e1e22"]} />
      
      {/* Subtle fog for depth */}
      <fog attach="fog" args={["#1e1e22", 400, 1000]} />

      {/* Lighting Setup - soft and visible */}
      <ambientLight intensity={0.7} color="#ffffff" />
      
      {/* Main directional light with shadows */}
      <directionalLight
        position={[100, 150, 100]}
        intensity={1.2}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={500}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
      />
      
      {/* Fill light from opposite side */}
      <directionalLight
        position={[-80, 80, -60]}
        intensity={0.5}
        color="#b4c7e7"
      />
      
      {/* Back rim light */}
      <pointLight position={[0, 100, -120]} intensity={0.4} color="#94a3b8" />
      
      {/* Hemisphere light for ambient fill */}
      <hemisphereLight args={["#c4d4f7", "#1e1e22", 0.5]} />

      {/* Build plate / Ground plane - VERY IMPORTANT */}
      <BuildPlate />

      {/* Grid - visible light grey lines */}
      <Grid
        args={[400, 400]}
        position={[0, 0.1, 0]}
        cellSize={10}
        cellThickness={0.6}
        cellColor="#3d3d45"
        sectionSize={50}
        sectionThickness={1.2}
        sectionColor="#4d4d58"
        fadeDistance={400}
        fadeStrength={1}
        infiniteGrid={false}
      />

      {/* Coordinate axes */}
      <CoordinateAxes />

      {/* Render mesh or placeholder */}
      {meshData && meshData.mesh ? (
        <GeneratedMesh meshData={meshData.mesh} bbox={meshData.bbox} />
      ) : (
        <PlaceholderCube />
      )}

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={50}
        maxDistance={500}
        maxPolarAngle={Math.PI / 2.05}
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
