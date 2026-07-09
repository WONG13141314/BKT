# UI/UX Redesign Prompt — Adaptive Learning Monopoly Game

Copy everything below into your AI coding tool.

---

## Context

I have a web-based Monopoly game built in **React**. It is not a casual game — it's a **serious game / adaptive learning system**. The board and gameplay are the shell; the real purpose is to surface **quiz/assessment questions** to the player during gameplay and adapt difficulty based on their answers.

I need a complete **UI/UX redesign** of the entire application. Treat this as a professional product redesign, not a decorative pass.

## Non-Negotiable: Avoid "AI-Generated" Design Clichés

Do not produce anything that looks like a generic AI-generated interface. Specifically avoid:

- Blinking/pulsing colored dots next to labels, statuses, or nav items (e.g. green "online" dots)
- Purple-to-blue or teal-to-pink gradient backgrounds used as a default filler
- Glassmorphism used indiscriminately (frosted blur on every card just because)
- Generic rounded-everything cards with a soft drop-shadow and no hierarchy
- Emoji used as icons instead of a real icon set
- Overuse of badges/pills/chips with glowing borders
- Center-aligned hero-style text blocks inside a game UI where they don't belong
- Default Inter/system-font look with no typographic personality
- Confetti/sparkle animations as a substitute for real feedback design

Instead, design like a **thoughtful product designer** would: a distinct visual identity, restrained color palette with real intent, purposeful motion (not decorative), and clear information hierarchy driven by what the *player* needs to see at each moment (whose turn, what they own, what's being tested).

## Design Direction

- Establish a **cohesive visual identity**: pick a specific personality (e.g. tactile board-game realism, editorial/print-inspired, minimalist data-forward, retro-modern) and commit to it — state which one you're using and why.
- Build a real **design token system** first: a small, deliberate color palette (with named roles — background, surface, primary action, success/warning/error, board-tile categories), a type scale, spacing scale, and corner-radius/elevation rules. Apply tokens consistently rather than one-off styling per component.
- Typography should have a clear voice — pair a distinctive display/heading font with a clean body font, not just system defaults.
- Use a real icon library (e.g. lucide-react) instead of emoji.
- Motion should be functional: dice rolls, token movement, card flips, and money changes should animate to *show state change*, not just decorate.

## Core Screens/States to Redesign

1. **Game board** — property tiles, player tokens, current turn indicator, dice, player money/asset summary
2. **Property card / detail view** — rent tiers, ownership, buy/build actions
3. **Adaptive quiz moment** — the question interface that appears during play (see below)
4. **Player dashboard / HUD** — cash, properties owned, position, turn order
5. **Turn/event feedback** — landing on a tile, paying rent, drawing chance/community chest, passing GO
6. **Game start / lobby** — player setup before a game begins
7. **End-of-game / results summary** — combine game outcome with a learning-progress summary

## Adaptive Quiz UX — Use Your Judgment, But Solve These Problems

The quiz is the pedagogical core of the app, so it deserves its own deliberate interaction design, not a bolted-on popup. Decide the best placement and interaction pattern yourself (in-board panel, contextual overlay, docked drawer, full transition — your call), but make sure your design explicitly solves for:

- The question must not feel like it's interrupting the game jarringly — design a transition that keeps the board context visible or easily returned to
- Clear distinction between **question difficulty levels**, shown subtly (not as a loud "EASY/HARD" badge) so the player senses progression without it feeling like a test score
- Immediate, clear feedback on correct/incorrect answers that ties back into the game (e.g. how it affects money, position, or rewards) — feedback should feel like a game consequence, not a red/green form validation
- A way to show **adaptive progress** over time (are questions getting harder/easier) without exposing this as a raw analytics dashboard mid-game
- Accessibility: readable question text, sufficient contrast, no reliance on color alone to indicate correctness

## Technical Requirements

- React functional components with hooks
- Tailwind CSS core utility classes for styling (component-scoped, using the token system above translated into a consistent Tailwind config/theme)
- Fully responsive: desktop-first for the board, but must degrade gracefully to tablet/mobile
- Componentize cleanly: Board, Tile, PlayerHUD, DiceRoller, QuizPanel/QuizOverlay, PropertyCard, GameSummary, etc.
- Keep animation libraries lightweight (CSS transitions/Framer Motion is fine) — avoid heavy dependencies for simple effects

## Deliverable

1. State your chosen design direction/personality in one paragraph before writing code.
2. Provide the design token definitions (colors, type scale, spacing) as a single source of truth.
3. Redesign each screen/state listed above as a working React component.
4. Briefly explain the reasoning behind the adaptive quiz UX pattern you chose.

Do not ask me clarifying questions before starting — make reasonable, clearly-stated design decisions and proceed.
