'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import * as THREE from 'three';
import { VS_IMPACT_DELAY_MS } from './introTiming';

type EffekseerEffect = { isLoaded: boolean };
type EffekseerHandle = { setScale(x: number, y: number, z: number): void };
type EffekseerContext = {
  init(gl: WebGLRenderingContext | WebGL2RenderingContext, settings?: { enablePremultipliedAlpha?: boolean }): void;
  loadEffect(url: string, scale: number, onload: () => void, onerror: (message: string, url: string) => void): EffekseerEffect;
  play(effect: EffekseerEffect, x?: number, y?: number, z?: number): EffekseerHandle | null;
  update(frames: number): void;
  draw(): void;
  setProjectionMatrix(matrix: ArrayLike<number>): void;
  setCameraMatrix(matrix: ArrayLike<number>): void;
  setRestorationOfStatesFlag(enabled: boolean): void;
  stopAll(): void;
  releaseEffect(effect: EffekseerEffect): void;
};
type EffekseerRuntime = {
  initRuntime(path: string, onload: () => void, onerror: () => void): void;
  createContext(): EffekseerContext;
  releaseContext(context: EffekseerContext): void;
};

declare global {
  interface Window { effekseer?: EffekseerRuntime }
}

let runtimePromise: Promise<EffekseerRuntime> | null = null;

const BURST_PARTICLES = Array.from({ length: 30 }, (_, index) => {
  const angle = (index * 137.508 + 11) % 360;
  const distance = 62 + (index * 23) % 74;
  const size = 2 + (index * 7) % 5;
  return { angle, distance, size, delay: (index % 6) * 18, warm: index % 3 !== 0 };
});

const INBOUND_PARTICLES = Array.from({ length: 14 }, (_, index) => ({
  y: 29 + (index * 17) % 43,
  delay: (index % 7) * 52,
  size: 2 + (index % 3),
}));

function loadRuntime(): Promise<EffekseerRuntime> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = new Promise((resolve, reject) => {
    const initialize = () => {
      const runtime = window.effekseer;
      if (!runtime) return reject(new Error('Effekseer WebGL 运行时未加载'));
      runtime.initRuntime('/ludo/effekseer/runtime/effekseer.wasm', () => resolve(runtime), () => reject(new Error('Effekseer WASM 初始化失败')));
    };
    if (window.effekseer) return initialize();
    const existing = document.querySelector<HTMLScriptElement>('script[data-ludo-effekseer]');
    if (existing) {
      existing.addEventListener('load', initialize, { once: true });
      existing.addEventListener('error', () => reject(new Error('Effekseer 脚本加载失败')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = '/ludo/effekseer/runtime/effekseer.min.js';
    script.dataset.ludoEffekseer = '';
    script.onload = initialize;
    script.onerror = () => reject(new Error('Effekseer 脚本加载失败'));
    document.head.appendChild(script);
  });
  return runtimePromise;
}

/**
 * Ludo 开局的中央对决徽记。
 * Effekseer 只负责极短的加算撞击纹理；轮廓、阵营色和最终定格由 DOM 保证清晰。
 */
export default function EffekseerVs() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let frame = 0;
    let playTimer = 0;
    let runtime: EffekseerRuntime | null = null;
    let context: EffekseerContext | null = null;
    let effect: EffekseerEffect | null = null;
    let renderer: THREE.WebGLRenderer | null = null;

    void loadRuntime().then((loadedRuntime) => {
      if (cancelled) return;
      runtime = loadedRuntime;
      // Effekseer 的加算粒子必须和浏览器 Canvas 使用同一套预乘 Alpha,
      // 否则透明区的 RGB 会被当成黑色叠到底图上。
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(320, 320, false);
      renderer.setClearColor(0x000000, 0);

      const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
      camera.position.set(0, 0, 20);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      context = runtime.createContext();
      context.init(renderer.getContext(), { enablePremultipliedAlpha: true });
      context.setRestorationOfStatesFlag(false);
      const clock = new THREE.Clock();

      effect = context.loadEffect('/ludo/effekseer/vs/vs-burst-v1806.efkefc', 0.88, () => {
        playTimer = window.setTimeout(() => {
          if (cancelled || !context || !effect) return;
          const handle = context.play(effect, 0, 0, 0);
          handle?.setScale(0.88, 0.88, 0.88);
        }, VS_IMPACT_DELAY_MS);
      }, (message, url) => console.error(`Effekseer: ${message} ${url}`));

      const draw = () => {
        if (cancelled || !context || !renderer) return;
        frame = requestAnimationFrame(draw);
        renderer.clear();
        context.update(Math.min(clock.getDelta(), 0.05) * 60);
        context.setProjectionMatrix(camera.projectionMatrix.elements);
        context.setCameraMatrix(camera.matrixWorldInverse.elements);
        context.draw();
        renderer.resetState();
      };
      draw();
    }).catch((error) => console.error(error));

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(playTimer);
      if (context) {
        context.stopAll();
        if (effect?.isLoaded) context.releaseEffect(effect);
        runtime?.releaseContext(context);
      }
      renderer?.dispose();
    };
  }, []);

  return (
    <div className="versus-mark relative size-full" aria-hidden="true">
      <div className="versus-stream versus-stream-red">
        {INBOUND_PARTICLES.map((particle, index) => <i key={index} style={{ '--y': `${particle.y}%`, '--delay': `${particle.delay}ms`, '--size': `${particle.size}px` } as CSSProperties} />)}
      </div>
      <div className="versus-stream versus-stream-blue">
        {INBOUND_PARTICLES.map((particle, index) => <i key={index} style={{ '--y': `${particle.y}%`, '--delay': `${particle.delay + 26}ms`, '--size': `${particle.size}px` } as CSSProperties} />)}
      </div>
      <canvas ref={canvasRef} width={320} height={320} className="versus-effekseer absolute inset-0 size-full" />
      <div className="versus-impact-flash" />
      <div className="versus-burst">
        {BURST_PARTICLES.map((particle, index) => (
          <i
            key={index}
            className={particle.warm ? 'warm' : 'cool'}
            style={{ '--angle': `${particle.angle}deg`, '--distance': `${particle.distance}px`, '--size': `${particle.size}px`, '--delay': `${particle.delay}ms` } as CSSProperties}
          />
        ))}
      </div>
      <div className="versus-core absolute left-1/2 top-1/2 grid place-items-center">
        <b className="versus-core-glint" />
        <span>VS</span>
      </div>
      <style>{`
        .versus-mark{isolation:isolate;filter:drop-shadow(0 7px 9px rgba(0,7,39,.48))}
        .versus-effekseer{z-index:3;opacity:0;mix-blend-mode:screen;mask-image:radial-gradient(circle,#000 0 35%,rgba(0,0,0,.82) 57%,transparent 78%);animation:versus-texture 1.08s .55s ease-out both}
        .versus-stream{position:absolute;z-index:1;inset:0;overflow:hidden}
        .versus-stream i{position:absolute;top:var(--y);width:var(--size);height:var(--size);border-radius:50%;opacity:0;box-shadow:0 0 7px currentColor;animation-duration:.48s;animation-delay:calc(.12s + var(--delay));animation-timing-function:cubic-bezier(.16,.7,.2,1);animation-fill-mode:both}
        .versus-stream-red{color:#ff5261}.versus-stream-red i{left:2%;background:#fff2c6;animation-name:versus-stream-red}
        .versus-stream-blue{color:#39cfff}.versus-stream-blue i{right:2%;background:#d8f8ff;animation-name:versus-stream-blue}
        .versus-impact-flash{position:absolute;z-index:4;left:50%;top:50%;width:18%;aspect-ratio:1;border-radius:50%;opacity:0;transform:translate(-50%,-50%) scale(.2);background:#fffbe1;box-shadow:0 0 9px 4px #fff,0 0 23px 10px #ffc848,0 0 48px 16px rgba(46,190,255,.85);animation:versus-impact .42s .58s ease-out both}
        .versus-burst{position:absolute;z-index:4;left:50%;top:50%;width:1px;height:1px}
        .versus-burst i{position:absolute;left:0;top:0;width:var(--size);height:calc(var(--size) * 3.4);border-radius:50% 50% 20% 20%;opacity:0;transform-origin:50% 0;filter:drop-shadow(0 0 4px currentColor);animation:versus-particle .86s calc(.59s + var(--delay)) cubic-bezier(.12,.62,.18,1) both}
        .versus-burst i.warm{color:#ffbd38;background:linear-gradient(#fffde0,#ffd04f 45%,#ff6b2b 80%,transparent)}
        .versus-burst i.cool{color:#4bd8ff;background:linear-gradient(#fff,#85eaff 48%,#318cff 82%,transparent)}
        .versus-core{z-index:5;width:44%;height:31%;border:1px solid #fff1b3;opacity:0;transform:translate(-50%,-50%) scale(.7) skewX(-10deg);background:linear-gradient(165deg,#fff8d9 0,#e8b949 10%,#6d3d12 17%,#171b3e 24%,#101936 62%,#683b12 70%,#eabe54 82%,#fff5c8 100%);clip-path:polygon(12% 0,100% 0,88% 100%,0 100%);box-shadow:inset 0 0 0 2px rgba(255,255,255,.12),0 3px 0 #4e270b,0 0 13px rgba(255,220,113,.82),0 0 25px rgba(47,174,255,.42);animation:versus-core .46s .6s cubic-bezier(.16,1.2,.3,1) forwards,versus-core-idle 2.8s 1.06s ease-in-out infinite}
        .versus-core:before,.versus-core:after{content:"";position:absolute;top:50%;width:16%;height:2px;background:#ffe58b;box-shadow:0 0 6px #fff1a8}.versus-core:before{right:99%}.versus-core:after{left:99%}
        .versus-core span{position:relative;z-index:2;transform:skewX(2deg);background:linear-gradient(180deg,#fff 0,#fff8ca 35%,#eab43e 72%,#fff2a1 100%);background-clip:text;color:transparent;font-size:clamp(29px,9vw,49px);font-weight:1000;font-style:italic;line-height:1;letter-spacing:-.12em;padding-right:.12em;-webkit-text-stroke:1px rgba(89,42,7,.72);filter:drop-shadow(0 2px 0 #301909) drop-shadow(0 0 4px rgba(255,244,180,.7))}
        .versus-core-glint{position:absolute;z-index:1;inset:-20%;opacity:0;background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,.8) 48%,transparent 58%);transform:translateX(-70%);animation:versus-glint .58s .78s ease-out forwards}
        @keyframes versus-stream-red{0%{opacity:0;transform:translateX(0) scale(.5)}30%{opacity:1}100%{opacity:0;transform:translateX(148px) scale(1.35)}}
        @keyframes versus-stream-blue{0%{opacity:0;transform:translateX(0) scale(.5)}30%{opacity:1}100%{opacity:0;transform:translateX(-148px) scale(1.35)}}
        @keyframes versus-impact{0%{opacity:0;transform:translate(-50%,-50%) scale(.15)}26%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(3.1)}}
        @keyframes versus-texture{0%,100%{opacity:0;transform:scale(.48)}28%{opacity:.78;transform:scale(.72)}68%{opacity:.38;transform:scale(1.08)}}
        @keyframes versus-particle{0%{opacity:0;transform:rotate(var(--angle)) translateY(-5px) scaleY(.35)}18%{opacity:1}72%{opacity:.82}100%{opacity:0;transform:rotate(var(--angle)) translateY(calc(-1 * var(--distance))) scaleY(1)}}
        @keyframes versus-core{to{opacity:1;transform:translate(-50%,-50%) scale(1) skewX(-10deg)}}
        @keyframes versus-core-idle{50%{filter:brightness(1.12);box-shadow:inset 0 0 0 2px rgba(255,255,255,.16),0 3px 0 #4e270b,0 0 17px rgba(255,226,126,.92),0 0 30px rgba(47,174,255,.5)}}
        @keyframes versus-glint{40%{opacity:.9}100%{opacity:0;transform:translateX(70%)}}
        @media (prefers-reduced-motion:reduce){.versus-mark *{animation:none!important}.versus-core{opacity:1!important;transform:translate(-50%,-50%) skewX(-10deg)}}
      `}</style>
    </div>
  );
}
