'use client';

import { API_UID_HEADER, type GameCredentials } from './api-contract';
export { withGameCredentials } from './api-contract';

export type ApiCredentials = GameCredentials;

let activeCredentials: ApiCredentials | null = null;

export function setApiCredentials(credentials: ApiCredentials | null) {
  activeCredentials = credentials;
}

export function getApiCredentials(): ApiCredentials | null {
  return activeCredentials;
}

/** PWA 受保护接口的唯一 fetch 入口。 */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (activeCredentials) {
    headers.set(API_UID_HEADER, String(activeCredentials.uid));
    headers.set('Authorization', `Bearer ${activeCredentials.token}`);
  }
  return fetch(input, { ...init, headers });
}
