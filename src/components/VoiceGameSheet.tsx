'use client';

import { useEffect, useRef, useState } from 'react';
import { GAMES } from '@/games/registry';
import { apiFetch, withGameCredentials } from '@/lib/api-client';
import { useAuth } from './AuthProvider';
import { cardStyle } from './ClubArt';

type AvailableGame = { slug: string; enabled: boolean; sortOrder?: number };

/** 游戏在独立 iframe 中运行，关闭时卸载，外层房间保持挂载。 */
export default function VoiceGameSheet({ onClose }: { onClose: () => void }) {
  const { credentials } = useAuth();
  const dialog = useRef<HTMLElement>(null);
  const [games, setGames] = useState<AvailableGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/games', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('游戏列表暂时加载失败');
        const data = await response.json() as { games?: AvailableGame[] };
        if (!Array.isArray(data.games)) throw new Error('游戏列表暂时加载失败');
        if (!controller.signal.aborted) setGames(data.games.filter(game => game.enabled && GAMES.some(meta => meta.slug === game.slug)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      })
      .catch(() => { if (!controller.signal.aborted) setError('游戏列表暂时加载失败，请重试'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    if (activeGame) closeButton.current?.focus();
  }, [activeGame]);

  return <div className={`voice-sheet-backdrop ${activeGame ? 'voice-game-window-backdrop' : ''}`} onClick={event => { if (!activeGame && event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className={`voice-action-sheet ${activeGame ? 'voice-game-window' : 'voice-game-picker-sheet'}`} role="dialog" aria-modal="true" aria-labelledby="voice-game-picker-title" tabIndex={-1} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], iframe') ?? []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header><h2 id="voice-game-picker-title">{activeGame ? GAMES.find(game => game.slug === activeGame)?.title : '游戏列表'}</h2><button ref={closeButton} type="button" aria-label={activeGame ? '关闭游戏，返回房间' : '关闭游戏列表'} onClick={onClose}>×</button></header>
      {activeGame ? <iframe key={activeGame} className="voice-game-frame" src={withGameCredentials(`/${activeGame}`, credentials)} title={GAMES.find(game => game.slug === activeGame)?.title ?? '房间游戏'} allow="autoplay; gamepad" /> : <>
      <p className="voice-sheet-help">选一个游戏，开启新的乐趣</p>
      {loading ? <p className="voice-sheet-empty" role="status">正在加载游戏…</p> : error ? <div className="voice-game-picker-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setError(''); setAttempt(value => value + 1); }}>重新加载</button></div> : games.length === 0 ? <p className="voice-sheet-empty">暂无可玩的游戏</p> : <div className="voice-game-picker-list">{games.map(game => {
        const meta = GAMES.find(item => item.slug === game.slug)!;
        return <button key={game.slug} type="button" onClick={() => setActiveGame(game.slug)} className="voice-game-picker-card"><span className="voice-game-picker-art" style={cardStyle(game.slug)} aria-hidden="true" /><span><b>{meta.title}</b><small>{meta.tagline}</small></span><em>去玩 ›</em></button>;
      })}</div>}
      </>}
    </section>
  </div>;
}
