import type { Viewport } from 'next';
import type { ReactNode } from 'react';

// 房间与星空背景共用状态栏底色，顶部内容在房间内单独避让安全区。
export const viewport: Viewport = {
  themeColor: '#121826',
  viewportFit: 'cover',
};

export default function VoiceRoomLayout({ children }: { children: ReactNode }) {
  return children;
}
