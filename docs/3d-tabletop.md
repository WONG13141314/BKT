# 3D tabletop

The game board is a fullscreen 3D table. The board, the eight pewter tokens, the
houses and the physics dice share one scene. The interface floats above it.
The server still decides every roll, move, price, question and deadline. The
3D layer only presents that state.

## What the player sees

- **Overview** while a player decides to roll: the whole board, viewed square to
  the side where the active piece stands.
- **Dice** roll in the recessed centre of the board.
- **Follow**: the camera moves in close behind the moving piece, keeps about three
  or four spaces in view, turns a quarter at each corner, and a label shows the
  route ("Tolak Towers · 2 of 6").
- **Landing**: a closer, settled view of the landed space ("Landed on Tolak
  Drive"). It holds while the player buys, answers or reads, and for 1.4 s into
  End Turn. Then it eases back to the overview.

Bots, autopilot seats and other players get the same camera. Nobody controls it.
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

To look at all eight under the game's lighting, run
`npm run dev --workspace=frontend` and open `/dev/lookbook.html`. Add
`?yaw=0.6` to change their angle.

## Code map

| File | Role |
| --- | --- |
| `components/Board.tsx` | Movement pacing and server acknowledgement (unchanged rules), choosing the camera moment, the route label and the 2D fallback |
| `components/tabletop/TabletopScene.tsx` | The scene: table, board, spaces, ownership strips, houses, card deck, pieces and their hops |
| `components/tabletop/board.layout.ts` | Where each space and piece stands, and the continuous corner turn |
| `components/tabletop/camera.ts`, `CameraRig.tsx` | Framing for each moment, eased with no user input. Renders only while something moves |
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
