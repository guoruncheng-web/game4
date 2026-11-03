import * as Phaser from 'phaser';
import { BALL_COLORS, BALL_R, PALETTE } from './config';

/**
 * 全部贴图运行时生成,不依赖任何图片文件(延续盒子里其他游戏的做法)。
 *
 * 球用 Canvas 贴图画而不是 Graphics.generateTexture:球面高光要径向渐变、
 * 号码要 fillText,这两样 Phaser 的 Graphics 都给不了。
 * 尺寸按屏幕上的实际大小 ×2 生成 —— 逻辑画布是 540×960 且不做 DPR 放大,
 * 再大就是白占显存(水果那款就是栽在这上面)。
 */
const BALL_TEX = Math.round(BALL_R * 2 * 2);

export function createTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('pb-ball-0')) return;
  for (let id = 0; id <= 15; id++) drawBall(scene, id);
  drawCue(scene);
  drawGlow(scene);
}

function drawBall(scene: Phaser.Scene, id: number) {
  const size = BALL_TEX;
  const texture = scene.textures.createCanvas(`pb-ball-${id}`, size, size);
  if (!texture) return;
  const ctx = texture.context;
  const r = size / 2;
  const striped = id >= 9;
  const base = id === 0 ? 0xf7f4ec : BALL_COLORS[striped ? id - 8 : id] ?? 0xffffff;

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 0.5, 0, Math.PI * 2);
  ctx.clip();

  // 花色球是白底 + 中间一条色带
  ctx.fillStyle = striped ? '#f7f4ec' : hex(base);
  ctx.fillRect(0, 0, size, size);
  if (striped) {
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, size * 0.22, size, size * 0.56);
  }

  // 球面:左上高光 + 右下暗部,这两下就够把平面圆片撑成球
  const shade = ctx.createRadialGradient(r * 0.62, r * 0.6, r * 0.15, r, r, r);
  shade.addColorStop(0, 'rgba(255,255,255,0.55)');
  shade.addColorStop(0.45, 'rgba(255,255,255,0.06)');
  shade.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  if (id !== 0) {
    ctx.fillStyle = '#fbf9f4';
    ctx.beginPath();
    ctx.arc(r, r, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#15181d';
    ctx.font = `bold ${Math.round(size * 0.34)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(id), r, r + size * 0.015);
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(r, r, r - 0.6, 0, Math.PI * 2);
  ctx.stroke();
  texture.refresh();
}

/** 球杆:一根有锥度的木杆,原点放在杆头,方便直接绕母球旋转 */
function drawCue(scene: Phaser.Scene) {
  const width = 300;
  const height = 12;
  const texture = scene.textures.createCanvas('pb-cue', width, height);
  if (!texture) return;
  const ctx = texture.context;
  const mid = height / 2;
  ctx.fillStyle = '#efe4cd';
  ctx.beginPath();
  ctx.moveTo(0, mid - 1.6); ctx.lineTo(14, mid - 2.1); ctx.lineTo(14, mid + 2.1); ctx.lineTo(0, mid + 1.6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2c3a4d';
  ctx.fillRect(12, mid - 2.2, 5, 4.4);
  const wood = ctx.createLinearGradient(0, 0, 0, height);
  wood.addColorStop(0, '#c99a5c');
  wood.addColorStop(0.45, '#8a5a2c');
  wood.addColorStop(1, '#4d2f16');
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.moveTo(17, mid - 2.2); ctx.lineTo(width, mid - 5.4); ctx.lineTo(width, mid + 5.4); ctx.lineTo(17, mid + 2.2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#231409';
  ctx.fillRect(width - 74, mid - 5, 74, 10);
  texture.refresh();
}

/** 袋口与落袋闪光共用的一张软光斑 */
function drawGlow(scene: Phaser.Scene) {
  const size = 64;
  const texture = scene.textures.createCanvas('pb-glow', size, size);
  if (!texture) return;
  const ctx = texture.context;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  texture.refresh();
}

export function ballTexture(id: number) {
  return `pb-ball-${id}`;
}

function hex(value: number) {
  return `#${value.toString(16).padStart(6, '0')}`;
}

export const CLOTH_COLORS = PALETTE;
