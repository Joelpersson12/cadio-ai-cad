/** Scene object renderer with transform controls for the selected object. */

import { useState } from "react";
import { OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { CadObject, TransformMode } from "../utils/types";
import PartMesh from "./PartMesh";

interface SceneObjectsProps {
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

export default function SceneObjects({
  objects,
  selectedObjectId,
  onSelectObject,
  transformMode,
  onTransformCommit,
}: SceneObjectsProps) {
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
        if (transformMode === "off") {
          return (
            <PartMesh
              key={obj.id}
              object={obj}
              selected
              onSelect={onSelectObject}
            />
          );
        }
        return (
          <TransformControls
            key={`tc-${obj.id}`}
            mode={transformMode}
            size={0.8}
            translationSnap={5}
            rotationSnap={THREE.MathUtils.degToRad(15)}
            scaleSnap={0.1}
            onMouseDown={() => setDragging(true)}
            onMouseUp={(e) => {
              setDragging(false);
              const target = (e as unknown as { target?: { object?: THREE.Object3D } })
                ?.target?.object;
              if (!target) return;
              onTransformCommit(obj.id, {
                position: [
                  target.position.x,
                  target.position.y,
                  target.position.z,
                ],
                rotation: [
                  THREE.MathUtils.radToDeg(target.rotation.x),
                  THREE.MathUtils.radToDeg(target.rotation.y),
                  THREE.MathUtils.radToDeg(target.rotation.z),
                ],
                scale: [target.scale.x, target.scale.y, target.scale.z],
              });
            }}
          >
            <PartMesh object={obj} selected onSelect={onSelectObject} />
          </TransformControls>
        );
      })}
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        enabled={!dragging}
      />
    </>
  );
}
