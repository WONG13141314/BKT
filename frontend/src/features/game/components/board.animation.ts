// Keep the server's 12-second movement fallback longer than a complete visual roll.
export const DICE_ROLL_LIMIT_MS = 4500;
export const DICE_SETTLE_HOLD_MS = 200;
export const TOKEN_STEP_MS = 280;
export const TOKEN_HOP_SECONDS = .22;
// Pause on "Ke Penjara" before the token jumps to Penjara (well under the bot's 800 ms END_TURN delay).
export const JAIL_TRANSFER_HOLD_MS = 450;
// A 3D scene that loads quickly replaces an empty placeholder instead of flashing the 2D fallback first.
export const SCENE_FALLBACK_DELAY_MS = 1500;
