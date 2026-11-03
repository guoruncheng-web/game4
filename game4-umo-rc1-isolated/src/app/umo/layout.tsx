import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    title: 'UMO',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#040816',
  viewportFit: 'cover',
  userScalable: false,
};

export default function UmoLayout({ children }: LayoutProps<'/umo'>) {
  return children;
}
