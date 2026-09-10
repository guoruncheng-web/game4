'use client';

import dynamic from 'next/dynamic';
import GameShell from '@/components/GameShell';
import GameLoading from '@/components/GameLoading';
import { getGame } from '@/games/registry';

const meta = getGame('star-runner')!;

const PhaserCanvas = dynamic(() => import('@/components/PhaserCanvas'), {
  ssr: false,
  loading: () => <GameLoading />,
});

export default function Game1Page() {
  return (
    <GameShell title={meta.title} subtitle={meta.controls}>
      <PhaserCanvas load={() => import('@/games/star-runner')} />
      <footer className="text-xs text-slate-500">
        全部贴图与音效在运行时生成,不依赖任何外部资源文件。
      </footer>
    </GameShell>
  );
}

