import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";

function LiveMesh({ meshData }) {
  const geometry = useMemo(() => {
    if (!meshData?.positions?.length || !meshData?.indices?.length) {
      return null;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(meshData.positions, 3)
    );
    g.setIndex(meshData.indices);
    g.computeVertexNormals();
    return g;
  }, [meshData]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#8ab4ff",
        roughness: 0.45,
        metalness: 0.2
      }),
    []
  );

  useEffect(() => {
    return () => {
      if (geometry) {
        geometry.dispose();
      }
    };
  }, [geometry]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  if (!geometry) {
    return null;
  }

  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
}

export default function CadViewport({ meshData }) {
  return (
    <Canvas shadows camera={{ position: [180, 160, 180], fov: 45 }}>
      <color attach="background" args={["#15181f"]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[120, 150, 80]} intensity={1.1} castShadow />
      <pointLight position={[-120, 80, -90]} intensity={0.45} />
      <Grid args={[500, 500]} cellSize={10} cellThickness={0.4} sectionSize={50} sectionThickness={1.2} />
      <axesHelper args={[120]} />
      <LiveMesh meshData={meshData} />
      <OrbitControls makeDefault enablePan enableZoom enableRotate />
      <GizmoHelper alignment="bottom-right" margin={[100, 100]}>
        <GizmoViewport axisColors={["#ff6b6b", "#4ecdc4", "#74b9ff"]} />
      </GizmoHelper>
    </Canvas>
  );
}
