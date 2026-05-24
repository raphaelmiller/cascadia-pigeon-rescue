# Christina, here's what to try tonight

Hi! Rafa and I built a lot. This is the 5-minute "what's new and where to click" guide so you don't have to hunt around. Be brutally honest in your feedback — anything that's confusing, ugly, slow, or wrong is worth flagging.

Two important things before you start:

1. **Nothing here is sending real texts or emails yet.** I'm stubbing both until you give us the green light to provision Twilio + Resend. You'll see a yellow "stub mode" banner on a couple of pages explaining this — that's expected. SMS dispatch fully *works* end-to-end in the database; it just hasn't been wired to live providers.

2. **You don't need a password.** Sign in with the dropdown — there's an account for you (Christina), one for each of three test volunteers (Maya, Theo, Sam), and you'll see all four when you load the page.

---

## The two URLs

| Surface | URL |
|---|---|
| 🏥 Admin (your existing app) | https://extraction-parameters-jaguar-warrant.trycloudflare.com |
| 🐦 Volunteer portal (new!) | https://demonstration-behind-ballet-petroleum.trycloudflare.com |

Admin login: password `dev-password`.
Volunteer login: pick from the dropdown.

---

## 5-minute path

### Minute 1: See the dispatch loop in action (as a volunteer)

1. Open the **volunteer URL**.
2. Sign in as **Theo Park** (transport + rescue).
3. He should land on his home page with a card or two under **"Awaiting your action"**. That's the magic — those cards are rescue/transport jobs that were dispatched to him because his availability overlaps NOW and he has the right role.
4. Tap **Claim Point Person** on one of them. Watch the card flip to "You are Point Person" with new resolution buttons (Rescued / Escaped / Unable, or Delivered / In Transit / Cancelled). Tap one. Job's resolved, his service record gets points.

That's the whole core loop — file a job, volunteer claims, volunteer resolves.

### Minute 2: See the coordinator view (as you)

1. Sign out (top right), sign in as **Christina ★** from the dropdown.
2. You'll see a **Dispatch** tab in the nav. Tap it.
3. This is the dispatch board — every open rescue + transport job in one place, grouped by urgency (Emergency / Escalated / Routine).
4. On any unclaimed job you'll see three coordinator-only buttons: **Claim on behalf of…** (dropdown of candidates), **Re-dispatch** (re-runs the candidate search), **Escalate** (forces the next tier).
5. If there are any **pending reviews** (right now there might not be — depends on whether you or Rafa have triggered any), they'll appear above the jobs list. Tap **Full queue →** to see the dedicated approval queue page.

### Minute 3: See your service record (as Theo, who has activity)

1. Sign out, sign back in as **Theo Park**.
2. Tap **Record** in the nav.
3. Trophy icon, big point total at the top, two gauges (Reliability + Activity), category breakdown, recent activity feed.
4. **No leaderboards.** This is your record, not your ranking. Same page for every volunteer — they see only their own.

### Minute 4: See the rules engine (as admin)

1. Open the **admin URL** and sign in if you haven't.
2. Tap **Volunteers** in the secondary nav (the wide tab strip near the top).
3. Tap **Point rules** in the top-right.
4. You'll see all 43 rules grouped by category. **All start disabled** — a blue banner at the top explains why.
5. Tweak a points value (try Foster → "Foster daily check-in" — suggested 1 pt). Tap **Save** on that row. Then check the **Enabled** box and save again. From now on, every foster check-in awards your chosen points.
6. **Important:** the suggested values are just my starting guesses. Tune them to what makes sense to you before flipping rules on.

### Minute 5: Onboard a real volunteer (dry run)

1. Still in admin → **Volunteers** → tap **Onboard volunteer**.
2. Fill it in for a fake person (or yourself, if you want).
3. Save. You should see them appear in the list.
4. Tap **Manage →** on them. You can edit roles, link them to existing Foster/Transport/Rescue records, **seed historical points** (button on the right), or disable them.

When you're ready to bring real volunteers on, this is where you do it. The historical-points seeder is exactly the workflow we discussed — paste their self-described contribution summary, enter point values per historical category, click submit, all the events get logged as `approved` so they show up immediately on the volunteer's service record.

---

## Things to look at specifically

### The dispatch loop
- Does the "Awaiting your action" feed feel right? Wrong info? Missing buttons?
- When you tap Claim Point Person, does the feedback feel immediate enough?
- Resolution buttons (Rescued / Escaped / etc.) — right options? Right wording?

### The dispatch board
- Is it scannable? Can you tell at a glance which jobs need your attention?
- Tier indicators (T1 / T2 / T3 + "Tier expires in N min") — useful or noise?
- Coordinator action buttons — useful or clutter?

### The rules engine
- 43 rules — too many? Too few? Are there events I'm not capturing?
- Suggested point values — directionally right? Wildly off?
- Categories (Rescue / Transport / Foster / Check-in / Coordination / Historical) — the right groupings?

### Service record
- Reliability gauge — does the calculation feel fair? It looks at claims accepted vs. declined vs. no-response.
- Activity gauge — based on events in last 30d + 90d, decayed if dormant. Feel right?
- "Lightly active" / "Mixed" / "Could improve" — language OK or too judgmental?

### Foster check-in
- Sign in as **Maya Rivers** and look at `/birds`.
- The check-in form — fast enough? Right pulse options (All good / Watching / Concern)?
- The blue "haven't checked in in N days" banner — supportive enough, or naggy?

### Onboarding flow
- The role-tag list — right roles, right names?
- Auto-linking to existing Foster/Transport/Rescue records by email — does it find what you'd expect?

---

## What's still TODO before we go live with real volunteers

I'm flagging these so you know what's NOT done yet:

1. **Real Twilio + Resend** — stubs work; switching to live is a one-line env change after you create the accounts.
2. **Production deploy** — currently running on Rafa's Mac through a tunnel. Real hosting (Vercel + Turso) is ready to go, needs to be flipped on.
3. **Cron pings** — the escalation sweeper and daily digest need a production cron to ping them every minute / once a day. Endpoints exist; just need a cron service wired up.
4. **Christina's real phone number** — currently `+15035550100` placeholder. Once you give it to us, Tier-3 escalations will route to you for real.
5. **Onboard the actual volunteers** — once you've decided on the role tags and point values.

---

## Tell us what you think

Bug list, gut reactions, "this is wrong," "this is great," "why does it do this," all welcome. We'd rather catch the ugly stuff now than after volunteers see it.

Thanks for taking the time to walk through it. 🐦

— Rafa & the AI
