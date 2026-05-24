# CPR Volunteer Portal — Phase 1 Verification QA Report

**Date:** 2026-05-23
**Tester:** Subagent QA pass
**Volunteer host:** https://demonstration-behind-ballet-petroleum.trycloudflare.com
**Admin host:** https://extraction-parameters-jaguar-warrant.trycloudflare.com
**Method:** Dev-bypass sign-in as each of the three seeded volunteers, walked every route, hit cross-role URLs directly, checked admin-host isolation.
**Screenshots:** `qa-screenshots/2026-05-23-phase1-verify/`

---

## TL;DR

1. **`/transport` and `/rescue` are STILL PhaseStubs** — both routes render the `Coming in Phase 1` badge. Phase 1 did NOT ship them. `/birds`, `/shifts`, `/dispatch` are real pages with real content.
2. **`/profile` also still has a Phase-1 placeholder line** — every profile page (all 3 accounts) renders the literal copy `"Edit form ships in Phase 1. For changes, message a coordinator."` This is technically not the `PhaseStub` shell, but it is "Phase 1" placeholder copy on a route that the task lists as "should be real."
3. **No admin UI leak.** Volunteer portal renders the `CPR Volunteer` 🕊️ chrome only. No `CPR Ops` nav, no admin links, no cross-host URLs anywhere in the volunteer pages.
4. **No admin data leak detected** within what's testable. Home-dashboard "Awaiting your action" feed is correctly role/assignment-scoped (Maya 0, Theo 2 jobs assigned to him, Sam 2 jobs as coordinator). `/birds` is data-scoped (Maya and Sam both see 0 with clean empty state). Transport/rescue list-scoping cannot be verified because those routes are still PhaseStubs and don't render a list.
5. **Role-gating works.** Cross-role direct URLs (Maya→transport/rescue/dispatch, Theo→birds/dispatch) all redirect to `/`.
6. **Admin host is properly isolated.** With a volunteer session active on the volunteer host, visiting the admin host redirects to `/login?next=%2F` and demands the admin password. No auth bleed-through.

---

## "Coming in Phase 1" leftovers

### 1. `/transport` — PhaseStub (BROKEN — should be real)

Rendered when signed in as Theo Park and as Sam Hale. Exact wording:

> 🚚
> **Transport** *(h1)*
> **Coming in Phase 1** *(badge)*
> Your assigned and available transport jobs will show up here. Claim a pickup, mark it picked-up / delivered, and your service record updates automatically.
> ← Back to your home

Screenshots: `theo-02-transport-PHASESTUB.png`, `sam-03-transport-PHASESTUB.png`

### 2. `/rescue` — PhaseStub (BROKEN — should be real)

Rendered when signed in as Theo Park and as Sam Hale. Exact wording:

> 🚨
> **Rescue** *(h1)*
> **Coming in Phase 1** *(badge)*
> Open rescue cases in your area, your assignments, and Point Person status will live here. Emergencies (deadline < 30 min) fire to you and the coordinators simultaneously.
> ← Back to your home

Screenshots: `theo-03-rescue-PHASESTUB.png`, `sam-04-rescue-PHASESTUB.png`

### 3. `/profile` — Phase-1 placeholder line on every account

Not a full PhaseStub, but the page contains this literal Phase-1 copy at the bottom for all three accounts:

> *"Edit form ships in Phase 1. For changes, message a coordinator."*

The rest of the profile (name, email, roles, foster/transport/rescue detail blocks) is real data. Only the edit form is missing.

Screenshots: `maya-04-profile-PHASE1-LEFTOVER.png`, `theo-05-profile-PHASE1-LEFTOVER.png`, `sam-06-profile-PHASE1-LEFTOVER.png`

### Phase-1-clean routes (real content, no placeholder)

- `/` (dashboard) — real, with role-scoped "Awaiting your action" feed and section cards
- `/birds` — real, with quick check-in form + "Birds in your care (N)" list + clean empty state
- `/shifts` — real "My Availability" form with kind / scope / RRULE / weekday selection / notes
- `/dispatch` — real "Dispatch Board" with emergency + open-job counts, lists (Sam only)
- `/auth/sent` — real "Check your email" page reached after submitting the magic-link form

### Summary

| Route | Status |
|---|---|
| `/` | ✅ Real |
| `/birds` | ✅ Real |
| `/transport` | ❌ **Still PhaseStub** |
| `/rescue` | ❌ **Still PhaseStub** |
| `/shifts` | ✅ Real |
| `/profile` | ⚠️ Real page with `"Edit form ships in Phase 1"` placeholder line at bottom |
| `/dispatch` | ✅ Real (coordinator-gated) |
| `/auth/sent` | ✅ Real |

---

## Admin leaks (UI + data)

**NONE FOUND.**

### Admin UI on volunteer host

For all three accounts, every volunteer page renders ONLY the `🕊️ CPR Volunteer` chrome with the appropriate role-scoped nav:

- **Maya (foster + med_admin):** Home, My Birds, Shifts, Profile
- **Theo (transport + rescue):** Home, Transport, Rescue, Shifts, Profile
- **Sam (all + coordinator):** Home, My Birds, Transport, Rescue, Shifts, Profile, Dispatch

No `CPR Ops` admin nav appears. No `Birds`/`Fosters`/`Meds`/`Requests`/`Calendar`/`Digest`/`Drivers`/`Emergency` admin links appear. All link `href`s on volunteer pages are relative (root-path) and stay on the volunteer host.

### Admin data on volunteer host

| Test | Result |
|---|---|
| Maya `/birds` shows only her foster's birds | ✅ Shows 0 with clean empty state: *"No birds currently linked to your foster record. Christina assigns birds via the admin app."* |
| Sam `/birds` shows only her foster's birds | ✅ Shows 0, same clean empty state |
| Theo home "Awaiting your action" | ✅ Shows 2 items both tied to Theo (one as Point Person, one Emergency he can claim). No other fosters' birds, no unrelated transport jobs. |
| Sam home "Awaiting your action" | ✅ Shows 2 items consistent with coordinator+ all-role view (same jobs; one shows "Point Person: Theo Park") — consistent with her elevated scope, not a leak |
| Maya home | ✅ "Nothing on your plate right now" — clean empty state |
| `/dispatch` (Sam only) data | ✅ 2 open jobs (1 emergency, 1 routine), all data that a coordinator is supposed to see |
| Maya & Theo `/dispatch` direct URL | ✅ Both redirect to `/` (not coordinator) |
| Theo `/birds` direct URL | ✅ Redirects to `/` (no foster role) |
| Maya `/transport` direct URL | ✅ Redirects to `/` (no transport role) |
| Maya `/rescue` direct URL | ✅ Redirects to `/` (no rescue role) |

Caveat: full data-scoping cannot be confirmed for `/transport` and `/rescue` because both still render the PhaseStub — there's no list to inspect. The role-gate at least correctly redirects users who lack the role.

### Admin-host isolation

- Visited the admin host (`extraction-parameters-jaguar-warrant.trycloudflare.com`) while Sam (volunteer with coordinator + all roles) had an active volunteer session on the volunteer host.
- Admin host redirected to `https://extraction-parameters-jaguar-warrant.trycloudflare.com/login?next=%2F` with the `CPR Ops · Admin sign-in` password screen. Screenshot: `admin-09-blocks-volunteer-sam.png`.
- Confirmed: the admin host uses a separate session-token cookie scoped to its own domain, and the volunteer session does NOT grant admin access.
- Note: an earlier visit to the admin URL *did* show the full CPR Ops UI without a password prompt, but that was caused by a pre-existing admin session cookie persisted in this Chrome profile from prior testing (the admin app gives 30-day sessions). After signing out of admin and revisiting from a volunteer session, the admin host blocked access as expected.

---

## Misc observations (not blockers)

- `Dev bypass is ON` banner is prominently shown on `/login` — expected for dev, will need to be off in prod.
- `/auth/sent` page exposes a dev-note revealing the magic-link is logged to `uploads/_outbox/email.log` when `RESEND_API_KEY` is unset. Expected for dev, should be gated to dev-only in prod.
- Maya's `/birds` empty-state copy names "Christina" — fine if Christina is the real coordinator name; flag if it's seed-data leaking.

---

## Verdict

**Question 1: Phase 1 leftover placeholders?**
**YES.** Three routes:
- `/transport` (full PhaseStub)
- `/rescue` (full PhaseStub)
- `/profile` (one Phase-1 placeholder line — `"Edit form ships in Phase 1. For changes, message a coordinator."`)

**Question 2: Admin UI or admin data leaks on the volunteer portal?**
**NO.** Volunteer chrome is clean. Role-gating redirects users without the right role. No admin nav/links/data observed on any volunteer route. Admin host is auth-isolated.
