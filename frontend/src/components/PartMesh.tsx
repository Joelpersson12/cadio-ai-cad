/** Individual CAD object mesh renderer with proper lifecycle management. */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { CadObject } from "../utils/types";

interface PartMeshProps {
  object: CadObject;
  selected: boolean;
  onSelect: (id: string) => void;
}

export default function PartMesh({ object, selected, onSelect }: PartMeshProps) {
  const geometry = useMemo(() => {
    const mesh = object.mesh;
    if (!mesh?.positions?.length || !mesh?.indices?.length) return null;

    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(mesh.positions, 3),
    );
    g.setIndex(mesh.indices);
    g.computeVertexNormals();
    return g;
  }, [object.mesh]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: selected ? "#ffd166" : "#5aa1ff",
        roughness: 0.4,
        metalness: 0.15,
        flatShading: false,
      }),
    [selected],
  );

  // Dispose old geometry and material on unmount or change
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect(object.id);
      }}
    />
  );
}
