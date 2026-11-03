import {
  CAMPAIGN_WAVES, DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId, type GameMode,
} from '../config';
import { getVolume, isMuted, setMuted, setVolume, sfx } from '../sfx';
import { bestScore, clearRecords, loadScores, loadSettings, saveSettings } from '../storage';
import { el } from './style';

/** 所有弹层共用的外壳:一层半透明底 + 一块霓虹面板 */
function screen() {
  const root = el('div', 'ns3-screen');
  const panel = el('div', 'ns3-panel');
  root.append(panel);
  return { root, panel };
}

function button(label: string, onClick: () => void, ghost = false) {
  const node = el('button', `ns3-btn${ghost ? ' ghost' : ''}`, label);
  node.addEventListener('click', () => { sfx.ui(); onClick(); });
  return node;
}

export function loadingScreen() {
  const { root, panel } = screen();
  const fill = el('div', 'ns3-load-fill');
  const track = el('div', 'ns3-load-track');
  const status = el('div', 'ns3-note', '正在装配战机…');
  track.append(fill);
  panel.append(el('div', 'ns3-title', 'NEON STRIKE'), el('div', 'ns3-sub', '星门防卫协议 // BOOT'), track, status);
  return {
    root,
    progress(done: number, total: number) {
      fill.style.width = `${Math.round((done / total) * 100)}%`;
    },
    fail(message: string) {
      status.textContent = message;
    },
  };
}

export function menuScreen(onStart: (mode: GameMode, difficulty: DifficultyId) => void) {
  const settings = loadSettings();
  let difficulty = settings.difficulty;
  const { root, panel } = screen();

  const hint = el('div', 'ns3-note', DIFFICULTIES[difficulty].hint);
  const seg = el('div', 'ns3-seg');
  const buttons = DIFFICULTY_ORDER.map((id) => {
    const node = el('button', '', DIFFICULTIES[id].label);
    node.setAttribute('aria-pressed', String(id === difficulty));
    node.addEventListener('click', () => {
      sfx.ui();
      difficulty = id;
      saveSettings({ difficulty: id });
      hint.textContent = DIFFICULTIES[id].hint;
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(DIFFICULTY_ORDER[i] === id)));
    });
    return node;
  });
  seg.append(...buttons);

  const endless = button('无尽模式', () => onStart('endless', difficulty), true);
  if (!settings.endlessUnlocked) {
    endless.disabled = true;
    endless.textContent = '无尽模式 · 通关战役解锁';
  }

  // 音量:静音开关和滑杆共用全站的存储 key,在任何一款游戏里改都通用
  const volRow = el('div', 'ns3-row');
  const mute = el('button', 'ns3-btn ghost', isMuted() ? '🔇' : '🔊');
  mute.style.width = 'auto';
  mute.style.padding = '8px 14px';
  const slider = el('input', 'ns3-vol');
  slider.type = 'range';
  slider.min = '0'; slider.max = '1'; slider.step = '0.05';
  slider.value = String(getVolume());
  slider.addEventListener('input', () => setVolume(Number(slider.value)));
  mute.addEventListener('click', () => {
    const next = !isMuted();
    setMuted(next);
    mute.textContent = next ? '🔇' : '🔊';
    if (!next) sfx.ui();
  });
  volRow.append(mute, slider);

  const records = el('div', 'ns3-records');
  const paintRecords = () => {
    records.replaceChildren();
    const list = loadScores().slice(0, 4);
    if (!list.length) {
      records.append(el('div', '', '暂无战绩'));
      return;
    }
    for (const item of list) {
      const row = el('div');
      row.append(
        el('span', '', `${item.mode === 'endless' ? '无尽' : '战役'} · ${DIFFICULTIES[item.difficulty]?.label ?? '王牌'}`),
        el('span', '', `${String(item.score).padStart(6, '0')} · W${item.wave}`),
      );
      records.append(row);
    }
  };
  paintRecords();

  panel.append(
    el('div', 'ns3-title', 'NEON STRIKE'),
    el('div', 'ns3-sub', '星门防卫协议 // ONLINE'),
    el('div', 'ns3-note', `最高分 ${String(bestScore()).padStart(6, '0')}`),
    el('div', 'ns3-label', '难度'),
    seg,
    hint,
    button('开始战役', () => onStart('campaign', difficulty)),
    endless,
    volRow,
    records,
    button('清空本地战绩', () => { clearRecords(); paintRecords(); }, true),
    el('div', 'ns3-note', '拖动画面或方向键走位 · 自动开火 · P / ESC 暂停'),
  );
  return { root };
}

export function pauseScreen(opts: {
  wave: number; score: number;
  onResume: () => void; onRestart: () => void; onMenu: () => void;
}) {
  const { root, panel } = screen();
  panel.append(
    el('div', 'ns3-title', '暂停'),
    el('div', 'ns3-note', `第 ${opts.wave} 波 · 当前得分 ${String(opts.score).padStart(6, '0')}`),
    button('继续战斗', opts.onResume),
    button('重新出击', opts.onRestart, true),
    button('返回菜单', opts.onMenu, true),
  );
  return { root };
}

export function gameOverScreen(data: {
  score: number; wave: number; best: number; rank: number; victory: boolean;
  mode: GameMode; difficulty: DifficultyId;
  onAgain: () => void; onMenu: () => void;
}) {
  const { root, panel } = screen();
  const title = el('div', 'ns3-title', data.victory ? '任务完成' : '任务结束');
  title.style.color = data.victory ? '#7dffc0' : '#ff625d';

  const newBest = data.score > 0 && data.score >= data.best;
  const waveLabel = data.mode === 'campaign' ? `${data.wave}/${CAMPAIGN_WAVES}` : String(data.wave);

  panel.append(
    title,
    el('div', 'ns3-note', data.victory ? '星门守住了 · 无尽模式已解锁' : `在第 ${data.wave} 波被击落`),
    el('div', 'ns3-label', 'FINAL SCORE'),
    el('div', 'ns3-big ns3-mono', String(data.score).padStart(6, '0')),
    el('div', 'ns3-note',
      `${data.mode === 'endless' ? '无尽' : '战役'} · ${DIFFICULTIES[data.difficulty]?.label ?? '王牌'} · 波次 ${waveLabel}`),
    el('div', 'ns3-note', newBest ? '★ 新纪录 ★' : `最高分 ${String(data.best).padStart(6, '0')}`),
  );
  if (data.rank > 0) panel.append(el('div', 'ns3-note', `本地战绩榜 第 ${data.rank} 名`));
  panel.append(button('再次出击', data.onAgain), button('返回菜单', data.onMenu, true));
  return { root };
}
