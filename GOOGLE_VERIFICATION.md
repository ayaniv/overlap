# Google OAuth verification — prep notes

Working doc for taking `overlap`'s OAuth consent screen from **Testing** to
**In production** (standard verification, not restricted-scope — `calendar.events`
is a "sensitive" scope, so this does not require a security assessment). Not
deployed; lives only in the repo for the developer's own reference.

## 1. Scope justification (paste into the consent-screen form)

Google's verification form asks, for each sensitive/restricted scope requested,
"How will the requested scope be used?" Use this for `.../auth/calendar.events`:

> overlap is a free, open-source world clock (https://overlapclock.com)
> that lets a user compare working hours across timezones and schedule a
> meeting at an overlapping time. When a user drags the clock face to preview a
> meeting time and taps "Schedule," the app requests the calendar.events scope
> so it can create a single event on that user's own primary Google Calendar,
> at the exact time they selected, with a title summarizing which locations are
> meeting. If the user later removes that meeting from the app, the app uses
> the same scope to delete the corresponding event from their calendar.
>
> This is the only use of the scope: creating and deleting events the user
> explicitly initiates through the app's UI. The app never reads, lists, or
> browses the user's existing calendar events, never creates events the user
> didn't request, and never shares calendar data with any third party. The
> entire flow is client-side — there is no backend server; the user's browser
> calls the Google Calendar API directly using a Google Identity Services
> access token that is held in memory only and is never transmitted to or
> stored by the app's developer.

Keep this to what the reviewer asked; don't paste the whole privacy policy —
link it separately in the field provided for that.

## 2. Manual checklist (developer only — needs your own Google session)

1. Open the OAuth consent screen settings page for the project:
   https://console.cloud.google.com/apis/credentials/consent
2. Confirm **User type** is External (required for a public-facing app) and
   the **App name**, **support email**, and **app logo** (optional) are filled
   in.
3. Under **App domain**:
   - **Application home page**: `https://overlapclock.com`
   - **Application privacy policy link**:
     `https://overlapclock.com/privacy.html`
   - **Application terms of service link**: optional; skip unless you want one.
4. Under **Authorized domains**, confirm `overlapclock.com` is listed — **not**
   `vercel.app`. `vercel.app` is on the public suffix list (like
   `blogspot.com`, `appspot.com`), so Google refuses to treat it as something
   you can "own," and branding verification will permanently fail with "the
   website of your home page URL is not registered to you" no matter how many
   times you re-verify it in Search Console. This is why the app now has its
   own custom domain instead of the free `overlap-clock.vercel.app` subdomain.
5. Under **Scopes**, confirm `.../auth/calendar.events` is listed as a
   requested scope, and paste the justification text from section 1 above
   into its "how will you use this scope" field.
6. Under **Test users**, no changes needed yet — leave existing test users in
   place until verification is approved, so you're not locked out mid-review.
7. Record and upload the demo video (see script below) — Google requires this
   for sensitive-scope verification. Host it unlisted on YouTube (their
   typical accepted format) and paste the link into the verification form.
8. Click **Publish app** to flip Testing → In production. This is what
   actually triggers the verification review for a sensitive scope.
9. Submit for verification. Google will email updates to the support email on
   the consent screen; expect them to sometimes ask follow-up questions by
   email before approving — check that inbox during the review window.
10. Once approved, the "unverified app" warning screen disappears for all
    users, not just added test users.

## 3. Demo video script

Google's reviewers watch this to confirm the scope is used the way the
justification text describes. Keep it short (2–3 minutes), screen-recorded,
narrated or captioned. Suggested shot list:

1. **Open the app** at the public URL (`overlapclock.com`) in a normal
   (not signed-in) browser window — show the clock loads with no login wall.
2. **Show the base experience** working without Google at all: drag/scrub the
   clock face to preview a different time, point out the working-hours rings
   overlapping — this establishes the scope isn't required for the app's core
   value.
3. **Trigger the OAuth flow**: tap the schedule/calendar action. Show the
   Google sign-in popup, then the **consent screen itself** listing the
   `calendar.events` scope — pause here so the reviewer can read it.
4. **Grant consent**, and show the app's confirmation ("Meeting scheduled" /
   the toast).
5. **Switch to Google Calendar** (a real tab) and show the event that was just
   created — same title, same time — proving the scope did exactly what was
   claimed.
6. **Optional but recommended**: repeat the flow to show *removing* a meeting
   from the app, then flip back to Google Calendar to show the event is gone —
   demonstrates the delete path also stays inside the claimed scope.
7. Close with the privacy page (`/privacy.html`) on screen for a beat, so the
   reviewer can see it's linked and matches what was described.

Narration/captions should stay close to the justification text in section 1 —
reviewers cross-check that the video and the written justification tell the
same story.

## What's already done vs. what's left

**Done (this branch):**
- `/privacy.html` static page, linked from the app UI and the README.
- This document.

**Left for the developer (cannot be done from the repo):**
- Everything in the checklist above — submitting the Google Cloud Console
  form requires the developer's own Google account/session.
- Recording the demo video (needs the developer's screen + their own Google
  sign-in).
- Waiting out Google's review turnaround (commonly a few days to a few weeks
  for standard/sensitive-scope verification).
