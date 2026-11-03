import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Chặt Heo! 西贡牌局',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#061f25',
  viewportFit: 'cover',
};

export default function ThirteenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
