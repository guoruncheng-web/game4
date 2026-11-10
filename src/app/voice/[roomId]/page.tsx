import VoiceRoomPage from '@/components/VoiceRoomPage';
import type { Viewport } from 'next';

export const viewport: Viewport = { themeColor: '#6400ad' };

export default async function Page({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <VoiceRoomPage roomId={roomId} />;
}
