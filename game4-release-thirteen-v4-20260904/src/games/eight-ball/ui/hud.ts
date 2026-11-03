import type { Group, MatchState, Player } from '../rules';
import { remainingOf } from '../rules';
import type { Ball } from '../physics';
import { el } from './style';

export class Hud {
  readonly root = el('div', 'eb3-hud');
  readonly power = el('input', 'eb3-power');
  private readonly youGroup = el('div', 'eb3-group');
  private readonly cpuGroup = el('div', 'eb3-group');
  private readonly turn = el('div', 'eb3-turn');
  private readonly message = el('div', 'eb3-message');
  private readonly hint = el('div', 'eb3-hint', 'DRAG TABLE TO AIM · RELEASE POWER TO SHOOT');

  constructor(onMenu: () => void, onPower: (value: number) => void, onShoot: () => void) {
    const top = el('div', 'eb3-top');
    const you = el('div', 'eb3-player');
    you.append(el('div', 'eb3-name', 'YOU'), this.youGroup);
    const cpu = el('div', 'eb3-player cpu');
    cpu.append(el('div', 'eb3-name', 'CPU'), this.cpuGroup);
    top.append(you, this.turn, cpu);

    const menu = el('button', 'eb3-menu', 'MENU');
    menu.addEventListener('click', onMenu);
    const bottom = el('div', 'eb3-bottom');
    const powerRow = el('div', 'eb3-power-row');
    this.power.type = 'range'; this.power.min = '0'; this.power.max = '1'; this.power.step = '0.01'; this.power.value = '0';
    this.power.addEventListener('input', () => onPower(Number(this.power.value)));
    this.power.addEventListener('pointerup', onShoot);
    this.power.addEventListener('change', onShoot);
    powerRow.append(el('span', '', 'POWER'), this.power);
    bottom.append(this.message, powerRow, this.hint);
    this.root.append(top, menu, bottom);
  }

  update(state: MatchState, balls: Ball[]) {
    this.youGroup.textContent = this.groupLabel('you', state.groups.you, balls);
    this.cpuGroup.textContent = this.groupLabel('cpu', state.groups.cpu, balls);
    this.turn.textContent = state.turn === 'you' ? 'YOUR TURN' : 'CPU TURN';
  }

  setMessage(text: string, bad = false) {
    this.message.textContent = text;
    this.message.classList.toggle('bad', bad);
  }

  setMode(mode: 'placing' | 'aiming' | 'rolling' | 'cpu') {
    this.power.disabled = mode !== 'aiming';
    this.hint.textContent = mode === 'placing' ? 'BALL IN HAND · DRAG THE CUE BALL'
      : mode === 'aiming' ? 'DRAG TABLE TO AIM · RELEASE POWER TO SHOOT'
      : mode === 'cpu' ? 'CPU IS LINING UP…' : 'BALLS IN MOTION';
  }

  resetPower() { this.power.value = '0'; }

  toast(text: string) {
    const node = el('div', 'eb3-toast', text);
    this.root.append(node);
    window.setTimeout(() => node.remove(), 1400);
  }

  private groupLabel(_player: Player, group: Group | null, balls: Ball[]) {
    if (!group) return 'OPEN TABLE';
    const left = remainingOf(balls, group);
    return left ? `${group.toUpperCase()} · ${left} LEFT` : 'ON THE 8';
  }

  dispose() { this.root.remove(); }
}
