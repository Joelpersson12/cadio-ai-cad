import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, GizmoHelper, GizmoViewport, TransformControls } from "@react-three/drei";
import * as THREE from "three";

function PartMesh({ object, selected, onSelect }) {
  const geometry = useMemo(() => {
    const meshData = object?.mesh;
    if (!meshData?.positions?.length || !meshData?.indices?.length) {
      return null;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(meshData.positions, 3));
    g.setIndex(meshData.indices);
    g.computeVertexNormals();
    return g;
  }, [object]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: selected ? "#ffd166" : "#8ab4ff",
        roughness: 0.45,
        metalness: 0.2
      }),
    [selected]
  );

  useEffect(() => {
    if (geometry) {
      console.log("mesh replaced");
      console.log("viewport updated successfully");
    }
    return () => {
      if (geometry) {
        geometry.dispose();
        console.log("old geometry disposed");
      }
    };
  }, [geometry]);

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  if (!geometry) return null;
  const pos = object?.transform?.position || [0, 0, 0];
  const rot = object?.transform?.rotation || [0, 0, 0];
  const scl = object?.transform?.scale || [1, 1, 1];
  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      position={pos}
      rotation={rot.map((d) => THREE.MathUtils.degToRad(d))}
      scale={scl}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(object.id);
      }}
    />
  );
}

function SceneObjects({
  objects,
  selectedObjectId,
  onSelectObject,
  transformMode,
  onTransformCommit
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <>
      {objects.map((obj) => {
        if (obj.id !== selectedObjectId) {
          return (
            <PartMesh
              key={obj.id}
              object={obj}
              selected={false}
              onSelect={onSelectObject}
            />
          );
        }
        return (
          <TransformControls
            key={`${obj.id}-tc`}
            mode={transformMode}
            size={0.8}
            showX
            showY
            showZ
            onMouseDown={() => setDragging(true)}
            onMouseUp={(e) => {
              setDragging(false);
              const t = e?.target?.object;
              if (!t) return;
              onTransformCommit(obj.id, {
                position: [t.position.x, t.position.y, t.position.z],
                rotation: [
                  THREE.MathUtils.radToDeg(t.rotation.x),
                  THREE.MathUtils.radToDeg(t.rotation.y),
                  THREE.MathUtils.radToDeg(t.rotation.z)
                ],
                scale: [t.scale.x, t.scale.y, t.scale.z]
              });
            }}
          >
            <PartMesh object={obj} selected onSelect={onSelectObject} />
          </TransformControls>
        );
      })}
      <OrbitControls makeDefault enablePan enableZoom enableRotate enabled={!dragging} />
    </>
  );
}

export default function CadViewport({
  objects,
  selectedObjectId,
  onSelectObject,
  transformMode,
  onTransformCommit
}) {
  return (
    <Canvas shadows camera={{ position: [220, 200, 220], fov: 45 }}>
      <color attach="background" args={["#15181f"]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[120, 150, 80]} intensity={1.1} castShadow />
      <pointLight position={[-120, 80, -90]} intensity={0.45} />
      <Grid args={[600, 600]} cellSize={10} cellThickness={0.4} sectionSize={50} sectionThickness={1.2} />
      <axesHelper args={[120]} />
      <SceneObjects
        objects={objects}
        selectedObjectId={selectedObjectId}
        onSelectObject={onSelectObject}
        transformMode={transformMode}
        onTransformCommit={onTransformCommit}
      />
      <GizmoHelper alignment="bottom-right" margin={[100, 100]}>
        <GizmoViewport axisColors={["#ff6b6b", "#4ecdc4", "#74b9ff"]} />
      </GizmoHelper>
    </Canvas>
  );
}
