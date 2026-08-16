# Code Health and Release Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remediation with enforceable lint/unused checks, smaller responsibility-focused modules, single-source rules, intentional production builds, smaller initial loading, clean browser diagnostics, and a verified GitHub branch.

**Architecture:** Turn existing implicit expectations into automated gates, then perform mechanical cleanup behind the tests created in the first three plans. Bundle the backend intentionally for production, route-split the heavy game client, and finish with full automated plus human-timed browser verification before pushing.

**Tech Stack:** TypeScript 6, ESLint flat config, Jest, Vitest, Playwright, Vite 8, tsup, React Three Fiber/Rapier, Render, Git.

## Global Constraints

- No cleanup may alter an approved active game rule.
- Delete only confirmed unreachable or unreferenced code.
- Keep board/economy values server-authoritative and UI-only color/style metadata client-side.
- Production CORS remains allowlisted; only documented local development origins receive automatic development allowance.
- Initial landing/lobby loading must not include the full Three/Rapier game chunk.
- Backend production start must execute the artifact built by the deployment build step.
- All automated tests, lint, typechecks, builds, browser QA, and diff review pass before push.
- Never force-push or update `origin/main`; push only `monopoly-game-improve`.

---

## File Structure

- Create `eslint.config.mjs`: root flat ESLint configuration for backend/frontend/tests.
- Modify root/backend/frontend package scripts and TypeScript settings.
- Delete confirmed dead scaffolding listed in Task 2.
- Create `frontend/src/features/game/config/board.presentation.ts`: UI-only color metadata.
- Split `backend/src/bkt/question.generator.ts` into `backend/src/bkt/generators/*` behind the same public exports.
- Modify `frontend/src/routes/AppRouter.tsx`: lazy route chunks.
- Modify Three/Rapier components and compatible dependency versions to remove current warnings.
- Modify Vite, CORS, environment examples, backend build scripts, and `render.yaml`.
- Add/update README commands and architecture notes.

### Task 1: Working Lint, Strict Unused Checks, and Test Scripts

**Files:**
- Create: `eslint.config.mjs`
- Modify: root `package.json`
- Modify: root `package-lock.json`
- Modify: `backend/package.json`
- Modify: `frontend/package.json`
- Modify: `backend/tsconfig.json`
- Modify: `frontend/tsconfig.json`
- Modify source files reported by the new strict checks.

**Interfaces:**
- Produces root scripts `test`, `typecheck`, `verify`, and working workspace `lint` scripts.
- Enables `noUnusedLocals` and `noUnusedParameters` in both application typechecks.

- [ ] **Step 1: Install the explicit lint/build dependencies**

Run: `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install --save-dev eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals tsup`

Expected: dependencies are recorded at the root and lockfile updates cleanly.

- [ ] **Step 2: Add flat config and run it to expose current failures**

```js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/test-results/**', '.codex_qa/**', 'tmp/**', 'ui-prototype/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['backend/src/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
```

Run: `node node_modules/eslint/bin/eslint.js backend/src frontend/src`

Expected: FAIL on the known unused values and any unsafe `any` already present.

- [ ] **Step 3: Enable strict unused checks and resolve named diagnostics**

Add `noUnusedLocals: true` and `noUnusedParameters: true`. Remove the unused ChallengeTimer `seconds` suppression by rendering it, remove unused GameOver `players`/`SKILL_NAMES`, Board `SkillName`, test imports/helpers, question `makeOptions`, and backend board aggregate-only values. Rename the Express error middleware parameters to `_req`/`_next` while retaining all four parameters. Replace Socket.IO `transports as any` and obsolete `_skipLevelUpCheck` casts with typed values or remove them through the prior rule plan.

- [ ] **Step 4: Add scripts and run lint/typecheck**

```json
{
  "scripts": {
    "test": "npm test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces",
    "verify": "npm run lint && npm run typecheck && npm test && npm run build"
  }
}
```

Run: `node node_modules/eslint/bin/eslint.js backend/src frontend/src`

Run: `node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Expected: all PASS.

- [ ] **Step 5: Commit enforceable quality gates**

```bash
git add eslint.config.mjs package.json package-lock.json backend/package.json frontend/package.json backend/tsconfig.json frontend/tsconfig.json backend/src frontend/src
git commit -m "chore: enforce lint and unused-code checks"
```

### Task 2: Remove Dead Scaffolding and Duplicate Runtime Rules

**Files:**
- Delete: `backend/test-bkt.ts`
- Delete: `frontend/src/config/env.ts`
- Delete: `frontend/src/config/socket.ts`
- Delete: `frontend/src/shared/hooks/useLocalStorage.ts`
- Delete: `frontend/src/shared/hooks/useToast.ts`
- Delete: `frontend/src/shared/types/api.types.ts`
- Delete: `frontend/src/shared/types/user.types.ts`
- Delete: `frontend/src/shared/utils/format.ts`
- Delete: `frontend/src/features/auth/index.ts`
- Delete: `frontend/src/features/game/index.ts`
- Delete: `frontend/src/features/game/config/board.config.ts`
- Create: `frontend/src/features/game/config/board.presentation.ts`
- Modify: `backend/src/features/game/board.config.ts`
- Modify: `backend/src/features/game/game.constants.ts`
- Modify: `backend/src/features/game/game.types.ts`
- Modify: `frontend/src/features/game/types/game.types.ts`
- Modify: `frontend/src/features/game/components/Board.tsx`
- Modify: `frontend/src/features/game/components/SpaceDetailsPanel.tsx`
- Modify: `frontend/src/features/game/pages/GamePage.tsx`
- Modify: `frontend/src/test/render.tsx`

**Interfaces:**
- Server `TileConfig` supplies price, rent, leveled rent, tax/event data, skill theme, and `buildCost` needed by UI.
- Client `board.presentation.ts` maps only `colorGroup -> CSS color/class`; it contains no prices, rents, tile names, or economy formulas.
- Removes unused `GAME_CONSTANTS` aggregate exports and unused standalone helpers while retaining constants with active consumers.

- [ ] **Step 1: Add a failing server-tile rendering test**

```tsx
it('renders the server tile name and build cost', () => {
  const state = makePublicGameState();
  state.tiles[1] = { ...state.tiles[1], name: 'Server Avenue', price: 80, buildCost: 40 };
  render(<SpaceDetailsPanel gameState={state} tileIndex={1} landed />);
  expect(screen.getByText('Server Avenue')).toBeVisible();
  expect(screen.getByText(/RM40/)).toBeVisible();
});
```

- [ ] **Step 2: Run the test and verify local board config wins today**

Run: `node frontend/node_modules/vitest/vitest.mjs run frontend/src/features/game/components/SpaceDetailsPanel.test.tsx --config frontend/vitest.config.ts`

Expected: FAIL because the component reads duplicated `BOARD_TILES` and computes price × 0.5.

- [ ] **Step 3: Move runtime values to the public server tile contract and delete dead files**

```ts
export interface TileConfig {
  index: number;
  type: TileType;
  name: string;
  colorGroup: string | null;
  skillTheme: SkillName | null;
  price: number;
  baseRent: number;
  leveledRent: number;
  buildCost: number;
}
```

Populate `buildCost` once in backend board config. Render `gameState.tiles` in Board, GamePage, and SpaceDetailsPanel. Keep only `COLOR_GROUP_PRESENTATION` in the new frontend file. Delete the listed zero-consumer scaffolding/barrels; retain `frontend/src/shared/utils/api.ts` because auth service uses it.

- [ ] **Step 4: Run lint, component tests, and both typechecks**

Run: `node node_modules/eslint/bin/eslint.js backend/src frontend/src`

Run: `node frontend/node_modules/vitest/vitest.mjs run --config frontend/vitest.config.ts`

Run: `node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Expected: PASS; no deleted module import remains.

- [ ] **Step 5: Commit dead-code and rule consolidation**

```bash
git add -A backend/test-bkt.ts backend/src/features/game frontend/src
git commit -m "refactor: remove dead scaffolding and duplicate rules"
```

### Task 3: Split the Question Generator by Responsibility

**Files:**
- Create: `backend/src/bkt/generators/options.ts`
- Create: `backend/src/bkt/generators/column.ts`
- Create: `backend/src/bkt/generators/addition.ts`
- Create: `backend/src/bkt/generators/subtraction.ts`
- Create: `backend/src/bkt/generators/multiplication.ts`
- Create: `backend/src/bkt/generators/division.ts`
- Create: `backend/src/bkt/generators/smart-buy.ts`
- Create: `backend/src/bkt/generators/index.ts`
- Modify: `backend/src/bkt/question.generator.ts`
- Modify: `backend/src/bkt/__tests__/question.generator.test.ts`
- Modify: `backend/src/bkt/__tests__/pedagogy.test.ts`
- Modify: `backend/src/test/bkt.fixtures.ts`

**Interfaces:**
- `question.generator.ts` remains the compatibility facade exporting `GeneratedQuestion`, `generateQuestion`, `generateSmartBuyQuestion`, `generateQuestionBank`, `addWithoutCarrying`, and `subtractSmallerFromLarger`.
- Generator behavior and random distribution remain characterized by existing tests.

- [ ] **Step 1: Add characterization snapshots/invariants before moving code**

```ts
it.each(SKILL_NAMES)('%s keeps four unique choices across every difficulty', (skill) => {
  for (const difficulty of [1, 2, 3] as const) {
    for (let i = 0; i < 1_000; i += 1) {
      const q = generateQuestion(skill, difficulty);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.correctIndex]).toBe(String(targetAnswer(q.questionData)));
    }
  }
});
```

- [ ] **Step 2: Run characterization tests before extraction**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/bkt/__tests__/question.generator.test.ts backend/src/bkt/__tests__/pedagogy.test.ts --runInBand`

Expected: PASS before mechanical movement.

- [ ] **Step 3: Extract modules without changing algorithms**

```ts
// backend/src/bkt/question.generator.ts
export type { GeneratedQuestion } from './generators';
export {
  addWithoutCarrying,
  subtractSmallerFromLarger,
  generateQuestion,
  generateSmartBuyQuestion,
  generateQuestionBank,
} from './generators';
```

Move shared random/option helpers to `options.ts`, vertical-layout construction to `column.ts`, and each operation to its named file. Keep dependency direction one-way: operation modules import shared helpers; `index.ts` imports operations; no operation imports the facade.

- [ ] **Step 4: Run BKT suite, lint, and typecheck**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs backend/src/bkt/__tests__ --runInBand`

Run: `node node_modules/eslint/bin/eslint.js backend/src/bkt`

Run: `node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`

Expected: PASS with the same generator invariants.

- [ ] **Step 5: Commit generator boundaries**

```bash
git add backend/src/bkt/question.generator.ts backend/src/bkt/generators backend/src/bkt/__tests__
git commit -m "refactor: split math question generators"
```

### Task 4: Intentional Builds, Development Origins, and Lazy Game Loading

**Files:**
- Modify: `backend/package.json`
- Modify: `frontend/package.json`
- Modify: `render.yaml`
- Modify: `backend/src/config/cors.ts`
- Modify: `backend/src/config/socket.ts`
- Modify: `backend/src/config/env.ts`
- Create: `backend/src/config/__tests__/cors.test.ts`
- Modify: `.env.example`
- Modify: `frontend/vite.config.ts`
- Create: `frontend/scripts/check-entry-bundle.mjs`
- Modify: `frontend/src/routes/AppRouter.tsx`
- Modify: `frontend/src/features/game/components/PhysicsDice.tsx`
- Modify: `frontend/src/features/game/components/BoardPiecesScene.tsx`
- Modify: dependency versions and root lockfile where tests prove compatibility.

**Interfaces:**
- Backend `build` bundles `src/server.ts` to `dist/server.js`; production `start` runs `node dist/server.js`.
- Development origins include both `http://localhost:5173` and `http://127.0.0.1:5173`; production uses only `CORS_ORIGIN` entries.
- Login/lobby main chunk does not eagerly import `GamePage`/Three/Rapier.

- [ ] **Step 1: Add CORS and lazy-route tests**

```ts
it.each(['http://localhost:5173', 'http://127.0.0.1:5173'])(
  'allows %s in development',
  (origin, done) => corsOptions.origin(origin, (error, allowed) => {
    expect(error).toBeNull();
    expect(allowed).toBe(true);
    done();
  })
);
```

Enable Vite's build manifest and add `frontend/scripts/check-entry-bundle.mjs`. It reads `frontend/dist/.vite/manifest.json`, follows the `index.html` entry imports, and exits non-zero if the initial dependency graph contains `@react-three`, `rapier`, or `GamePage`.

- [ ] **Step 2: Run current build/diagnostic checks**

Run: `node frontend/node_modules/vite/bin/vite.js build --config frontend/vite.config.ts`

Run: `node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.build.json`

Expected: frontend warns about a large Three/Rapier chunk and the deployment still starts source instead of the built backend artifact.

- [ ] **Step 3: Implement production and loading alignment**

```json
{
  "scripts": {
    "build": "tsup src/server.ts --format esm --platform node --target node18 --out-dir dist --sourcemap --clean",
    "start": "node dist/server.js"
  }
}
```

Set Render `startCommand` to `cd backend && npm start`. In Vite use `import.meta.dirname`, lazy-load `GameLobby` and `GamePage` with `React.lazy`/`Suspense`, and use explicit basic shadow configuration supported by the installed R3F version. Update Three/Rapier packages only to mutually compatible versions verified by typecheck and browser tests; do not suppress console warnings with global filters.

For development, derive origins as:

```ts
const configured = env.CORS_ORIGIN.split(',').map(value => value.trim()).filter(Boolean);
export const allowedOrigins = env.NODE_ENV === 'development'
  ? [...new Set([...configured, 'http://localhost:5173', 'http://127.0.0.1:5173'])]
  : configured;
```

- [ ] **Step 4: Build and inspect artifact/chunks**

Run: `node node_modules/tsup/dist/cli-default.js backend/src/server.ts --format esm --platform node --target node18 --out-dir backend/dist --sourcemap --clean`

Run: `$serverProcess = Start-Process -FilePath node -ArgumentList 'backend/dist/server.js' -PassThru -WindowStyle Hidden; try { Start-Sleep -Seconds 2; Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/api/health } finally { Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue }`

Expected: server starts from `dist/server.js`; stop it after the health check.

Run: `node frontend/node_modules/vite/bin/vite.js build --config frontend/vite.config.ts`

Run: `node frontend/scripts/check-entry-bundle.mjs`

Expected: build and entry-bundle check PASS; initial route chunk excludes Three/Rapier and heavy game code is lazy.

- [ ] **Step 5: Commit deployment/loading fixes**

```bash
git add backend/package.json frontend/package.json package-lock.json render.yaml backend/src/config/cors.ts backend/src/config/socket.ts backend/src/config/env.ts backend/src/config/__tests__/cors.test.ts .env.example frontend/vite.config.ts frontend/scripts/check-entry-bundle.mjs frontend/src/routes/AppRouter.tsx frontend/src/features/game/components/PhysicsDice.tsx frontend/src/features/game/components/BoardPiecesScene.tsx
git commit -m "chore: align production builds and lazy game loading"
```

### Task 5: Documentation, Full Verification, Review, and Push

**Files:**
- Modify: `README.md`
- Modify only verified regressions found during this task.

**Interfaces:**
- Produces a complete verified branch and user-facing change inventory.

- [ ] **Step 1: Update README with real commands and architecture**

Document Primary Math scope, all four active skills, no-auction decline behavior, timeout/BKT semantics, development origins, test/lint/typecheck/build/e2e commands, backend production artifact, reconnect behavior, and the public/private socket boundary.

```markdown
## Learning model

Mathopoly adapts Addition, Subtraction, Multiplication, and Division questions with BKT. A submitted answer updates only the question's skill. A timeout is recorded as unanswered and gives no reward, but it does not change mastery.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e --workspace=frontend`

## Production

The backend build bundles `backend/src/server.ts` to `backend/dist/server.js`; production starts that built artifact with `npm start --workspace=backend`.
```

- [ ] **Step 2: Run the complete automated verification matrix**

Run: `node node_modules/eslint/bin/eslint.js backend/src frontend/src`

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.cjs --runInBand`

Run: `node frontend/node_modules/vitest/vitest.mjs run --config frontend/vitest.config.ts`

Run: `node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.json --noEmit`

Run: `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit`

Run: `node node_modules/tsup/dist/cli-default.js backend/src/server.ts --format esm --platform node --target node18 --out-dir backend/dist --sourcemap --clean`

Run: `node frontend/node_modules/vite/bin/vite.js build --config frontend/vite.config.ts`

Run: `node frontend/node_modules/@playwright/test/cli.js test --config frontend/playwright.config.ts`

Expected: every command exits zero.

- [ ] **Step 3: Execute the human-timed exploratory QA inventory**

Use normal mouse, touch emulation, and keyboard input to cover: new profile; returning profile; claim/sign-in; host/join; add/remove bot; room-code copy; start double activation; first roll; dice/pawn transition; purchase/Smart Buy/skip; card; jail; build; duel as challenger/owner/onlooker; timeout; disconnect/reconnect; multi-tab close; bot turn; finished refresh; private report; Exit. Repeat visual inspection at 1366×768, 390×844, 568×320, and 683×360. Fail the task for clipping, inaccessible actions, stale state, repeated warning floods, or required full-page scrolling.

- [ ] **Step 4: Review the diff and commit documentation/final repairs**

Run: `git diff origin/main...HEAD --check`

Run: `git status --short`

Expected: no whitespace errors; only the known user untracked files remain.

```bash
git add README.md
git commit -m "docs: document the improved Mathopoly system"
```

- [ ] **Step 5: Use required completion skills, then push the feature branch**

Invoke `superpowers:requesting-code-review`, resolve verified findings, invoke `superpowers:verification-before-completion`, and rerun the full matrix after the final source change.

Run: `git push -u origin monopoly-game-improve`

Expected: GitHub reports the new remote branch without modifying `origin/main`.
