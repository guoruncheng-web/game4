import { CAMPAIGN_WAVES, TUNING } from '../config';
import type { HudState } from '../world';
import { el } from './style';

/**
 * 战斗中的 HUD。
 *
 * 所有字段都做了"值没变就不写 DOM"的判断:update 是每帧调的,
 * 无脑赋值 textContent 会让浏览器每帧都重排一遍这十几个节点。
 */
export class Hud {
  readonly root = el('div', 'ns3-hud');

  private score = el('div', 'ns3-score ns3-mono', '000000');
  private status = el('div', 'ns3-status');
  private waveLine = el('div');
  private livesLine = el('div', 'ns3-lives');
  private pwrLine = el('div', 'ns3-pwr');
  private combo = el('div', 'ns3-combo');
  private comboValue = el('span', '', '×1');
  private shield = el('div', 'ns3-shield ns3-mono');
  private bossBox = el('div', 'ns3-boss');
  private bossName = el('span', '', 'CORE CARRIER');
  private bossPhase = el('span', '', 'PHASE 1');
  private bossFill = el('div', 'ns3-boss-fill');
  private banner = el('div', 'ns3-banner');
  private floats = el('div', 'ns3-floats');
  private flash = el('div', 'ns3-flash');

  private last = { score: -1, wave: -1, lives: -1, weapon: -1, combo: -1, shield: '', boss: '', ratio: -1 };
  private flashTimer?: number;

  constructor(onPause: () => void) {
    const top = el('div', 'ns3-hud-top');
    const left = el('div', 'ns3-score-wrap');
    left.append(el('div', 'ns3-label', 'SCORE'), this.score);
    this.status.append(this.waveLine, this.livesLine, this.pwrLine);
    top.append(left, this.status);

    const pause = el('button', 'ns3-pause');
    pause.setAttribute('aria-label', '暂停');
    const bars = el('span');
    bars.append(el('i'), el('i'));
    pause.append(bars);
    pause.addEventListener('click', onPause);

    const bossRow = el('div', 'ns3-boss-row');
    bossRow.append(this.bossName, this.bossPhase);
    const bossTrack = el('div', 'ns3-boss-track');
    bossTrack.append(this.bossFill);
    this.bossBox.append(bossRow, bossTrack);
    this.bossBox.hidden = true;

    this.combo.append(this.comboValue, el('small', '', 'COMBO'));
    this.combo.hidden = true;
    this.shield.hidden = true;

    this.root.append(top, pause, this.bossBox, this.combo, this.shield, this.banner, this.floats, this.flash);
  }

  update(state: HudState) {
    if (state.score !== this.last.score) {
      this.last.score = state.score;
      this.score.textContent = String(state.score).padStart(6, '0');
    }
    if (state.wave !== this.last.wave) {
      this.last.wave = state.wave;
      this.waveLine.textContent = state.mode === 'campaign'
        ? `WAVE ${String(state.wave).padStart(2, '0')}/${CAMPAIGN_WAVES}`
        : `WAVE ${String(state.wave).padStart(2, '0')}`;
    }
    if (state.lives !== this.last.lives) {
      this.last.lives = state.lives;
      this.livesLine.textContent = state.lives > 0 ? '▲ '.repeat(state.lives).trim() : '—';
    }
    if (state.weapon !== this.last.weapon) {
      this.last.weapon = state.weapon;
      this.pwrLine.textContent = `PWR ${'▮'.repeat(state.weapon)}${'▯'.repeat(TUNING.maxWeapon - state.weapon)}`;
    }
    if (state.combo !== this.last.combo) {
      this.last.combo = state.combo;
      this.combo.hidden = state.combo <= 1;
      this.comboValue.textContent = `×${state.combo}`;
    }

    // 护盾剩余秒数每帧都在变,这里按"文案整体"比对,秒数只精确到 0.1
    const shieldText = state.shield
      ? `SHIELD ×${state.shield.charges}${state.shield.seconds >= 0 ? ` · ${state.shield.seconds.toFixed(1)}s` : ''}`
      : '';
    if (shieldText !== this.last.shield) {
      this.last.shield = shieldText;
      this.shield.hidden = !shieldText;
      this.shield.textContent = shieldText;
    }

    const bossKey = state.boss ? `${state.boss.name}|${state.boss.phase}` : '';
    if (bossKey !== this.last.boss) {
      this.last.boss = bossKey;
      this.bossBox.hidden = !state.boss;
      if (state.boss) {
        this.bossName.textContent = state.boss.name;
        this.bossPhase.textContent = `PHASE ${state.boss.phase}`;
        this.bossFill.style.background = state.boss.phase === 1 ? '#ff4b52'
          : state.boss.phase === 2 ? '#ff8a3d' : '#ffd23d';
      }
    }
    const ratio = state.boss ? Math.round(state.boss.ratio * 200) / 200 : -1;
    if (ratio !== this.last.ratio) {
      this.last.ratio = ratio;
      if (state.boss) this.bossFill.style.transform = `scaleX(${Math.max(0, state.boss.ratio)})`;
    }
  }

  showBanner(text: string, boss: boolean) {
    this.banner.textContent = text;
    this.banner.className = `ns3-banner${boss ? ' boss' : ''}`;
    // 强制回流一次,否则连续两波的动画不会重播
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  showFloat(text: string, tone: 'good' | 'bad') {
    const node = el('div', `ns3-float${tone === 'bad' ? ' bad' : ''}`, text);
    this.floats.append(node);
    window.setTimeout(() => node.remove(), 900);
  }

  showFlash(strength: number) {
    this.flash.style.opacity = String(strength);
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => { this.flash.style.opacity = '0'; }, 30);
  }

  dispose() {
    window.clearTimeout(this.flashTimer);
    this.root.remove();
  }
}
