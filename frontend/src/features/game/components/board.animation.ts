// Keep the server's 12-second movement fallback longer than a complete visual roll.
export const DICE_ROLL_LIMIT_MS = 4500;
export const DICE_SETTLE_HOLD_MS = 200;
// A readable hop per space; a full 12-space walk still ends well inside the server fallback.
export const TOKEN_STEP_MS = 340;
export const TOKEN_HOP_SECONDS = .26;
// Pause on "Ke Penjara" before the token jumps to Penjara (well under the bot's 800 ms END_TURN delay).
export const JAIL_TRANSFER_HOLD_MS = 450;
// A 3D scene that loads quickly replaces an empty placeholder instead of flashing the 2D fallback first.
export const SCENE_FALLBACK_DELAY_MS = 1500;
// The table stays hidden until the 3D dice and tokens have drawn, at most this long.
export const BOARD_REVEAL_LIMIT_MS = 6000;
