# Shared Delay Session — lean implementation plan

> **For agentic workers:** Steps use `- [ ]`. Execute in order, top to bottom.

**Goal:** A delay grant becomes one per-block-set session shared by all tabs and persisted across worker restarts; a single spurious blur no longer kills a countdown.

**Architecture:** `gSessions[set] = {host, path, endTime}` in `background.js`, mirrored to `browser.storage.local` under `delaySessions`. `allowBlockedPage` writes or reuses it; `checkTab` honours it before any block condition. `blocked.js` tolerates one unfocused tick.

**Spec:** `docs/superpowers/specs/2026-10-31-delay-session-shared-design.md`

## Amendments to the spec

- **No automated test harness.** The spec's verification stays manual. Adding a Node harness and five test files would have cost more code than the fix. Ruling: verify with `node --check`, a throwaway `vm` script in `.scratch/`, and the browser script.
- **No new files.** `manifest.json` untouched.

## Global Constraints

- Tabs for indentation, `function` declarations, `let`/`const`, matching the surrounding file.
- Session storage is always `browser.storage.local` under `delaySessions`, never `gStorage`.
- Timestamps are integer seconds: `Math.floor(Date.now() / 1000) + (gClockOffset * 60)`.
- Blank `delayAllowMins` must behave exactly as today.
- Target: ~60 net new lines across `background.js` and `blocked.js`.

---

### Task 1: Session helpers in `background.js`

**Files:** modify `background.js`

**Interfaces produced:**
- `isSameHost(host1, host2)` at file scope (moved out of `checkTab`).
- `createGrant(url, set, now, allowMins)` → `{host, path, endTime}`.
- `grantCovers(grant, parsedURL)` → boolean.
- `getLiveSession(set, now)` → grant or null; deletes and persists on expiry.
- `saveSessions()`, `loadSessions()`.

- [ ] **Step 1:** Add `var gSessions = {};` with the other globals (~line 13).
- [ ] **Step 2:** Move the nested `isSameHost` out of `checkTab` to file scope, body unchanged. Update `checkTab`'s call site (same name, no other change).
- [ ] **Step 3:** Add the five helpers beside `testURL`. `createGrant` mirrors today's two `delayFirst` expressions; `grantCovers` reuses `isSameHost` and the `path == null ||` rule.
- [ ] **Step 4:** Call `loadSessions();` next to `checkManagedStorage();` in the startup block.
- [ ] **Step 5:** `node --check background.js` → no output.

### Task 2: Wire the grant in and out

**Files:** modify `background.js`

- [ ] **Step 1:** Rewrite `allowBlockedPage`'s grant section: build the grant with `createGrant(url, set, now, +gOptions[\`delayAllowMins${set}\`] || 0)`; if `allowMins` and a live session covers this URL, reuse it as the grant; else if `allowMins` and no session exists, store and `saveSessions()`; assign the four `gTabs[id].allowed*` fields from the chosen grant. Keep `autoLoad` redirect unchanged.
- [ ] **Step 2:** At the top of `checkTab`'s per-set loop, after the `disable${set}` guard: if `getLiveSession(set, now)` covers `parsedURL`, set `secsLeft`/`secsLeftSet`/`showTimer` and `continue`.
- [ ] **Step 3:** `node --check background.js` → no output.

### Task 3: Countdown blur grace

**Files:** modify `blocked.js`

- [ ] **Step 1:** In `onCountdownTimer`, when `delayCancel && !document.hasFocus()`, increment `countdown.unfocused`, return without decrementing while it is `< 2`, and cancel as today once it reaches 2. Reset `unfocused` to 0 on any focused tick.
- [ ] **Step 2:** In `processBlockInfo`, initialise `unfocused: 0` on the countdown object and clear leftover `textDecoration` on `lbCountdownText`.
- [ ] **Step 3:** `node --check blocked.js` → no output.

### Task 4: Prove it

- [ ] **Step 1:** Throwaway `vm` script in `.scratch/`: load `common.js` + `background.js` with stubbed `browser`, then assert (a) a covered URL returns false from `checkTab` with `secsLeft > 0`, (b) an expired session blocks, (c) a second completion inside a live window does not extend `endTime`, (d) blank `delayAllowMins` writes no session.
- [ ] **Step 2:** `node --check` on both changed files; `node .scratch/verify.mjs` → all assertions pass.
- [ ] **Step 3:** Manual browser pass per the spec's Verification section (steps 2-7).
- [ ] **Step 4:** Commit, push, open PR.
