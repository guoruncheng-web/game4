'use client';

import CocosCanvas from '@/components/CocosCanvas';

export default function ThirteenSocialPage() {
  return (
    <main className="fixed inset-0 h-dvh w-full overflow-hidden bg-[#271444]">
      <CocosCanvas
        src="/thirteen-social/game/index.html"
        title="Thirteen Social"
        gameId="thirteen-social"
        backdropClassName="bg-[#271444]"
        readyOnLoad
        showLoadingOverlay={false}
      />
    </main>
  );
}
