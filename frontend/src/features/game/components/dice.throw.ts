import { Euler, Quaternion, Vector3 } from 'three';

export type Vec3Tuple = [number, number, number];
export type QuaternionTuple = [number, number, number, number];

export interface PlannedDie {
  value: number;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  linearVelocity: Vec3Tuple;
  angularVelocity: Vec3Tuple;
  modelRotation: QuaternionTuple;
  isStatic?: boolean;
}

export interface ThrowPlan {
  id: number;
  seed: number;
  dice: PlannedDie[];
}

const FACE_NORMALS: Record<number, Vector3> = {
  1: new Vector3(0, 1, 0), 6: new Vector3(0, -1, 0),
  2: new Vector3(1, 0, 0), 5: new Vector3(-1, 0, 0),
  3: new Vector3(0, 0, 1), 4: new Vector3(0, 0, -1),
};

// Both dice are simulated together ahead of time with the same collider,
// gravity and damping settings as PhysicsDice. The fifth vector is the local
// face that lands uppermost. Keep these trajectories in sync with that world.
// This avoids constructing and stepping trial physics worlds on the UI thread.
type ThrowTemplate = [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple][];
const THROW_TEMPLATES: ThrowTemplate[] = [
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

export function buildThrowPlan(rollId: number, seed: number, values: number[]): ThrowPlan {
  const template = THROW_TEMPLATES[seed % THROW_TEMPLATES.length];
  return {
    id: rollId,
    seed,
    dice: values.map((value, index) => {
      const [position, rotation, linearVelocity, angularVelocity, topNormal] = template[index];
      return {
        value, position, rotation, linearVelocity, angularVelocity,
        modelRotation: quaternionTuple(new Quaternion().setFromUnitVectors(FACE_NORMALS[value], new Vector3(...topNormal))),
      };
    }),
  };
}

export function restingRotation(value: number, yaw: number): QuaternionTuple {
  const base = new Quaternion();
  if (value === 6) base.setFromEuler(new Euler(Math.PI, 0, 0));
  else if (value === 2) base.setFromEuler(new Euler(0, 0, Math.PI / 2));
  else if (value === 5) base.setFromEuler(new Euler(0, 0, -Math.PI / 2));
  else if (value === 3) base.setFromEuler(new Euler(-Math.PI / 2, 0, 0));
  else if (value === 4) base.setFromEuler(new Euler(Math.PI / 2, 0, 0));
  return quaternionTuple(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw).multiply(base));
}

function quaternionTuple(quaternion: Quaternion): QuaternionTuple {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}
