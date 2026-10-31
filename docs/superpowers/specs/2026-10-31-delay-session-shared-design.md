# Shared delay session for LeechBlock NG

Date: 2026-10-31
Status: awaiting approval

## Intent

Once a user pays the delay on a blocked page, every tab that reaches the same
site inside the granted window should go straight through. Today the grant is
attached to one tab, in memory, and copied to child tabs only at creation. So
middle-clicked, pasted, or pre-completion tabs each run their own countdown and
their own access window.

## Goals

- One active delay session per block set, shared by all tabs.
- The session survives background-worker suspension (MV3 event page).
- A transient blur no longer permanently kills a countdown that should be
  running.

## Non-goals

- Changing behaviour when `delayAllowMins` is blank. That case keeps today's
  per-tab grant; sharing it would let a second tab skip the delay entirely.
- Rescuing tabs that are already sitting on a delaying page when the session is
  granted. They finish their own countdown and are then covered by the session.
- Reworking the rest of the per-tab `gTabs` state (time tracking, filters).

## Constraints

- Single manifest, MV3, background is an event page with no persistence.
- `gStorage` may point at `storage.sync` when the user enables sync. Session
  data is device-local by nature, so it goes to `browser.storage.local` under a
  dedicated key, read separately from the options blob.
- Grader is manual: no package.json, no test runner, no build step. Verification
  is a loaded-extension test in Firefox and Chrome.

## Approaches considered

1. **Per-tab with lazy inheritance.** Re-check the opener tab's grant on each
   navigation instead of only at `onCreated`. Small diff, but tabs with no
   opener still miss out, each tab still owns its own window, and everything
   dies with the worker.
2. **Shared persisted session per block set.** One record per set, written when
   the countdown completes, checked by every tab in `checkTab`. Covers all tab
   origins, survives worker restarts, and makes the 15-minute window a property
   of the block set rather than of a tab. Chosen.
3. **Global list of grants.** Same as (2) but a list keyed by host rather than
   set. More bookkeeping for no gain, since `delayAllowMins` is itself per set.

## Design

### Session record

```js
gSessions[set] = { host, path, endTime }
```

`host` and `path` mirror the shape `allowBlockedPage` already computes from
`delayFirst` / `delayFirstMode`, so the session allows exactly what the per-tab
grant allows:

- `delayFirst` off: `host` = page host, `path` = exact page path.
- `delayFirst` on, mode "site": `host` = page host, `path` = null.
- `delayFirst` on, mode "block set": `host` = null, `path` = null.

### Writing a session

In `allowBlockedPage` (background.js:1527), after the existing per-tab fields
are set:

- Only when `delayAllowMins > 0`.
- If a session for `set` is still live, leave it alone and do not extend it.
  Otherwise a new delaying page every 14 minutes would roll the window forward
  forever.
- Otherwise write the record and persist it to `browser.storage.local` under
  `delaySessions`.

### Checking a session

In `checkTab` (background.js:485-520), inside the per-set loop, before the block
conditions:

```js
let session = getLiveSession(set, now);
if (session && sessionMatches(session, parsedURL)) {
    gTabs[id].secsLeft = session.endTime - now;
    gTabs[id].secsLeftSet = set;
    gTabs[id].showTimer = gOptions[`showTimer${set}`];
    continue;
}
```

`sessionMatches` uses the same host comparison as the existing per-tab check
(`isSameHost`, which already tolerates a `www.` prefix) and the same
`path == null || path == parsedURL.path` rule.

Expired sessions are dropped from memory and storage on the tick that finds
them, so a stale record cannot outlive its `endTime`.

### Loading at startup

`retrieveOptions` reads `delaySessions` with `browser.storage.local.get` and
loads it into `gSessions`, alongside the existing option load. Tab records stay
in `gTabs` and are untouched by this change, so a worker restart only loses the
non-session per-tab allowances, as it does today.

### Countdown blur

`onCountdownTimer` (blocked.js:118) currently clears the interval on the first
`document.hasFocus() === false` sample and never resumes. Change it to:

- Count consecutive unfocused samples; cancel only after 2 in a row (~2s), which
  absorbs the single-sample false that tab attach produces.
- If focus comes back before that, reset the counter and keep counting down.
- Restore the countdown text's `textDecoration` when a cancelled countdown is
  retried (page reload), so a stale strike-through does not persist.

Cancelling after the grace period stays a cancel, matching the option's wording.
Only the spurious single-sample case is fixed.

## What is left to the builder

- Whether to expose the session in `createBlockInfo` for debugging.
- Exact storage key name and whether the record needs a version field.

## Verification

Manual, in a loaded temporary extension:

1. Configure a set for `*.linkedin.com`, 15s delay, `delayCancel` on,
   `delayFirst` on with mode "site", `delayAllowMins` 15, `delayAutoLoad` on.
2. Open the delay page, let it complete, then Ctrl+click three sub-links. All
   three load without a delaying page.
3. Open the delay page, start the countdown, Ctrl+click a sub-link before it
   completes. The primary countdown keeps running.
4. With the countdown at ~5 seconds, switch to another tab for one second and
   back. The countdown continues rather than going strikethrough.
5. With the countdown at ~5 seconds, switch away for 5 seconds. It cancels as
   the option says.
6. After a grant, reload the extension (forces worker restart) and open a new
   tab on the site. It is still allowed until the window expires.
7. Wait past 15 minutes. The next navigation shows the delaying page again, and
   `delaySessions` in local storage no longer holds the record.
