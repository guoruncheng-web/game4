import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  manifest: '/umo/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'UMO',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#f5efe3',
  viewportFit: 'cover',
  userScalable: false,
};

export default function UmoLayout({ children }: LayoutProps<'/umo'>) {
  return children;
}
