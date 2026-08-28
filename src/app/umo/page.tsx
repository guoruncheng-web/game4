'use client';

import CocosCanvas from '@/components/CocosCanvas';

export default function UmoPage() {
  return (
    <main className="fixed inset-0 h-dvh w-full overflow-hidden bg-[#f5efe3]">
      <CocosCanvas
        src="/umo/game/index.html?umoTransport=ws"
        title="UMO"
        gameId="umo"
        backdropClassName="bg-[#f5efe3]"
        readyOnLoad
        showLoadingOverlay={false}
      />
    </main>
  );
}
