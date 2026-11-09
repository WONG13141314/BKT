// Keep the server's 12-second movement fallback longer than a complete visual roll.
export const DICE_ROLL_LIMIT_MS = 4500;
// A readable hop per space; a full 12-space walk still ends well inside the server fallback.
export const TOKEN_STEP_MS = 340;
export const TOKEN_HOP_SECONDS = .26;
// Pause on "Ke Penjara" before the token jumps to Penjara (well under the bot's 800 ms END_TURN delay).
export const JAIL_TRANSFER_HOLD_MS = 450;
// A 3D scene that loads quickly replaces an empty placeholder instead of flashing the 2D fallback first.
export const SCENE_FALLBACK_DELAY_MS = 1500;
// The table stays hidden until the 3D dice and tokens have drawn, at most this long.
export const BOARD_REVEAL_LIMIT_MS = 6000;

// ---- Shared by the 3D table and the flat board, so both play at one pace ----

// Card moves and jail transfers arc straight across instead of hopping space by space.
export const TOKEN_JUMP_SECONDS = .55;
export const TOKEN_HOP_HEIGHT = .45;
export const TOKEN_JUMP_HEIGHT = 1.6;
// A small hello hop marks the start of a player's turn.
export const TURN_HOP = { seconds: .34, height: .25 } as const;
export const LANDING_SQUASH_MS = 160;
// How far, in board units, the landed or chosen space rises.
export const SPACE_LIFT = .16;
export const STEP_FLASH_SECONDS = .52;
// A Challenge Card comes off the deck, turns over, then comes up to the viewer.
export const CARD_DRAW_SECONDS = { lift: .35, flip: .5, present: .6 } as const;
/** How much of the screen the presented card fills, and how far above centre it sits. */
export const CARD_PRESENT = { height: .5, width: .8, raise: .01 } as const;

function smoothstep(t: number): number {
  const s = Math.min(1, Math.max(0, t));
  return s * s * (3 - 2 * s);
}

/** A hop at progress `t` (0–1): how far along it is, how high, and how stretched. */
export function hopFrame(t: number, height: number) {
  const arc = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
  return { along: smoothstep(t), lift: arc * height, stretch: 1 + .07 * arc };
}

/** The brief squash after touching down, `sinceMs` after landing (1 when over). */
export function landingSquash(sinceMs: number): number {
  const s = sinceMs / LANDING_SQUASH_MS;
  return s >= 0 && s < 1 ? 1 - .09 * Math.sin(Math.PI * s) : 1;
}

/** The card-draw timeline `seconds` after the draw starts, each part 0–1. */
export function cardDrawFrame(seconds: number) {
  const { lift, flip, present } = CARD_DRAW_SECONDS;
  const span = (from: number, to: number) => smoothstep((seconds - from) / (to - from));
  return {
    lift: span(0, lift),
    over: span(lift * .6, lift + flip),
    present: span(lift + flip, lift + flip + present),
    done: seconds >= lift + flip + present,
  };
}

/**
 * One step of a critically damped spring: the fastest approach to `goal`
 * without overshoot, keeping velocity across changes of goal so a camera
 * never jerks when the moment changes.
 */
export function springStep(value: number, velocity: number, goal: number, stiffness: number, dt: number): [number, number] {
  const decay = Math.exp(-stiffness * dt);
  const offset = value - goal;
  const carry = (velocity + stiffness * offset) * dt;
  return [goal + (offset + carry) * decay, (velocity - stiffness * carry) * decay];
}

/** How quickly the camera settles into each moment (higher is faster), on both boards. */
export const CAMERA_STIFFNESS = { follow: 7.5, landing: 8.5, dice: 4, overview: 2.7, deck: 4.5 } as const;
