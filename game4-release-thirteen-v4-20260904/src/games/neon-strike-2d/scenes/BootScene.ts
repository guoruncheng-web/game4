import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { createTextures } from '../textures';
import { preloadSfx } from '../sfx';
import type { CoopBridge } from '../coop/bridge';

/** 图片资源清单:key → 路径 */
const IMAGES: Array<[string, string]> = [
  ['ns-space', '/neon-strike-2d/assets/space-corridor-v2.png'],
  ['ns-player', '/neon-strike-2d/assets/player-fighter-3d-v3.png'],
  ['ns-enemy', '/neon-strike-2d/assets/enemy-drone-v2.png'],
  ['ns-boss', '/neon-strike-2d/assets/boss-carrier-v3.png'],
  ['ns-panel', '/neon-strike-2d/assets/ui-popup-panel-v1.png'],
  ['ns-hud-frame', '/neon-strike-2d/assets/hud-frame-v1.png'],
  // 特效贴图都画在纯黑底上,用 ADD 混合叠加时黑色自然变透明
  ['ns-fx-impact', '/neon-strike-2d/assets/vfx/laser-impact.png'],
  ['ns-fx-boom', '/neon-strike-2d/assets/vfx/enemy-explosion.png'],
  ['ns-fx-boom-boss', '/neon-strike-2d/assets/vfx/boss-explosion.png'],
  ['ns-fx-shield', '/neon-strike-2d/assets/vfx/shield-impact.png'],
  ['ns-fx-portal', '/neon-strike-2d/assets/vfx/boss-portal.png'],
];

const BAR = { x: 90, y: 560, w: GAME_WIDTH - 180, h: 14 };
/** 音效改成 WebAudio 合成之后没有文件要下载,进度基本全在图片上 */
const IMAGE_WEIGHT = 0.92;

export class BootScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Graphics;
  private percent!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private imageProgress = 0;
  private audioProgress = 0;
  private failed: string[] = [];
  /** 队友的加载进度。-1 表示不是联机局,或还没收到过 */
  private peerProgress = -1;
  private lastSentProgress = -1;

  constructor() { super('NeonBoot'); }

  preload() {
    this.failed = [];
    this.peerProgress = -1;
    this.lastSentProgress = -1;
    this.imageProgress = 0;
    this.audioProgress = 0;
    this.buildUI();

    // 重试会再进一次 preload,先摘掉上一轮的监听
    this.load.off(Phaser.Loader.Events.PROGRESS);
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR);
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      this.imageProgress = value;
      this.status.setText('载入战场素材…');
      this.reportProgress();
      this.render();
    });

    // 联机时互报进度。第一次加载慢的那个人,对面能看见他到哪了,
    // 而不是对着一个不动的画面猜是不是卡死了
    const bridge = this.registry.get('coopBridge') as CoopBridge | undefined;
    if (bridge) {
      bridge.listen((data) => {
        const msg = data as { t?: string; p?: number };
        if (msg?.t === 'load' && typeof msg.p === 'number') {
          this.peerProgress = msg.p;
          this.render();
        }
      });
    }
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.failed.push(file.key);
    });

    IMAGES.forEach(([key, path]) => this.load.image(key, path));
  }

  create() {
    // 重试时图片可能全在缓存里,loader 不会发 PROGRESS,这里补满前半段
    this.imageProgress = 1;
    createTextures(this);
    void this.loadAudio();
  }

  private async loadAudio() {
    this.status.setText('初始化音频…');
    // 音效是 WebAudio 合成的,没有文件要下载,这一步只是建 AudioContext 和噪声缓冲
    await preloadSfx((loaded, total) => {
      this.audioProgress = loaded / total;
      this.reportProgress();
      this.render();
    });
    // 等待期间玩家可能已经离开页面,场景被销毁
    if (!this.isAlive()) return;

    // 贴图失败要拦人:画不出来的游戏没法玩
    if (this.failed.length > 0) {
      this.showRetry();
      return;
    }
    this.status.setText('准备就绪');
    this.reportProgress(true);
    this.render();
    // 把监听摘掉:接下来是 GameScene 的 CoopSession 接管这条桥
    (this.registry.get('coopBridge') as CoopBridge | undefined)?.listen(null);
    this.time.delayedCall(140, () => this.scene.start('NeonMenu'));
  }

  /** 上报自己的进度。节流到每 5% 一次 —— 进度条上看不出差别,却少发几十条消息 */
  private reportProgress(force = false) {
    const bridge = this.registry.get('coopBridge') as CoopBridge | undefined;
    if (!bridge) return;
    const p = this.imageProgress * 0.7 + this.audioProgress * 0.3;
    if (!force && p - this.lastSentProgress < 0.05) return;
    this.lastSentProgress = p;
    bridge.send({ t: 'load', p });
  }

  /** 加载期间场景状态是 LOADING/CREATING,不能用 isActive() 判活,只能排除 SHUTDOWN 之后 */
  private isAlive() {
    return this.sys.settings.status < Phaser.Scenes.SHUTDOWN;
  }

  private buildUI() {
    this.cameras.main.setBackgroundColor('#06051b');

    const frame = this.add.graphics();
    frame.fillStyle(0x050d19, 0.86).fillRect(70, 388, GAME_WIDTH - 140, 128);
    frame.lineStyle(2, 0x3de7ff, 0.72).strokeRect(70, 388, GAME_WIDTH - 140, 128);

    this.add.text(GAME_WIDTH / 2, 424, 'NEON STRIKE', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '38px', color: '#eafbff',
      stroke: '#0a3347', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 476, '星门防卫协议 // BOOT', {
      fontFamily: 'monospace', fontSize: '15px', color: '#ff6b63',
    }).setOrigin(0.5);

    // 进度条底槽
    this.add.graphics()
      .fillStyle(0x0b1c2b, 0.9).fillRect(BAR.x, BAR.y, BAR.w, BAR.h)
      .lineStyle(1, 0x2c93a8, 0.8).strokeRect(BAR.x, BAR.y, BAR.w, BAR.h);
    this.bar = this.add.graphics();

    this.status = this.add.text(BAR.x, BAR.y - 24, '连接星门…', {
      fontFamily: 'monospace', fontSize: '16px', color: '#9feaff',
    }).setOrigin(0, 0.5);
    this.percent = this.add.text(BAR.x + BAR.w, BAR.y - 24, '0%', {
      fontFamily: 'monospace', fontSize: '16px', color: '#9feaff',
    }).setOrigin(1, 0.5);
    this.hint = this.add.text(GAME_WIDTH / 2, BAR.y + 46, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#7fabc4',
      align: 'center', wordWrap: { width: BAR.w },
    }).setOrigin(0.5, 0);

    this.render();
  }

  private render() {
    if (!this.isAlive() || !this.bar) return;
    const value = this.imageProgress * IMAGE_WEIGHT + this.audioProgress * (1 - IMAGE_WEIGHT);
    this.bar.clear();
    if (value > 0) {
      this.bar.fillStyle(0x54ecff, 0.95).fillRect(BAR.x + 1, BAR.y + 1, (BAR.w - 2) * value, BAR.h - 2);
    }
    this.percent.setText(`${Math.round(value * 100)}%`);

    // 联机时把队友的进度画成第二条(暗一档的)。
    // 自己读完了对方还没好时,这条是唯一能说明"在等什么"的东西
    if (this.peerProgress >= 0) {
      this.bar.fillStyle(0xffb46a, 0.55)
        .fillRect(BAR.x + 1, BAR.y + BAR.h + 5, (BAR.w - 2) * this.peerProgress, 6);
      this.hint.setText(
        this.peerProgress >= 1 ? '队友已就绪' : `队友载入中 ${Math.round(this.peerProgress * 100)}%`,
      );
    }
  }

  private showRetry() {
    this.status.setText('素材加载失败').setColor('#ff6b63');
    this.hint.setText(`${this.failed.length} 张贴图没能载入:\n${this.failed.join('  ')}`).setColor('#ff9d97');

    const y = GAME_HEIGHT / 2 + 176;
    const button = this.add.rectangle(GAME_WIDTH / 2, y, 240, 62, 0x09283a, 0.96)
      .setStrokeStyle(3, 0x54ecff)
      .setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2, y, '重新加载', {
      fontFamily: 'system-ui', fontSize: '24px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    const retry = () => {
      // 只清掉失败的图片 key,已经加载好的保持在缓存里(音效由 preloadSfx 自己重抓)
      IMAGES.forEach(([key]) => {
        if (this.failed.includes(key)) this.textures.remove(key);
      });
      this.scene.restart();
    };
    button.once('pointerdown', retry);
    this.input.keyboard?.once('keydown-SPACE', retry);
  }
}
