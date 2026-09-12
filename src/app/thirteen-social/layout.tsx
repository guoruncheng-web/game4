import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  manifest: '/thirteen-social/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Thirteen Social',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#271444',
  viewportFit: 'cover',
  userScalable: false,
};

export default function ThirteenSocialLayout({ children }: LayoutProps<'/thirteen-social'>) {
  return children;
}
