# Math Monopoly — Recommended Libraries & UX Redesign Guide

To make **Math Monopoly** feel like a commercial serious game (such as *Blooket*, *Kahoot*, or *Monopoly Plus*) and completely remove the "AI / prototype smell", you need 4 core game frontend packages and specific UX design principles.

---

## 📦 Required NPM Packages to Install

Run this command inside your `frontend/` folder:

```bash
cd frontend
npm install howler framer-motion canvas-confetti dice-box @types/howler @types/canvas-confetti
```

### Why These Specific Libraries?

1. **🎲 3D Physics Dice: `dice-box`**
   - Pure CSS spinning looks fake and robotic.
   - `dice-box` renders **real 3D dice with WebGL physics** inside an HTML canvas. The dice roll across the board with real bounce physics and sound before revealing the number.

2. **🎵 Sound Effects Engine: `howler` (Howler.js)**
   - Silent web apps feel like stiff prototypes. Sound accounts for 50% of game immersion!
   - Howler handles sound FX (dice clatter, coin sound, card draw sound, correct chime, wrong buzz) and background music smoothly without lag.

3. **🪄 Smooth Spring Animations & Pacing: `framer-motion`**
   - Standard CSS keyframes feel rigid. Framer Motion provides **natural spring physics** (`stiffness`, `damping`) for card flips, modal zoom-ins, and token hopping curves.

4. **🎉 Particle Rewards: `canvas-confetti`**
   - Triggers vibrant confetti particle explosions on correct answers, property level-ups, and game wins.

---

## 🎨 How to Eliminate the "AI / Prototype Smell"

| Prototype / AI Smell (Avoid ❌) | Commercial Game Feel (Do This ✅) |
| :--- | :--- |
| **Instant Snapping**: Token teleports to target tile instantly. | **Paced Hop Trajectory**: Token hops tile-by-tile with quadratic arc movement and popping sound per step. |
| **Standard System Fonts**: Times, Arial, basic sans-serif. | **Playful Kid Fonts**: Import Google Fonts like **`Fredoka`** or **`Nunito`** (bold, rounded, friendly). |
| **Silent UI**: No sound when clicking buttons or rolling dice. | **Juicy Sound Design**: Audio feedback for button hover/click, coin pickup, and dice rattle. |
| **Flat Rectangles**: Sharp corners, plain borders. | **Tactile Card Design**: `border-radius: 20px`, glassmorphism backdrop blur, soft shadows, vibrant color pills. |
| **Instant Question Overlay**: Math question pops up abruptly. | **Cinematic Camera Focus**: Board dims, math modal zooms in with spring animation, timer bar pulses rhythmically. |

---

## 🏗️ Architecture Modules Needed for Restructure

1. **`src/features/game/audio/soundManager.ts`**: Audio controller using Howler.js for all game sounds.
2. **`src/features/game/components/DiceBox3D.tsx`**: WebGL 3D dice canvas overlay.
3. **`src/features/game/components/ColumnQuestion.tsx`**: Enhanced vertical calculation component supporting Addition, Subtraction, Multiplication, and Step-by-Step Long Division with dynamic `(?)` placement.
4. **`src/features/game/utils/hopAnimation.ts`**: Tile-by-tile coordinate math for smooth token jumping curves.
