# Frontend UX and Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing Mathopoly interface into a compact, modern, accessible property-game UI whose primary actions remain visible for real desktop, mobile, keyboard, zoom, and short-landscape users.

**Architecture:** Preserve the strong forest-green/red/property-color identity while replacing weak typography, spacing, and stacking. Extract a contextual action dock and accessible challenge dialog from `GamePage`, make the board consume server tiles, and verify semantics with component tests plus actual viewport tests.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Vite 8, Vitest, Testing Library, Playwright, CSS custom properties, Socket.IO client.

## Global Constraints

- The design is an original Mathopoly evolution, not a copy of official Monopoly artwork.
- Keep forest green, coral red, warm yellow, teal, pale green, white, black outlines, controlled hard shadows, property colors, and the tilted Mathopoly mark.
- Use readable sans-serif body copy; reserve condensed display type for headings.
- Core controls target at least 44×44 CSS pixels and show visible keyboard focus.
- Desktop, 390×844 portrait, 568×320 landscape, and 200% zoom must expose the current action without multi-screen scrolling.
- Mobile uses a sticky bottom contextual action dock and a compact/collapsible player summary.
- Dialogs use semantic roles, focus management, Escape behavior where safe, and internal scrolling on short screens.
- Only actions valid for the current phase are rendered.
- Detailed mastery is visible only to the current learner on the ending page.

---

## File Structure

- Create `frontend/src/test/setup.ts`: Testing Library/Vitest setup.
- Create `frontend/src/test/render.tsx`: provider-aware render and deterministic UI fixtures.
- Create `frontend/vitest.config.ts`: jsdom component-test configuration.
- Create component tests beside the affected components.
- Create `frontend/src/features/game/components/GameActionDock.tsx` and `.css`: all phase actions.
- Create `frontend/src/features/game/components/ChallengeDialog.tsx` and `.css`: accessible question shell.
- Create `frontend/src/shared/hooks/useDialogFocus.ts`: focus entry/trap/restore.
- Create `frontend/src/features/game/components/LearningReport.tsx` and `.css`.
- Create `frontend/public/favicon.svg`.
- Modify login, lobby, board, player, detail, timer, duel, game page, and game-over components/styles.
- Modify global variables/typography and remove the Google Fonts request.
- Create `frontend/playwright.config.ts` and `frontend/e2e/game-responsive.spec.ts` for real viewport checks.

### Task 1: Frontend Test Harness and Visual Foundations

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/test/render.tsx`
- Create: `frontend/src/styles/__tests__/app-shell.test.tsx`
- Create: `frontend/public/favicon.svg`
- Modify: `frontend/package.json`
- Modify: root `package.json`
- Modify: `frontend/src/styles/variables.css`
- Modify: `frontend/src/styles/globals.css`
- Modify: `frontend/index.html`

**Interfaces:**
- Produces scripts `test`, `test:watch`, and `test:e2e` in the frontend workspace.
- Produces reusable CSS tokens for surface, border, shadow, focus, action height, and safe-area spacing.
- Produces test helpers `renderLoginPageWithProviders()`, `renderLobby(room)`, `renderDock(options)`, `renderChallengeDialog()`, `makePublicGameState(overrides?)`, `makeScores()`, and `makeMasteryReport()`.

- [ ] **Step 1: Install the explicit frontend test dependencies**

Run: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install --save-dev --workspace=frontend vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test`

Expected: `frontend/package.json` and root `package-lock.json` contain the dependencies.

- [ ] **Step 2: Add a failing global shell test**

```tsx
import variables from '../variables.css?raw';

it('defines the accessible game tokens and concise product copy', () => {
  renderLoginPageWithProviders();
  expect(screen.getByText(/roll, solve/i)).toBeInTheDocument();
  expect(variables).toContain('--action-min-height: 44px');
  expect(variables).toContain('--focus-ring:');
});
```

Configure Vitest with `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`, CSS enabled, and `@testing-library/jest-dom/vitest` imported by setup.

- [ ] **Step 3: Run the test and verify current copy/foundation fails**

Run: `node frontend/node_modules/vitest/vitest.mjs run frontend/src/styles/__tests__/app-shell.test.tsx --config frontend/vitest.config.ts`

Expected: FAIL because the UI still uses the old subtitle and the test harness/tokens are incomplete.

- [ ] **Step 4: Implement tokens, local font fallbacks, and favicon**

```css
:root {
  --surface: #ffffff;
  --surface-soft: #f4f7f5;
  --ink: #111111;
  --green-950: #0b2f24;
  --green-900: #123d2f;
  --red-500: #ef3e4d;
  --yellow-400: #ffbd19;
  --teal-500: #2fa59b;
  --border-game: 2px solid var(--ink);
  --shadow-game: 4px 5px 0 rgba(0, 0, 0, .42);
  --focus-ring: 0 0 0 4px rgba(255, 189, 25, .75);
  --action-min-height: 44px;
  --font-body: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-display: "Arial Narrow", Impact, ui-sans-serif, sans-serif;
}
```

Remove the remote `@import`, add `:focus-visible`, `prefers-reduced-motion`, and `color-scheme: light`. Point `index.html` to `/favicon.svg` and use concise game-focused product copy.

- [ ] **Step 5: Run the component test and commit foundations**

Run: `node frontend/node_modules/vitest/vitest.mjs run --config frontend/vitest.config.ts`

Expected: PASS.

```bash
git add package.json package-lock.json frontend/package.json frontend/vitest.config.ts frontend/src/test/setup.ts frontend/src/test/render.tsx frontend/src/styles/__tests__/app-shell.test.tsx frontend/src/styles/variables.css frontend/src/styles/globals.css frontend/public/favicon.svg frontend/index.html
git commit -m "test: add frontend UI verification foundation"
```

### Task 2: Compact Landing, Profile, and Lobby Flows

**Files:**
- Create: `frontend/src/features/auth/pages/LoginPage.test.tsx`
- Create: `frontend/src/features/game/components/GameLobby.test.tsx`
- Modify: `frontend/src/features/auth/pages/LoginPage.tsx`
- Modify: `frontend/src/features/auth/pages/LoginPage.css`
- Modify: `frontend/src/features/game/components/GameLobby.tsx`
- Modify: `frontend/src/features/game/components/GameLobby.css`

**Interfaces:**
- Changes room code from clickable `div` to `button type="button"` with accessible copied status.
- Keeps all existing new-player, known-player, sign-in, claim, host, join, ready, bot, start, and leave behavior.

- [ ] **Step 1: Write failing interaction/accessibility tests**

```tsx
it('creates a player with keyboard-only controls', async () => {
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.type(screen.getByLabelText(/nickname/i), 'Aina');
  await user.tab();
  expect(screen.getByRole('radio', { name: /top hat/i })).toHaveFocus();
});

it('copies the room code through a real button', async () => {
  renderLobby({ code: 'ABC123' });
  expect(screen.getByRole('button', { name: /copy room code abc123/i })).toBeEnabled();
});
```

- [ ] **Step 2: Run both tests and verify the room-code semantic failure**

Run: `node frontend/node_modules/vitest/vitest.mjs run frontend/src/features/auth/pages/LoginPage.test.tsx frontend/src/features/game/components/GameLobby.test.tsx --config frontend/vitest.config.ts`

Expected: FAIL because token picks are buttons without radio semantics and room code is a `div`.

- [ ] **Step 3: Refine markup and page density**

```tsx
<button
  type="button"
  className="room-code-box"
  aria-label={`Copy room code ${room.code}`}
  onClick={copyCode}
>
  <span aria-hidden="true">{room.code}</span>
  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
</button>
```

Give token selection a radiogroup/radio contract, add `aria-pressed` where appropriate, and make remove-bot buttons at least 44px. Recompose CSS so landing/claim primary controls fit within 1366×720 and 390×844, while the lobby code, players, bot control, Start, and Leave fit above the fold at normal desktop height. Preserve all existing auth/socket functions.

- [ ] **Step 4: Run component tests and frontend typecheck**

Run: `node frontend/node_modules/vitest/vitest.mjs run frontend/src/features/auth/pages/LoginPage.test.tsx frontend/src/features/game/components/GameLobby.test.tsx --config frontend/vitest.config.ts`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit entry/lobby UX**

```bash
git add frontend/src/features/auth/pages/LoginPage.tsx frontend/src/features/auth/pages/LoginPage.css frontend/src/features/auth/pages/LoginPage.test.tsx frontend/src/features/game/components/GameLobby.tsx frontend/src/features/game/components/GameLobby.css frontend/src/features/game/components/GameLobby.test.tsx
git commit -m "feat: simplify entry and lobby flows"
```

### Task 3: Responsive Game Shell and Contextual Action Dock

**Files:**
- Create: `frontend/src/features/game/components/GameActionDock.tsx`
- Create: `frontend/src/features/game/components/GameActionDock.css`
- Create: `frontend/src/features/game/components/GameActionDock.test.tsx`
- Modify: `frontend/src/features/game/pages/GamePage.tsx`
- Modify: `frontend/src/features/game/pages/GamePage.css`
- Modify: `frontend/src/features/game/components/Board.tsx`
- Modify: `frontend/src/features/game/components/Board.css`
- Modify: `frontend/src/features/game/components/PlayerPanel.tsx`
- Modify: `frontend/src/features/game/components/PlayerPanel.css`
- Modify: `frontend/src/features/game/components/SpaceDetailsPanel.tsx`
- Modify: `frontend/src/features/game/components/SpaceDetailsPanel.css`
- Modify: `frontend/src/features/game/components/TurnIndicator.tsx`
- Modify: `frontend/src/features/game/components/TurnIndicator.css`
- Modify: `frontend/src/features/game/config/board.config.ts`

**Interfaces:**
- Produces: `GameActionDockProps` with current phase/state and callbacks for roll, buy, smart-buy, skip, jail choices, build, card acknowledgement, and end turn.
- `GameActionDock` renders exactly the valid action group for the phase and returns `null` for observers/transient phases.
- Board and detail panels consume `gameState.tiles`; frontend config retains presentation-only color metadata.

- [ ] **Step 1: Write failing action-dock exclusivity tests**

```tsx
it('renders only Roll during the roll phase', () => {
  renderDock({ phase: 'ROLL_PHASE', isMyTurn: true });
  expect(screen.getByRole('button', { name: /roll dice/i })).toBeVisible();
  expect(screen.queryByRole('button', { name: /buy property/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /end turn/i })).not.toBeInTheDocument();
});

it('renders nothing actionable while movement is presented', () => {
  const { container } = renderDock({ phase: 'MOVING', isMyTurn: true });
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run the dock test and confirm the component is absent**

Run: `node frontend/node_modules/vitest/vitest.mjs run frontend/src/features/game/components/GameActionDock.test.tsx --config frontend/vitest.config.ts`

Expected: FAIL because `GameActionDock` does not exist.

- [ ] **Step 3: Extract actions and recompose responsive layout**

```tsx
export interface GameActionDockProps {
  state: GameState;
  isMyTurn: boolean;
  currentPlayer: Player | null;
  selectedTile: number;
  isBoardAnimating: boolean;
  onRoll(): void;
  onBuyFull(): void;
  onSmartBuy(): void;
  onSkipBuy(): void;
  onJailMath(): void;
  onJailBail(): void;
  onJailWait(): void;
  onBuild(tileIndex: number): void;
  onCardAck(): void;
  onEndTurn(): void;
}
```

Move phase buttons out of `GamePage`. Use a desktop grid of compact player rail, large board, and unified detail/action sidebar. At `max-width: 900px`, collapse the roster to one summary row, keep the board first, render concise space details, and fix the action dock to `bottom: env(safe-area-inset-bottom)` with one phase group. Board tiles are buttons only when inspection is useful; add a `Skip to game actions` link so keyboard focus does not traverse all 20 tiles.

- [ ] **Step 4: Run dock/component tests and build**

Run: `node frontend/node_modules/vitest/vitest.mjs run --config frontend/vitest.config.ts`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Expected: PASS; board values come from `gameState.tiles`, not duplicated `BOARD_TILES`.

- [ ] **Step 5: Commit the responsive game shell**

```bash
git add frontend/src/features/game/components/GameActionDock.tsx frontend/src/features/game/components/GameActionDock.css frontend/src/features/game/components/GameActionDock.test.tsx frontend/src/features/game/pages/GamePage.tsx frontend/src/features/game/pages/GamePage.css frontend/src/features/game/components/Board.tsx frontend/src/features/game/components/Board.css frontend/src/features/game/components/PlayerPanel.tsx frontend/src/features/game/components/PlayerPanel.css frontend/src/features/game/components/SpaceDetailsPanel.tsx frontend/src/features/game/components/SpaceDetailsPanel.css frontend/src/features/game/components/TurnIndicator.tsx frontend/src/features/game/components/TurnIndicator.css frontend/src/features/game/config/board.config.ts
git commit -m "feat: keep game actions visible on every screen"
```

### Task 4: Accessible Question and Duel Dialogs

**Files:**
- Create: `frontend/src/shared/hooks/useDialogFocus.ts`
- Create: `frontend/src/features/game/components/ChallengeDialog.tsx`
- Create: `frontend/src/features/game/components/ChallengeDialog.css`
- Create: `frontend/src/features/game/components/ChallengeDialog.test.tsx`
- Modify: `frontend/src/features/game/components/ChallengeTimer.tsx`
- Modify: `frontend/src/features/game/components/ChallengeTimer.css`
- Modify: `frontend/src/features/game/components/MathDuel.tsx`
- Modify: `frontend/src/features/game/components/MathDuel.css`
- Modify: `frontend/src/features/game/components/McqQuestion.tsx`
- Modify: `frontend/src/features/game/pages/GamePage.tsx`
- Modify: `frontend/src/features/game/components/ColumnQuestion.css`
- Modify: `frontend/src/features/game/components/LongDivisionQuestion.css`

**Interfaces:**
- Produces: `ChallengeDialog({ title, challenge, feedback, children, onSafeClose })`.
- Produces: `ChallengeTimer` visible text such as `20 seconds` and critical-state class at five seconds.
- Produces: `useDialogFocus(open, containerRef, onEscape?)` restoring focus on close.

- [ ] **Step 1: Write failing dialog semantics and countdown tests**

```tsx
it('announces a modal, moves focus inside, traps Tab, and restores focus', async () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const { unmount } = renderChallengeDialog();
  expect(screen.getByRole('dialog', { name: /math challenge/i })).toHaveAttribute('aria-modal', 'true');
  expect(screen.getAllByRole('button')[0]).toHaveFocus();
  unmount();
  expect(opener).toHaveFocus();
});

it('shows the numeric time and final-five warning', () => {
  vi.setSystemTime(new Date(15_000));
  render(<ChallengeTimer opensAt={0} expiresAt={20_000} totalSeconds={20} />);
  expect(screen.getByRole('timer')).toHaveTextContent('5');
  expect(screen.getByRole('timer')).toHaveClass('challenge-timer--critical');
});
```

- [ ] **Step 2: Run the test and confirm current modal/timer failures**

Run: `node frontend/node_modules/vitest/vitest.mjs run frontend/src/features/game/components/ChallengeDialog.test.tsx --config frontend/vitest.config.ts`

Expected: FAIL because the current overlay lacks dialog semantics/focus handling and hides `seconds`.

- [ ] **Step 3: Implement the reusable dialog and feedback state**

```tsx
<section
  ref={dialogRef}
  className="challenge-dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}
>
  <header>
    <h2 id={titleId}>{title}</h2>
    <ChallengeTimer {...timerProps} />
  </header>
  <div className="challenge-dialog__body">{children}</div>
  {feedback && <div role="status" className="challenge-dialog__feedback">{feedback}</div>}
</section>
```

Use internal `max-height: min(90dvh, ...)` and `overflow-y: auto`; size choices to 44px minimum; announce warnings without updating a live region every second. Escape closes only non-blocking result/card states, not an unanswered timed question. Use the same shell for duel questions and keep onlooker state non-modal.

- [ ] **Step 4: Run dialog tests and all frontend tests**

Run: `node frontend/node_modules/vitest/vitest.mjs run --config frontend/vitest.config.ts`

Expected: PASS, including keyboard focus cycle and visible countdown.

- [ ] **Step 5: Commit question accessibility**

```bash
git add frontend/src/shared/hooks/useDialogFocus.ts frontend/src/features/game/components/ChallengeDialog.tsx frontend/src/features/game/components/ChallengeDialog.css frontend/src/features/game/components/ChallengeDialog.test.tsx frontend/src/features/game/components/ChallengeTimer.tsx frontend/src/features/game/components/ChallengeTimer.css frontend/src/features/game/components/MathDuel.tsx frontend/src/features/game/components/MathDuel.css frontend/src/features/game/components/McqQuestion.tsx frontend/src/features/game/pages/GamePage.tsx frontend/src/features/game/components/ColumnQuestion.css frontend/src/features/game/components/LongDivisionQuestion.css
git commit -m "feat: make math dialogs accessible and readable"
```

### Task 5: Immediate Results and Private Learning Report

**Files:**
- Create: `frontend/src/features/game/components/LearningReport.tsx`
- Create: `frontend/src/features/game/components/LearningReport.css`
- Create: `frontend/src/features/game/components/GameOverScreen.test.tsx`
- Modify: `frontend/src/features/game/components/GameOverScreen.tsx`
- Modify: `frontend/src/features/game/components/GameOverScreen.css`
- Modify: `frontend/src/features/game/pages/GamePage.tsx`
- Modify: `frontend/src/features/game/types/game.types.ts`

**Interfaces:**
- Produces: `masteryStatus(value: number): 'Building' | 'Developing' | 'Confident'` using `<0.50`, `<0.85`, and `>=0.85`.
- Accepts one `masteryReport?: MasteryReport | null`, not an array.

- [ ] **Step 1: Write failing immediate-action and report tests**

```tsx
it('shows scores and Exit immediately', () => {
  render(<GameOverScreen scores={scores} masteryReport={report} onExit={onExit} />);
  expect(screen.getByRole('table', { name: /final scores/i })).toBeVisible();
  expect(screen.getByRole('button', { name: /exit/i })).toBeEnabled();
});

it.each([[0.2, 'Building'], [0.6, 'Developing'], [0.9, 'Confident']] as const)(
  'labels mastery %s as %s',
  (value, label) => expect(masteryStatus(value)).toBe(label)
);
```

- [ ] **Step 2: Run the test and verify reveal/report contract failures**

Run: `node frontend/node_modules/vitest/vitest.mjs run frontend/src/features/game/components/GameOverScreen.test.tsx --config frontend/vitest.config.ts`

Expected: FAIL because mandatory reveal stages hide actions and reports use an array.

- [ ] **Step 3: Implement immediate responsive results**

Remove staged `setTimeout` gates. Render the score table immediately with optional non-blocking entrance CSS that disappears under reduced motion. On narrow screens, switch rows to labelled cards or hide no value without an accessible label. Render four skill bars with percentages/status and one next-practice recommendation derived from the weakest skill.

```ts
export function masteryStatus(value: number) {
  if (value >= 0.85) return 'Confident' as const;
  if (value >= 0.50) return 'Developing' as const;
  return 'Building' as const;
}
```

- [ ] **Step 4: Run ending tests and typecheck**

Run: `node frontend/node_modules/vitest/vitest.mjs run frontend/src/features/game/components/GameOverScreen.test.tsx --config frontend/vitest.config.ts`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Expected: PASS; Exit exists from first render.

- [ ] **Step 5: Commit the ending experience**

```bash
git add frontend/src/features/game/components/LearningReport.tsx frontend/src/features/game/components/LearningReport.css frontend/src/features/game/components/GameOverScreen.tsx frontend/src/features/game/components/GameOverScreen.css frontend/src/features/game/components/GameOverScreen.test.tsx frontend/src/features/game/pages/GamePage.tsx frontend/src/features/game/types/game.types.ts
git commit -m "feat: deliver immediate results and learning report"
```

### Task 6: Real-Browser Responsive Coverage

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/game-responsive.spec.ts`
- Modify: `frontend/package.json`
- Modify only CSS/component regressions exposed by the tests.

**Interfaces:**
- Produces Playwright projects `desktop`, `mobile`, and `short-landscape`.
- Produces screenshots in Playwright's ignored output directory, not `.codex_qa`.

- [ ] **Step 1: Add viewport projects and the first failing fit test**

```ts
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 768 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'short-landscape', use: { viewport: { width: 568, height: 320 } } },
  ],
});

test('primary landing action fits the initial viewport', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: /continue/i });
  await expect(button).toBeVisible();
  expect((await button.boundingBox())!.y + (await button.boundingBox())!.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
});
```

- [ ] **Step 2: Run the viewport test before final CSS fixes**

Run: `node frontend/node_modules/@playwright/test/cli.js test --config frontend/playwright.config.ts`

Expected: any remaining clipping/scrolling failure is reported with a trace and screenshot.

- [ ] **Step 3: Cover the live lobby/game/action path**

```ts
test('host can reach Roll without scrolling the page', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/nickname/i).fill(`QA-${Date.now()}`);
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: /host a game/i }).click();
  await page.getByRole('button', { name: /add bot/i }).click();
  await page.getByRole('button', { name: /start game/i }).click();
  const roll = page.getByRole('button', { name: /roll dice/i });
  await expect(roll).toBeVisible();
  const box = await roll.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
});
```

Add checks for keyboard skip-link focus, modal bounds, 200% zoom through a 683×360 viewport, game-over Exit visibility, and absence of horizontal document scrolling.

- [ ] **Step 4: Run all frontend tests and production build**

Run: `node frontend/node_modules/vitest/vitest.mjs run --config frontend/vitest.config.ts`

Run: `node frontend/node_modules/@playwright/test/cli.js test --config frontend/playwright.config.ts`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Run: `node frontend/node_modules/vite/bin/vite.js build --config frontend/vite.config.ts`

Expected: all commands PASS.

- [ ] **Step 5: Commit browser coverage**

```bash
git add frontend/playwright.config.ts frontend/e2e/game-responsive.spec.ts frontend/package.json package-lock.json frontend/src
git commit -m "test: cover responsive human game flows"
```
