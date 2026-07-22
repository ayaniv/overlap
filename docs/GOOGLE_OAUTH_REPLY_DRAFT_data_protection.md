# Draft reply to Google's data-protection verification feedback

Send this from the Cloud Console project's support-email inbox, as a direct
reply to Google's verification feedback email (quoted in `TASK.md` for this
task), **after** confirming the updated privacy policy at
https://overlapclock.com/privacy.html is live (i.e. this branch is merged and
deployed) — do not send with a stale/unmerged link.

---

To: (reply directly to Google's verification email thread)
Subject: Re: Verification for project 22665043140 (overlap-clock)

Hello,

Thank you for the feedback. We've updated our privacy policy to add an
explicit data-protection disclosure for the sensitive `calendar.events`
scope:

https://overlapclock.com/privacy.html

The new "Data Protection" section (under "Google Calendar access") states
that `calendar.events` is treated as sensitive data, and explains how it's
protected given overlap's architecture — the app is entirely client-side
with no backend, so:

- All traffic to Google (Google Identity Services for sign-in, the Calendar
  API for creating/deleting events) is over HTTPS/TLS, encrypting the access
  token and calendar data in transit.
- The access token is held only in an in-memory JavaScript variable in the
  browser tab, is never written to `localStorage`, cookies, or disk, and is
  discarded once each request completes — the developer never receives,
  sees, or stores it.
- Each calendar action requests a fresh, short-lived token from Google
  rather than reusing a stored one.
- There is no developer-controlled server in the request path at any point,
  so there is no server-side storage of the token or any calendar data.

Please let us know if any further detail is needed.

Best regards,
Yaniv Aharon
overlap (https://overlapclock.com)
