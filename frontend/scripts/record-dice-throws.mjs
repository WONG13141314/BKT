// Records the dice throws once, so the game replays them instead of running a
// physics engine in the browser. Every screen then shows the same bounces at
// the same speed, whatever the computer.
//
//   npm run dice:record --workspace=frontend
//
// The world below matches the live dice world the game used before (Rapier
// through @react-three/rapier): gravity, time step, colliders, damping and the
// solver settings that library passes. Change a throw here, then re-run.
import RAPIER from '@dimforge/rapier3d-compat';
import { Euler, Quaternion, Vector3 } from 'three';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/features/game/components/dice.recordings.ts', import.meta.url));
const FPS = 60;
const MAX_FRAMES = 600;
/** Both dice must read correctly and stay still this long (200 ms) before the throw ends. */
const SETTLE_HOLD_FRAMES = 12;
/** Positions are stored as 16-bit integers in 1/4096ths of a unit (±8 units). */
const POSITION_SCALE = 4096;
const FLOOR_Y = -0.04;
const HALF = 0.55;

// [start position, start rotation (Euler XYZ), linear velocity, angular velocity, local face that lands up]
const THROWS = [
  [
    [[-1.3818688, 3.5003472, 0.719249], [3.8682312, 5.8374114, 3.7302447], [0.3979963, -0.580113, -0.7023503], [8.1025603, -11.8302491, 10.7847411], [-1, 0, 0]],
    [[1.4219619, 3.8651852, -0.5684839], [5.3313668, 5.6049791, 0.2583775], [-0.5792593, -0.7170184, 0.3502029], [-11.0253926, 10.4540548, -9.2626772], [0, 0, -1]],
  ],
  [
    [[-1.4546099, 3.9043296, 0.6624807], [5.2593357, 3.0038128, 5.7064453], [0.8344198, 0.1325152, -0.7180073], [8.9536393, -11.6493549, 8.7436225], [0, 0, -1]],
    [[1.2968192, 4.0199533, -0.6328753], [2.939312, 6.0180981, 0.3811726], [-0.7166407, -0.2548289, 0.4827882], [-10.582754, 13.969263, -8.3515632], [0, -1, 0]],
  ],
  [
    [[-1.3258683, 3.7135133, 0.7284304], [2.0745085, 2.6738303, 2.2183285], [0.6457661, -0.6431021, -0.657704], [10.9294134, -8.951843, 12.7167975], [1, 0, 0]],
    [[1.2632959, 3.9337342, -0.665725], [4.9439962, 3.3804662, 2.642416], [-0.7254075, -0.6010145, 0.3635477], [-12.8907648, 13.2511223, -7.5115277], [-1, 0, 0]],
  ],
  [
    [[-1.2722482, 3.5196655, 0.6573309], [6.2617627, 6.1098857, 4.4231121], [0.4965396, 0.1259225, -0.5658845], [10.5476805, -10.802207, 8.8427219], [1, 0, 0]],
    [[1.3757717, 3.4721556, -0.611719], [1.2795907, 5.0369301, 2.0456427], [-0.3544153, -0.0390702, 0.4051327], [-9.5643545, 13.5567194, -9.4461566], [0, -1, 0]],
  ],
  [
    [[-1.357944, 3.699252, 0.6477233], [1.7717585, 4.1448493, 2.8810116], [0.7327184, -0.668789, -0.4186566], [10.5163695, -12.4854962, 9.2683801], [-1, 0, 0]],
    [[1.4328323, 3.6257194, -0.4714289], [1.5342938, 2.3722966, 4.2104914], [-0.7534923, -0.7538094, 0.6889757], [-8.5626031, 12.8902522, -9.8935745], [-1, 0, 0]],
  ],
  [
    [[-1.2760358, 3.6834463, 0.6024781], [3.5254961, 5.8063026, 0.6278672], [0.7634536, -0.6123592, -0.5017947], [12.7269401, -11.2924967, 7.1517252], [-1, 0, 0]],
    [[1.3865089, 3.7986135, -0.5031369], [3.5920304, 1.7093536, 2.3192509], [-0.6725137, 0.0730528, 0.4130332], [-14.876604, 11.7497019, -9.1507361], [0, -1, 0]],
  ],
  [
    [[-1.2701906, 3.5675803, 0.4894982], [0.587497, 5.9637421, 1.3857922], [0.6570742, 0.031987, -0.5131271], [8.1499954, -10.9591223, 7.6026681], [-1, 0, 0]],
    [[1.4280067, 3.7735173, -0.6051834], [1.1781896, 5.1312859, 2.1969071], [-0.6136245, 0.0530471, 0.3906113], [-9.9041149, 10.5428699, -12.8718607], [-1, 0, 0]],
  ],
  [
    [[-1.4593626, 3.5223724, 0.4564413], [3.8896141, 2.8597503, 3.6419527], [0.7351497, -0.7099397, -0.4719034], [9.5181686, -9.9795203, 11.8782716], [0, 0, -1]],
    [[1.4071999, 3.8182943, -0.704576], [0.9858544, 4.5759693, 1.5517717], [-0.8848734, -0.1715146, 0.4474914], [-9.2940458, 14.6484862, -7.7513314], [-1, 0, 0]],
  ],
  [
    [[-1.4688713, 3.9712373, 0.543233], [5.5935511, 2.7619993, 5.3784236], [0.809104, -0.3720523, -0.7103688], [10.2476577, -9.0397429, 11.2842475], [0, 1, 0]],
    [[1.2750762, 4.0213359, -0.5302974], [3.854345, 0.7482328, 3.0926566], [-0.494058, -0.3547834, 0.4457795], [-13.5143823, 11.7032223, -9.1977174], [0, -1, 0]],
  ],
  [
    [[-1.2913989, 3.6423231, 0.6447881], [3.2412312, 5.2874868, 3.1470963], [0.3928423, -0.2610005, -0.7512406], [9.1601537, -14.2382336, 12.8783618], [0, 0, 1]],
    [[1.3432531, 3.9850414, -0.5857995], [1.2747229, 6.226105, 3.3581611], [-0.6313668, 0.1291981, 0.6013525], [-8.5794203, 8.8168752, -11.4381026], [0, 0, -1]],
  ],
];

await RAPIER.init();

function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  world.timestep = 1 / FPS;
  // The settings @react-three/rapier's <Physics> applied by default.
  const p = world.integrationParameters;
  p.numSolverIterations = 4;
  p.numInternalPgsIterations = 1;
  p.normalizedAllowedLinearError = 0.001;
  p.minIslandSize = 128;
  p.maxCcdSubsteps = 1;
  p.normalizedPredictionDistance = 0.002;
  p.contact_natural_frequency = 30;
  world.lengthUnit = 1;

  const tray = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const wall = (half, at, restitution, friction) => {
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(...half).setTranslation(...at), tray);
    collider.setRestitution(restitution);
    if (friction !== undefined) collider.setFriction(friction);
  };
  wall([3.7, 0.08, 2.3], [0, FLOOR_Y - 0.08, 0], 0.28, 0.86);
  wall([0.08, 0.72, 2.3], [-3.78, 0.6, 0], 0.42);
  wall([0.08, 0.72, 2.3], [3.78, 0.6, 0], 0.42);
  wall([3.7, 0.72, 0.08], [0, 0.6, -2.38], 0.42);
  wall([3.7, 0.72, 0.08], [0, 0.6, 2.38], 0.42);
  return world;
}

function record(throwIndex) {
  const world = makeWorld();
  const dice = THROWS[throwIndex].map(([position, rotation, linear, angular, top]) => {
    const turn = new Quaternion().setFromEuler(new Euler(...rotation));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...position)
      .setRotation({ x: turn.x, y: turn.y, z: turn.z, w: turn.w })
      .setCanSleep(true)
      .setCcdEnabled(true));
    body.setLinearDamping(0.28);
    body.setAngularDamping(0.34);
    body.setLinvel({ x: linear[0], y: linear[1], z: linear[2] }, true);
    body.setAngvel({ x: angular[0], y: angular[1], z: angular[2] }, true);
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(HALF, HALF, HALF), body);
    collider.setFriction(0.82);
    collider.setRestitution(0.48);
    collider.setDensity(1.1);
    return { body, top: new Vector3(...top) };
  });

  const samples = [];
  const sample = () => {
    for (const { body } of dice) {
      const t = body.translation();
      const r = body.rotation();
      samples.push(
        Math.round(t.x * POSITION_SCALE), Math.round(t.y * POSITION_SCALE), Math.round(t.z * POSITION_SCALE),
        Math.round(r.x * 32767), Math.round(r.y * 32767), Math.round(r.z * 32767), Math.round(r.w * 32767),
      );
    }
  };
  const readable = ({ body, top }) => {
    const l = body.linvel();
    const a = body.angvel();
    const r = body.rotation();
    const up = top.clone().applyQuaternion(new Quaternion(r.x, r.y, r.z, r.w));
    return Math.hypot(l.x, l.y, l.z) < 0.06 && Math.hypot(a.x, a.y, a.z) < 0.08 && up.y > 0.999;
  };

  sample();
  let still = 0;
  let frames = 1;
  while (still < SETTLE_HOLD_FRAMES) {
    if (frames >= MAX_FRAMES) throw new Error(`Throw ${throwIndex} never settled on its planned faces`);
    world.step();
    sample();
    frames++;
    still = dice.every(readable) ? still + 1 : 0;
  }
  for (const value of samples) {
    if (value < -32768 || value > 32767) throw new Error(`Throw ${throwIndex} left the recordable range`);
  }
  world.free();
  return {
    frames,
    top: THROWS[throwIndex].map((die) => die[4]),
    data: Buffer.from(new Int16Array(samples).buffer).toString('base64'),
  };
}

const recordings = THROWS.map((_, index) => record(index));
const body = recordings.map((item) =>
  `  { frames: ${item.frames}, top: ${JSON.stringify(item.top)}, data: '${item.data}' },`).join('\n');
await writeFile(OUT, `// Generated by frontend/scripts/record-dice-throws.mjs. Do not edit by hand.
// Each throw holds both dice, every 1/${FPS} s: x, y, z (1/${POSITION_SCALE} units)
// and a rotation quaternion (1/32767), as little-endian 16-bit integers.
import type { Vec3Tuple } from './dice.throw';

export const RECORDED_FPS = ${FPS};
export const POSITION_SCALE = ${POSITION_SCALE};

export interface DiceRecording {
  frames: number;
  /** The local face of each die that lands uppermost. */
  top: [Vec3Tuple, Vec3Tuple];
  data: string;
}

export const DICE_RECORDINGS: DiceRecording[] = [
${body}
];
`);
for (const [index, item] of recordings.entries()) {
  console.log(`Throw ${index}: ${item.frames} frames (${(item.frames / FPS).toFixed(2)} s)`);
}
console.log(`Wrote ${OUT}`);
