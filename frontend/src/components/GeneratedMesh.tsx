/** GeneratedMesh - Renders a mesh from vertices and faces arrays */

import { useMemo } from "react";
import * as THREE from "three";
import type { GenerateResponse } from "../utils/api";

interface GeneratedMeshProps {
  meshData: GenerateResponse["mesh"];
  bbox: GenerateResponse["bbox"];
}

export default function GeneratedMesh({ meshData, bbox }: GeneratedMeshProps) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    
    // Flatten vertices array [[x,y,z], ...] to Float32Array [x,y,z,x,y,z,...]
    const positions: number[] = [];
    meshData.vertices.forEach((vertex) => {
      positions.push(vertex[0], vertex[1], vertex[2]);
    });
    
    // Flatten faces array [[a,b,c], ...] to Uint32Array [a,b,c,a,b,c,...]
    const indices: number[] = [];
    meshData.faces.forEach((face) => {
      indices.push(face[0], face[1], face[2]);
    });
    
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    
    // Center the geometry so it sits on the ground plane
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      const center = new THREE.Vector3();
      geo.boundingBox.getCenter(center);
      // Only center X and Z, keep Y so bottom is at 0
      geo.translate(-center.x, -geo.boundingBox.min.y, -center.z);
    }
    
    return geo;
  }, [meshData]);

  return (
    <group>
      {/* Main mesh */}
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color="#6b8cff"
          metalness={0.3}
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Wireframe overlay for CAD-like appearance */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color="#ffffff"
          wireframe
          opacity={0.1}
          transparent
        />
      </mesh>
      
      {/* Bounding box visualization */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(bbox.x, bbox.y, bbox.z)]} />
        <lineBasicMaterial color="#4a90d9" opacity={0.5} transparent />
      </lineSegments>
    </group>
  );
}
