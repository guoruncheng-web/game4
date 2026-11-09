/** 临时内测期间关闭公开注册；恢复时须同时开启个人后端的对应开关。 */
export const PUBLIC_REGISTRATION_ENABLED = process.env.NEXT_PUBLIC_PWA_REGISTRATION_ENABLED === '1';

export function registrationMode<T extends 'register' | 'login' | 'account'>(mode: T): T | 'login' {
  return mode === 'register' && !PUBLIC_REGISTRATION_ENABLED ? 'login' : mode;
}
