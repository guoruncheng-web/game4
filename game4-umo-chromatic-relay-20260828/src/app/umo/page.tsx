'use client';

import CocosCanvas from '@/components/CocosCanvas';

export default function UmoPage() {
  return (
    <main className="fixed inset-0 h-dvh w-full overflow-hidden bg-[#040816]">
      <CocosCanvas
        src="/umo/game/index.html?umoTransport=ws"
        title="UMO"
        gameId="umo"
        readyOnLoad
        showLoadingOverlay={false}
      />
    </main>
  );
}
