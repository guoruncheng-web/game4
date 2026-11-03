export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 600;
export const WORLD_WIDTH = 2560;
/** 玩家可以坠落到画面下方多远才判定为掉出关卡 */
export const FALL_MARGIN = 260;

export const PLAYER = {
  speed: 280,
  accel: 2600,
  drag: 2000,
  jump: 560,
  gravity: 1500,
  /** 离开平台后仍可起跳的宽限时间(毫秒) */
  coyoteMs: 110,
  /** 落地前提前按跳跃的缓冲时间(毫秒) */
  bufferMs: 130,
  maxJumps: 2,
};
