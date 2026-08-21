'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DICE_DROP_DELAY_MS, DICE_SPIN_DURATION_MS } from './introTiming';

/** 开局拼图落位后，从上方坠落并最终转出六点面的独立 3D 骰子。 */
export default function IntroDice() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let frame = 0;
    let dice: THREE.Group | null = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(180, 180, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'size-full';
    host.append(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x25448b, 2.8));
    const key = new THREE.DirectionalLight(0xffffff, 3.1);
    key.position.set(-3, 5, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x55cfff, 1.8);
    rim.position.set(4, -2, 4);
    scene.add(rim);

    const startedAt = performance.now();
    new GLTFLoader().load('/ludo/models/dice-complete-v2.glb', (gltf) => {
      if (cancelled) return;
      dice = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(dice);
      const center = bounds.getCenter(new THREE.Vector3());
      dice.position.sub(center);
      dice.scale.setScalar(1.7);
      scene.add(dice);
    });

    const render = (now: number) => {
      if (cancelled) return;
      frame = requestAnimationFrame(render);
      if (dice) {
        // Blender Z-up 导出 glTF 后六点面位于 -Y；完整旋转 3 秒后稳定转向镜头。
        const t = Math.max(0, Math.min(1, (now - startedAt - DICE_DROP_DELAY_MS) / DICE_SPIN_DURATION_MS));
        const settle = 1 - Math.pow(1 - t, 3);
        dice.rotation.set(
          (1 - settle) * Math.PI * 3.6 + settle * -Math.PI / 2,
          (1 - settle) * Math.PI * 4.4,
          (1 - settle) * Math.PI * 2.2,
        );
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="size-full" aria-hidden="true" />;
}
