import VoiceRoomPage from '@/components/VoiceRoomPage';

export default async function Page({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <VoiceRoomPage roomId={roomId} />;
}
