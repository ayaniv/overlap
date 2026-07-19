# Draft reply to Google's OAuth verification checklist email

Send this from the Cloud Console project's support-email inbox, as a reply to
Google's message, **after** the two remaining manual steps below are done
(the demo video link is a placeholder until then — do not send with it
missing). See `GOOGLE_VERIFICATION.md` for the full manual checklist and
video script.

---

To: The Third Party Data Safety Team
Subject: Re: OAuth verification checklist — overlap-clock (Project 22665043140)

Hello,

Thank you for the checklist. We've audited overlap-clock (Project Number
22665043140) against every section below.

**Scope Configuration & Justification**
overlap requests a single OAuth scope: `.../auth/calendar.events`. It is used
for exactly one production, user-facing feature: creating a calendar event
when the user taps "Schedule" on a proposed meeting time, and deleting that
same event if the user removes the meeting from the app. No broader Calendar
scope (e.g. `.../auth/calendar`) is requested, and no other Google scope is
requested. Full justification text is on file in the consent-screen
configuration.

**Demo Video**
Unlisted YouTube video: [LINK — paste after recording]
The video shows: the app's core clock/scheduling UI working without any
Google sign-in; the OAuth consent screen with the `calendar.events` scope
fully expanded; granting consent and the app's confirmation; the created
event appearing on the user's real Google Calendar; and — since this scope
includes delete access — removing the meeting in the app and showing the
corresponding event disappear from Google Calendar. The scopes shown in the
consent screen match the single scope configured in Cloud Console and
requested by the app.

**App Access & Testing Environment**
overlap has no login, account system, phone verification, or payment wall of
its own — the only authentication involved is the Google OAuth prompt itself.
The scheduling feature is reachable directly from the app's main screen with
no separate credentials needed.

**Privacy Policy Disclosures**
Our privacy policy (https://overlapclock.com/privacy.html) states, as
separately labeled sections: what Google user data is accessed (only the
event the app itself creates — no reading or listing of existing calendar
events), how it's used (create/delete that one event, nothing else), what's
transferred to third parties (nothing beyond the direct, user-initiated call
to Google's own API — no other party ever receives this data), how it's
protected (the entire flow is client-side; there is no backend and the
developer never receives, stores, or has access to the OAuth token or any
calendar data), and retention/deletion (nothing is retained outside the
user's own browser and their own Google Calendar; both are user-controlled).

**Data Handling: Limited Use Restrictions**
Calendar data is used only to provide the scheduling feature the user
directly invokes — never for advertising, analytics, lending, or any purpose
beyond that feature. It is never sold or shared with any third party.

**AI/ML Model Training Restrictions**
Not applicable: overlap performs no AI/ML processing of any kind on Calendar
data (or any user data) — the app only relays the user's own create/delete
requests directly to the Calendar API.

**Prohibited Use Cases**
Not applicable: this section covers apps using Drive, Gmail, Chat, Data
Portability, Meet, Health, Photos, or YouTube APIs. overlap uses only the
Calendar API, which isn't in that list.

**Data Portability APIs**
Not applicable: overlap does not use the Data Portability API or any
data-export/transfer-to-another-service flow. It only creates/deletes a
single calendar event via the standard Calendar API.

**Cloud Application Security Assessment (CASA)**
Not applicable: `calendar.events` is a Sensitive-tier scope, not a Restricted
one, and CASA is required only for Restricted scopes per this checklist.
overlap requests no Restricted scope.

Please let us know if any section needs further detail or evidence.

Best regards,
Yaniv Aharon
overlap (https://overlapclock.com)
