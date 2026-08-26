import { ROOM_PROTOCOL_VERSION, type ClientCommand } from './authoritative-room';

export type ThirteenClientMessage =
  | { readonly t: 'thirteen:hello'; readonly v: typeof ROOM_PROTOCOL_VERSION }
  | { readonly t: 'thirteen:create-private'; readonly v: typeof ROOM_PROTOCOL_VERSION }
  | { readonly t: 'thirteen:join-private'; readonly v: typeof ROOM_PROTOCOL_VERSION; readonly code: string }
  | { readonly t: 'thirteen:matchmake'; readonly v: typeof ROOM_PROTOCOL_VERSION }
  | { readonly t: 'thirteen:leave'; readonly v: typeof ROOM_PROTOCOL_VERSION }
  | { readonly t: 'thirteen:rematch'; readonly v: typeof ROOM_PROTOCOL_VERSION }
  | { readonly t: 'thirteen:snapshot'; readonly v: typeof ROOM_PROTOCOL_VERSION }
  | { readonly t: 'thirteen:command'; readonly v: typeof ROOM_PROTOCOL_VERSION; readonly command: ClientCommand };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseThirteenClientMessage(value: unknown): ThirteenClientMessage | null {
  if (!isRecord(value) || value.v !== ROOM_PROTOCOL_VERSION || typeof value.t !== 'string') return null;
  switch (value.t) {
    case 'thirteen:hello':
    case 'thirteen:create-private':
    case 'thirteen:matchmake':
    case 'thirteen:leave':
    case 'thirteen:rematch':
    case 'thirteen:snapshot':
      return value as ThirteenClientMessage;
    case 'thirteen:join-private':
      return typeof value.code === 'string' ? value as ThirteenClientMessage : null;
    case 'thirteen:command':
      return isRecord(value.command) ? value as unknown as ThirteenClientMessage : null;
    default:
      return null;
  }
}
