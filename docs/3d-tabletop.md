# 3D tabletop

The game board is a fullscreen 3D table. The board, the eight pewter tokens, the
houses and the physics dice share one scene. The interface floats above it.
The server still decides every roll, move, price, question and deadline. The
3D layer only presents that state.

## The board

The board is a slim printed board in classic proportions: narrow spaces around
a large open centre. Spaces, the centre and the colour bands are printed with
unlit materials, so they keep the exact colours of the 2D board. Shadows from
pieces and dice fall on transparent shadow layers on top. The landed or chosen
space lifts out of the board like a card. It gets a gold edge and a warm glow,
and any pieces on it rise with it.

## The camera

The camera uses three ideas, and no one ever controls it:

- **A route field.** Directions on the table come from the level sets of a
  superellipse, which are rounded squares that follow the route. Its outward
  direction gives where the camera stands, and its tangent gives which way a
  piece faces. Both are exactly square to a side and turn smoothly as a piece
  nears a corner. No per-side or timing rules are needed.
- **Critically damped springs.** Every part of the shot (aim point, angle
  around the board, height and distance) eases towards its goal as fast as it
  can without overshooting. Velocity carries over when the goal changes, so
  moving from one moment to the next never jerks.
- **Destination-aware framing.** While a piece travels, the shot keeps it and
  the next spaces in view, with room ahead of it and a three-quarter angle
  trailing behind. Over the last three spaces it blends into the landing shot,
  so the camera is already framed when the piece touches down.

The moments: the overview while a player decides (square to their side), the
dice (higher, over the centre), following the move ("Tolak Towers · 2 of 6"),
and the landing ("Landed on Tolak Drive"). The landing view holds through the
decision and for 1.4 s into End Turn, then eases back to the overview.

Bots, autopilot seats and other players get the same camera.
With reduced motion, the camera stays on the overview and pieces barely hop. If
WebGL is missing or lost, the 2D board is used instead.

## Tokens

There are eight pieces: race car, top hat, battleship, boot, Scottie dog, cat,
rubber duck and wheelbarrow. Each player chooses one in the waiting room, and
no two players in a room can hold the same piece. Bots take free pieces. A
player's profile avatar is their default choice. Saved games that use the
original four token ids still load.

All models are built in code (`tabletop/TokenModels.tsx`) from extruded and
lathed profiles. There are no downloaded assets, so there are no third-party
licences to track.

The interface shows pictures of the same pewter models
(`frontend/public/tokens/*.png`) in the sign-in picker, the waiting room, the
player cards and the turn banner. After changing a model, render them again:

```powershell
npm run dev --workspace=frontend
npm run icons --workspace=frontend
```

To look at all eight under the game's lighting, run
`npm run dev --workspace=frontend` and open `/dev/lookbook.html`. Add
`?yaw=0.6` to change their angle.

## Code map

| File | Role |
| --- | --- |
| `components/Board.tsx` | Movement pacing and server acknowledgement (unchanged rules), choosing the camera moment, the route label and the 2D fallback |
| `components/tabletop/TabletopScene.tsx` | The scene: table, board, spaces, ownership strips, houses, card deck, pieces and their hops |
| `components/tabletop/board.layout.ts` | Where each space and piece stands, and the route field |
| `components/tabletop/camera.ts`, `CameraRig.tsx` | The shot for each moment, eased by springs. Renders only while something moves |
| `components/tabletop/tile.textures.ts` | Printed faces of the spaces and the board centre |
| `components/tabletop/useViewportPreferences.ts` | Screen edges covered by the interface, and the reduced-motion preference |
| `backend/src/features/game/game.tokens.ts` | The eight pieces, and assigning one distinct piece per seat |

## Checks

```powershell
npm run verify
npm run dev:cloudflare:test
```

The second command runs the real game locally, with temporary PostgreSQL, at
http://127.0.0.1:8787.
