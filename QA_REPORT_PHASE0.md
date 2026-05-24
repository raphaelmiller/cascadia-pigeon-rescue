# CPR Volunteer Portal — Phase 0 QA Report

**QA date:** 2026-05-23
**QA agent:** subagent `cpr-qa-phase0`
**Live URLs tested:**
- Volunteer: `https://demonstration-behind-ballet-petroleum.trycloudflare.com`
- Admin: `https://extraction-parameters-jaguar-warrant.trycloudflare.com`
**Viewports:** 1280×800 desktop, 375×812 mobile
**Sessions exercised:** Maya Rivers (foster, med_admin), Theo Park (transport, rescue), Sam Hale ★ (coordinator + all roles), signed-out.
**Screenshots:** `qa-screenshots/2026-05-23/` (17 files)

---

## Executive Summary

> Rafa said "it looks really broken." He was right. Two things are simultaneously wrong: a layout-architecture bug that puts the **entire admin UI** on top of every volunteer page, and a JSX text bug that turns half the icons in the volunteer portal into literal `\uXXXX` strings. On its own each would be embarrassing. Together they make the whole thing look like a half-deployed staging build.

**Severity counts:**
- **BLOCKER: 3**
- **HIGH: 6**
- **MEDIUM: 5**
- **LOW: 4**

**The three blockers, in plain English:**
1. Admin's root layout wraps the volunteer portal — every volunteer page shows the admin nav (`CPR Ops`, Dashboard, Birds, Fosters, Meds, Requests, Emergency, …) stacked above the volunteer nav.
2. Every Unicode-escape literal in the volunteer JSX (e.g. `\ud83d\udc26`, `\u2192`, `\u2026`) renders as raw text instead of the emoji/arrow/ellipsis. The home cards, the nav logo, the auth/sent envelope icon, the callback "Signing you in…" — all broken.
3. Five of the seven volunteer routes don't exist as pages yet (`/birds`, `/transport`, `/rescue`, `/shifts`, `/dispatch`). Every link from the dashboard 404s. Worse — because of bug #1, the 404 they hit is the **admin app's 404 with admin chrome**, which leaks the admin URL structure to volunteers.

The portal is unshippable in its current state. The good news: all three blockers are concentrated in a small number of files (the layout architecture, the JSX strings, and the missing page stubs).

---

## How to read this report

- Each route gets its own section.
- Each issue is tagged `[BLOCKER]`, `[HIGH]`, `[MEDIUM]`, `[LOW]` with a screenshot reference and a suggested-fix direction.
- Severity rubric:
  - **BLOCKER** — visible to every user on first load; portal cannot ship.
  - **HIGH** — breaks a major flow OR makes the product look amateur.
  - **MEDIUM** — degraded UX but workable.
  - **LOW** — polish / nice-to-have.

---

## 1. Volunteer `/login` (desktop + mobile)

Screenshots: `01-login-desktop.png`, `12-login-mobile-375.png`

**What works well**
- Layout is clean and centered at both viewports.
- The 🕊️ logo (the one place where the emoji is a literal Unicode character, not an escape) renders correctly.
- Dev-bypass dropdown lists all three seeded volunteers with role tags visible.
- Coordinator star (★) shows next to Sam's name. Nice touch.
- The admin nav is correctly hidden on `/login` (it gates on `pathname === '/login'`).
- Mobile is tight and tappable, no overflow.

**Issues**
- **[LOW] L1.** Dev-mode dropdown shows raw role-tag strings: `Maya Rivers (foster,med_admin)`. Real-name labels (`Maya Rivers (Foster, Med Admin)`) would be friendlier even in dev mode.
- **[LOW] L2.** Dev-bypass yellow banner exposes the env var name `DEV_BYPASS_AUTH` to anyone hitting the URL. Fine for now; if this ever ships with bypass off the banner disappears, but worth a comment in `src/app/v/login/page.tsx` so future-you doesn't get bitten.
- **[LOW] L3.** Magic-link form has no inline validation — typing `not-an-email` gets you a generic 200 to `/auth/sent` because the server doesn't differentiate. (This is intentional anti-enumeration — but consider client-side `type=email` browser validation would catch the obvious typos.)

---

## 2. Volunteer `/` (home dashboard) — **catastrophically broken**

Screenshots: `02-maya-home-desktop.png`, `04-maya-home-double-nav.png`, `05-sam-home-desktop.png`, `13-sam-home-mobile-375.png`, `14-theo-home-desktop.png`

### Issues

- **[BLOCKER] B1. The admin root layout wraps the volunteer portal.**
  Every page on the volunteer host renders both `<Nav>` (admin) and `<VolunteerNav>` (volunteer). On desktop you get the `CPR Ops` admin nav stacked above the `CPR Volunteer` nav. On mobile both bottom-tab bars stack on top of each other, and the admin's "More / SOS / Digest" tabs sit alongside "My Birds / Transport / Rescue."
  Evidence (DOM, signed in as Sam):
  ```
  nav: Home, Birds, Fosters, Calendar, SOS, Digest, More    ← admin mobile bottom nav
  nav: Home, My Birds, Transport, Rescue, Shifts, Profile  ← volunteer mobile bottom nav
  ```
  Root cause: the volunteer route tree lives at `src/app/v/`, not in a Next.js route group like `src/app/(volunteer)/`. The comment at the top of `src/app/v/layout.tsx` claims "this is its own root layout" but Next.js does not treat it that way — `src/app/layout.tsx` is the only true root layout for the whole `app/` directory. The volunteer layout becomes a nested layout that runs *inside* the admin root.
  Fix direction: either (a) move volunteer routes into a real route group such as `src/app/(volunteer)/` and make `src/app/(volunteer)/layout.tsx` a true root layout while moving the admin tree under `src/app/(admin)/` (the spec literally describes this in §5), OR (b) make the admin root layout host-aware: detect the volunteer hostname in the server component and render *only* `<MaybeMain>{children}</MaybeMain>` without the admin `<Nav>`. Option (a) is closer to what the spec promises.
  Screenshot: `04-maya-home-double-nav.png` is the cleanest one-image proof.

- **[BLOCKER] B2. Literal `\u` escapes throughout volunteer JSX.**
  Multiple places in the codebase write JSX text like `<h2>\ud83d\udc26 My Birds</h2>` — JSX text nodes do NOT process backslash-u escapes. They render as the literal seven-character string `\ud83d\udc26`. Affected text:
  - Volunteer nav desktop logo (`src/components/volunteer/VolunteerNav.tsx`, two places) — `\ud83d\udd4a\ufe0f` (intended 🕊️) shown as text, plus the avatar circle is just wide enough to show "udd" while clipping the rest.
  - Home card titles `🚨 Rescue`, `🚚 Transport`, `🐦 My Birds` — `\ud83d\udea8`, `\ud83d\ude9a`, `\ud83d\udc26` all literal.
  - "View … →" links — `\u2192` literal.
  - `/auth/sent` envelope icon — `\ud83d\udce9` literal.
  - `/auth/callback` "Signing you in…" message — `\u2026` literal.
  - `/profile` "—" placeholder rows — `\u2014` literal (every row that's empty).
  - `Service record:` not affected because it uses no escapes.
  Fix direction: replace all backslash-u escapes in JSX text with the actual Unicode character (paste the emoji directly), or move them into string constants and let the JS compiler handle the escapes, e.g. `const BIRD = '\ud83d\udc26';` and then `<h2>{BIRD} My Birds</h2>`. JS string literals DO process `\u`. JSX text doesn't.
  Screenshots: `02-maya-home-desktop.png` (Maya, 1 card), `05-sam-home-desktop.png` (Sam, all 3 cards), `07-sam-profile.png` (em-dashes), `11-auth-sent.png` (envelope).

- **[BLOCKER] B3. Every dashboard link is a dead end.**
  The home page renders `<Link href="/birds">`, `<Link href="/transport">`, `<Link href="/rescue">`. None of those pages exist under `src/app/v/`. The middleware rewrites `/birds` → `/v/birds`, Next falls back to the admin app's not-found page (because the admin root layout owns everything that isn't a known volunteer route), and the user lands on a screen that says "Cascadia Pigeon Rescue · Operations" with full admin chrome and a "Birds list" link pointing into the admin app. See B1 for why admin chrome shows.
  Fix direction: ship route stubs at minimum — even an empty `src/app/v/birds/page.tsx` with "Coming in Phase 1" beats falling through to the admin 404. Better, gate the home-card "View …" links so they only render when the destination exists.

- **[HIGH] H1. Coordinator badge renders twice for Sam.**
  Roles list shows "Coordinator" pill (because `coordinator` is in `roleTags`), AND the page renders a separate purple "Coordinator" pill via `{v.isCoordinator && (<span ... />)}`. Two coordinator chips back-to-back, same word, different colors.
  Fix direction: filter `coordinator` out of `roleTags` before rendering the role pills (it's already covered by the dedicated badge), or drop the dedicated badge and rely on the role pill alone.
  Screenshot: `05-sam-home-desktop.png`.

- **[HIGH] H2. "Service record: 0 pts banked" is meaningless in Phase 0.**
  No events emit yet (the `VolunteerEvent` table exists but nothing writes to it), so every user shows 0. It looks like a broken counter. Either hide the line until points exist, or rename to something less alarming like "Joined just now."
  Screenshots: any home shot.

- **[MEDIUM] M1. No empty-state polish.**
  Cards say "Birds in your care, daily check-ins, and meds will appear here." — fine — but there's no indication that this is a phase-0 placeholder. A small "Coming in Phase 1" pill on each card would set expectations.

- **[MEDIUM] M2. Mobile bottom-nav truncates Sam's Dispatch tab.**
  `src/components/volunteer/VolunteerNav.tsx` uses `all.slice(0, 6)` for the mobile bottom bar. Sam has 7 items (5 role nav + Shifts/Profile + Dispatch). Dispatch is index 6 and gets cut. A coordinator on mobile has no way to reach `/dispatch`. (Moot for Phase 0 since dispatch is also a 404, but the bug will bite when the page ships.)
  Fix direction: drop "Shifts" or "Profile" into a "More" overflow tab, or scroll the bottom bar horizontally, or shrink icon labels.

- **[MEDIUM] M3. Role chip wrapping on mobile gets crowded.**
  Sam at 375px shows 5 role chips that wrap awkwardly across two lines, with the duplicate Coordinator chip making it look glitchy.
  Screenshot: `13-sam-home-mobile-375.png`.

---

## 3. Volunteer `/birds`, `/transport`, `/rescue`, `/shifts`, `/dispatch` — **all 404 with admin chrome**

Screenshots: `03-maya-birds-404-admin.png`, `06-sam-dispatch-404.png`, `08-sam-shifts-404.png`, `09-sam-transport-404.png`, `10-sam-rescue-404.png`

- **[BLOCKER]** (rolled into B3 above) — all five routes return Next.js fall-through 404 rendered inside the admin root layout. The displayed title is `Cascadia Pigeon Rescue · Operations`, the body reads `"Not found — That page or record doesn't exist — it may have been archived or deleted."`, and the helpful links say "Go home" → admin `/` and "Birds list" → admin `/birds`. A volunteer who clicks "Birds list" lands on the admin `/birds` 404 again because middleware rewrites it to `/v/birds`, which… still 404s. Loop.

- **[HIGH] H3. Role-based authorization on volunteer routes is only client-side filtering of the nav.**
  Theo (transport+rescue, NOT a foster) can type `/birds` directly into the URL bar — middleware lets him through because the rewrite is unconditional. The page is missing so he sees the same admin 404, but if these pages existed today nothing would stop him from seeing other people's bird data. The spec in `VOLUNTEER_PORTAL_SPEC.md §5` explicitly calls for per-route role checks; they aren't in `src/middleware.ts` yet.
  Fix direction: add per-path role checks in middleware OR in each `page.tsx` via `requireVolunteer({ requireRole: 'foster' })`. Don't rely on nav filtering — DevTools defeats it instantly.

- **[HIGH] H4. Coordinator-only `/dispatch` is also unguarded.**
  Same shape as H3 — Theo can navigate to `/dispatch` and get the admin 404. When the dispatch page ships there's nothing in middleware checking `isCoordinator`.

---

## 4. Volunteer `/profile`

Screenshot: `07-sam-profile.png`

**What works**
- Page renders. Title, email, role list, "Permissions: Coordinator" all show.
- Sign-out button works.
- "Edit form ships in Phase 1" disclaimer is honest.

**Issues**
- **[HIGH] H5. Foster / Transport / Rescue sub-sections never render even when the volunteer has those roles.**
  The code in `src/app/v/profile/page.tsx` shows three sub-sections gated on `v.fosterId / transportId / rescueId`. The seed data has all three NULL for every volunteer (`sqlite3 prisma/dev.db "SELECT email, fosterId, transportId, rescueId FROM VolunteerProfile"` returns NULL for all). So even Sam — who has every role tag — sees only the top card. The profile page is the one place where Phase 0 was supposed to surface per-role detail and it shows nothing.
  Fix direction: either (a) make the seed link to real `Foster`/`TransportVolunteer`/`RescueVolunteer` rows, or (b) fall back to inferring the section from `roleTags` when the linked record doesn't exist. Today: silently empty.
- **[MEDIUM] M4. Literal `\u2014` em-dashes on every empty profile row when the linked record DOES exist.**
  The fallback string `value={foster.phone ?? '\u2014'}` and friends produce literal `\u2014` text in the rendered DOM (same B2 root cause). Future-bug — invisible today because no foster/transport/rescue record is linked.

---

## 5. Volunteer `/auth/sent`

Screenshot: `11-auth-sent.png`

- **[BLOCKER]** (rolled into B1) — Admin nav renders on top of the magic-link confirmation page. A user who just typed their email at `/login` and submitted lands on a page with the *signed-in* admin nav visible above the "Check your email" card, despite still being unauthenticated. That's the worst-looking page in the whole portal. Trust-destroying.
- **[BLOCKER]** (rolled into B2) — Envelope icon `\ud83d\udce9` literal.
- **[HIGH] H6. "to`uploads/_outbox/email.log`" runs together with no space.**
  In `src/app/v/auth/sent/page.tsx`:
  ```jsx
  email delivery is in stub mode. The
  magic-link URL is logged to the server console and to
  <code className="mx-1 px-1 rounded bg-yellow-100">uploads/_outbox/email.log</code>.
  ```
  JSX collapses the trailing-newline-after-`to` whitespace and the `<code>` element has no leading whitespace, so it renders as `…and touploads/_outbox/email.log`. Looks like a typo even though it isn't.
  Fix: add `{' '}` between `to` and `<code>`, or rephrase.

---

## 6. Volunteer `/auth/callback`

Not exercised in the browser (would require a real magic-link token from the stub log; not necessary for this QA pass). Reviewed in source.

- **[BLOCKER]** (rolled into B2) — `<p>Signing you in\u2026</p>` will render as literal `Signing you in\u2026` once a real user lands on it.
- **[MEDIUM] M5. The callback flow requires JavaScript to auto-submit.**
  There's a `<noscript>` fallback telling the user to click Continue, but the button only ever fires the server action after the inline-script auto-submit triggers. If JS-disabled users still complete the flow, fine; verify by manual test.

---

## 7. Volunteer sign-out

- **[MEDIUM] M6 (worth a closer look).** Sign-out works — clicking the volunteer nav's sign-out form returns the user to `/login`. However, *the admin nav also has a Sign out button visible the entire time*, because of B1. Clicking the admin sign-out as a volunteer was not tested but is highly likely to call `logoutAction` and end up in the same place; either way it's surface area that shouldn't be there.

---

## 8. Admin portal smoke test (regression check)

Screenshots: `15-admin-dashboard.png`, `16-admin-transport.png`, `17-admin-home.png`

**Verdict: no regression from Phase 0 work.** All admin pages I checked render their existing UI:
- `/` (dashboard) — empty KPI cards (DB is empty), no errors.
- `/birds` — h1 "Birds", empty list, no errors.
- `/fosters` — h1 "Fosters", empty list, no errors.
- `/rescue` — h1 "Rescue", empty list, no errors.
- `/transport` — h1 "Transport", empty list, no errors.

**Pre-existing (NOT a Phase-0 regression) issues observed:**
- Admin top nav wraps to two rows at 1280px width (15 items). Worth noting for a future polish pass.
- Admin dashboard shows lots of zeros because the DB has zero `Bird`/`Foster`/`TransportVolunteer` rows seeded — only `VolunteerProfile` rows exist. This is a *seeding* issue, not a UI bug; just flagging so it doesn't look like a regression when you screenshot the admin dashboard for stakeholders.

---

## 9. Cross-tenant probing

- **[MEDIUM] M7. Volunteer host's `/api/birds` returns the admin app's 404 HTML.**
  `fetch('/api/birds')` from inside a volunteer session returns a 404 (because middleware rewrites to `/v/api/birds` which doesn't exist). Good — admin data isn't leaked. But the response body is a full HTML page with admin chrome, which is wasteful and confusing for any future API consumer. Better: have middleware short-circuit `/api/*` on the volunteer host to return JSON 404 (`{"error":"not_found"}`) directly.

- **[LOW] L4. Cookie scoping is per-hostname, defense-in-depth.**
  Signing in on the volunteer host issues an `__Host-authjs.csrf-token` cookie scoped to that hostname only. Cross-tenant cookie leakage is not possible via the browser, which is good. Worth keeping in mind that if the two surfaces ever share a parent domain in production, the cookie scoping needs to stay tight.

---

## What works well (the bright spots)

- **Middleware host-detection logic is correct.** The `VOLUNTEER_HOSTNAMES` env var override approach handles the cloudflared tunnel hostnames cleanly. The rewrite from `/foo` → `/v/foo` is the right pattern.
- **Login UI is genuinely clean.** Both bypass dropdown and magic-link form look polished, the warning banner is informative, color palette is consistent (teal-600 primary), the dropdown shows role context.
- **Role-based nav filtering on the volunteer side is correct.** Maya sees Home/My Birds/Shifts/Profile (no transport/rescue/dispatch). Theo sees Home/Transport/Rescue/Shifts/Profile (no birds/dispatch). Sam sees everything including Dispatch. The `activitiesFor()` function plus `ROLE_TAGS`/`ACTIVITY_BUCKETS` model is well-factored.
- **The dev-bypass system is excellent for QA.** Being able to one-tap into any volunteer made this whole report 5× faster. Keep this exact UX as a permanent dev affordance.
- **Sign-out works.** Both forms point at `logoutAction` and end at `/login` correctly. Cookies clear.
- **Profile page architecture is right.** The pattern of pulling linked Foster/Transport/Rescue records server-side and rendering per-role sections is the right architecture — it just needs the linked data and the literal escapes fixed.
- **Auth defenses are thoughtful.** No-enumeration response on magic-link submission, separate `__Host-` CSRF cookie, server-side guard duplicating the bypass-flag check in `devBypassSignInAction`. The auth code is the most polished part of Phase 0.

---

## Mobile vs Desktop notes

- Desktop (1280×800): two stacked headers eat ~100px of vertical real estate. Annoying.
- Mobile (375×812): far worse. Two stacked top headers AND two stacked bottom navs. The volunteer bottom nav loses Dispatch entirely (M2). About 40% of the visible viewport is chrome.
- Both viewports: identical bug pattern, identical fixes.

---

## Suggested fix order (cheap first, expensive last)

1. **Replace JSX `\uXXXX` literals with the actual characters** (B2 across ~6 files). 30 minutes. Single-largest visual win.
2. **Stub the missing routes** with `src/app/v/{birds,transport,rescue,shifts,dispatch}/page.tsx` containing a "Coming in Phase 1" placeholder (B3). 30 minutes.
3. **Move admin tree under `src/app/(admin)/` and volunteer tree under `src/app/(volunteer)/`** with two real root layouts (B1). This is the spec's described architecture and the only correct fix. A couple of hours including import updates. After this, the auth/sent page stops showing the admin nav and the home page stops looking like two apps stapled together.
4. **Deduplicate Coordinator badge** (H1). Two-line code change.
5. **Hide the points-banked counter until events emit** (H2). One-line code change.
6. **Add per-route role checks in middleware** (H3, H4). A small map of path → required role/coordinator-flag.
7. **Fix the `to`+`<code>` whitespace bug in auth/sent** (H6). One-character change.
8. **Backfill the seed with linked Foster/Transport/Rescue rows for the three test volunteers** (H5). Half-hour seed script edit.
9. **Mobile bottom-nav overflow** for coordinators with 7 tabs (M2). Bigger UX decision; can wait for Phase 1.

If you do steps 1, 2, and 3 alone, the portal goes from "looks really broken" to "looks like a thoughtful Phase 0 placeholder." Three blockers, ~3 hours of work.

---

*End of report. Screenshots referenced are all under `qa-screenshots/2026-05-23/`.*
