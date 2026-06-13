# StreamShōgun Beta Launch Package

Last updated: 2026-06-12

Goal: get 10 serious users into StreamShōgun, learn what makes Pro worth paying
for, and convert the first 1-3 paid subscribers.

## Launch Rules

- Keep the promise narrow: StreamShōgun is bring-your-own-playlists software.
- Do not imply bundled channels, curated content, or hosted streams.
- Do not send Roku users to Stripe inside the Roku channel.
- Ask for feedback before asking for public promotion.
- Track every beta conversation in one spreadsheet or notes file.

## Who To Invite First

Prioritize users who already understand M3U/XMLTV and have a real organization
problem:

- People managing more than one playlist source.
- People switching between desktop machines.
- People who complain about EPG matching or guide gaps.
- People who want a clean desktop player instead of a browser tab.
- Roku users who want personal playlist playback and account-linked Pro.

Avoid vague "streaming fans" at first. They create noise and support risk.

## Founder Invite Message

Use this for DMs, Discord, email, or small community replies:

```text
Hey, I am opening a small beta for StreamShōgun.

It is a desktop app for organizing and watching your own M3U playlists with XMLTV guide support. It does not provide channels or playlists; it is just the player/organizer.

I am looking for a few people who already use M3U/XMLTV and can give direct feedback on playlist management, EPG matching, cloud sync, and the Pro upgrade flow.

Free works for one playlist. Pro unlocks unlimited playlists, cloud sync, smart EPG matching, multi-EPG merge, auto-refresh, PiP, Discord Presence, and Roku Pro entitlement support.

If you want to try it, I can send you the beta link and a founder promo code.
```

## Short Public Post

```text
I am opening a small beta for StreamShōgun.

It is a bring-your-own-playlists desktop media player for M3U playlists, XMLTV guides, and HLS streams. No bundled content, no channel directory, no hosted streams.

Looking for users who already manage M3U/XMLTV setups and want better playlist organization, EPG matching, cloud sync, and a cleaner desktop experience.

Reply or DM if you want the beta link.
```

## Technical Build-In-Public Post

```text
Small StreamShōgun update:

The Pro checkout flow now works end-to-end in test mode:
- Stripe Checkout opens from the app/API
- Success and cancel return pages exist
- Webhooks update the server subscription
- /v1/features returns Pro entitlements
- Trialing subscriptions unlock Pro immediately

Next: founder beta and production billing smoke test.
```

## Beta Intake Questions

Ask these before sending the link:

1. How many playlist sources do you actively manage?
2. Do you use XMLTV/EPG today?
3. What app/player do you currently use?
4. What is the most annoying part of your current setup?
5. Would you want sync across devices, or is local-only enough?

## After-Install Questions

Ask these after first use:

1. Did you reach first successful playback?
2. Was playlist import clear?
3. Did the guide/EPG match what you expected?
4. Which Pro feature felt most worth paying for?
5. What made you hesitate or distrust the product?

## First 10 Users Checklist

For each user:

- [ ] Sent beta link.
- [ ] Confirmed they understand bring-your-own-content.
- [ ] Confirmed first playlist import.
- [ ] Confirmed first successful playback.
- [ ] Asked the after-install questions.
- [ ] Logged their main objection.
- [ ] Logged the feature that would make them pay.
- [ ] Offered founder promo code if they are a strong fit.

## Founder Promo Setup

Create one Stripe coupon/promotion code for founder outreach:

- Name: `Founder Beta`
- Suggested code: `FOUNDER`
- Discount: 20-30% for the first 3 months, or 20% forever for the first 100 users.
- Limit redemption count to avoid accidental public spread.
- Keep annual pricing visible as best value.

Do not discount so heavily that the paid signal becomes meaningless.

## Success Criteria

The beta is working if:

- 10 users install or register.
- 7 users import a playlist.
- 5 users reach first successful playback.
- 3 users identify one Pro feature they would pay for.
- 1-3 users start a Pro trial.

## Stop Conditions

Pause acquisition and fix product/copy if:

- Users think StreamShōgun provides channels.
- More than two users cannot import a playlist without help.
- Checkout succeeds but Pro does not appear.
- Users distrust the billing/legal/content positioning.

## Manual Tracker Columns

Use these columns in a spreadsheet:

```text
Name
Contact
Source
Playlist count
Uses XMLTV
Current player
Imported playlist
First playback
Pro feature wanted
Main objection
Trial started
Paid
Follow-up date
Notes
```
