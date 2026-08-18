import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty } from '../config';
import { isMuted, setMuted, sfx } from '../sfx';
import { loadDifficulty, loadRecord, saveDifficulty, saveResult } from '../storage';
import type { Player } from '../rules';
import { el } from './style';

function shell() {
  const root = el('div', 'eb3-screen');
  const panel = el('div', 'eb3-panel');
  root.append(panel);
  return { root, panel };
}

function button(label: string, action: () => void, ghost = false) {
  const node = el('button', `eb3-btn${ghost ? ' ghost' : ''}`, label);
  node.addEventListener('click', () => { sfx.ui(); action(); });
  return node;
}

export function loadingScreen() {
  const { root, panel } = shell();
  panel.append(el('div', 'eb3-title', 'EIGHT BALL'), el('div', 'eb3-sub', 'POLISHING THE TABLE…'));
  return root;
}

export function menuScreen(onStart: (difficulty: Difficulty) => void) {
  const { root, panel } = shell();
  let difficulty = loadDifficulty() ?? 'pro';
  const hint = el('div', 'eb3-sub');
  const record = el('div', 'eb3-record');
  const seg = el('div', 'eb3-seg');
  const options = DIFFICULTY_ORDER.map((id) => {
    const node = el('button', '', DIFFICULTIES[id].label);
    node.addEventListener('click', () => {
      sfx.ui(); difficulty = id; saveDifficulty(id); paint();
    });
    return node;
  });
  seg.append(...options);
  const sound = button('', () => { setMuted(!isMuted()); paint(); }, true);
  const paint = () => {
    options.forEach((node, i) => node.setAttribute('aria-pressed', String(DIFFICULTY_ORDER[i] === difficulty)));
    hint.textContent = DIFFICULTIES[difficulty].hint;
    const stats = loadRecord(difficulty);
    record.textContent = stats.wins + stats.losses ? `${stats.wins}W · ${stats.losses}L · BEST STREAK ${stats.best}` : 'NO GAMES YET';
    sound.textContent = isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
  };
  panel.append(
    el('div', 'eb3-title', 'EIGHT BALL'),
    el('div', 'eb3-sub', 'RACK UP · RUN THE TABLE'),
    el('div', 'eb3-label', 'OPPONENT'), seg, hint, record,
    button('PLAY', () => onStart(difficulty)), sound,
    el('div', 'eb3-sub', 'DRAG THE TABLE TO AIM · SET POWER BELOW'),
  );
  paint();
  return root;
}

export function gameOverScreen(data: {
  winner: Player; reason: string; difficulty: Difficulty; potted: number;
  onAgain: () => void; onMenu: () => void;
}) {
  const { root, panel } = shell();
  const won = data.winner === 'you';
  const record = saveResult(data.difficulty, won);
  const title = el('div', 'eb3-title', won ? 'YOU WIN' : 'YOU LOSE');
  title.style.color = won ? '#e5b85c' : '#e06b5c';
  panel.append(
    title,
    el('div', 'eb3-sub', data.reason || (won ? 'CLEAN FINISH' : 'BETTER LUCK NEXT RACK')),
    el('div', 'eb3-record', `OPPONENT ${DIFFICULTIES[data.difficulty].label}`),
    el('div', 'eb3-record', `BALLS POTTED ${data.potted}`),
    el('div', 'eb3-record', `RECORD ${record.wins}W · ${record.losses}L`),
    el('div', 'eb3-record', `STREAK ${record.streak} · BEST ${record.best}`),
    button('REMATCH', data.onAgain), button('MENU', data.onMenu, true),
  );
  return root;
}
