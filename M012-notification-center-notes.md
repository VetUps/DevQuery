# M012 — Product notification center and unread workflow

## Context

After M004, M008 and M009, the product already has the foundation for meaningful notifications:

- reputation levels and protected newcomer questions;
- manual expert invitations for protected questions;
- recipient-scoped in-app notifications;
- read/unread notification state;
- profile tab `Уведомления`;
- invited-question highlighting for experts on the home page.

The remaining product gap is visibility. If an expert must manually open the profile page to notice an invitation, the newcomer-help loop is too easy to miss.

This milestone should turn notifications from a profile-only support surface into a first-class product workflow visible from the app shell.

## Recommended milestone direction

**M012: Product notification center and unread workflow**

Goal: expand the existing in-app notification system so users can immediately notice, inspect, and manage their own notifications from the header and profile, while preserving the current privacy and permission boundaries.

## Why this milestone

This is a strong follow-up to the expert assistance work because it strengthens an already implemented loop instead of introducing a new domain.

The current loop is:

> Newcomer asks a protected question → newcomer invites expert → expert receives notification in profile.

The desired product loop is:

> Newcomer asks a protected question → newcomer invites expert → expert sees an unread signal immediately → opens the notification → goes to the question → answers only if policy still allows it.

This improves the usefulness of protected-question invitations without adding achievements, badges, realtime delivery, email, push, or AI matching.

## User-visible outcome

After this milestone:

- users see a notification entry point in the header;
- unread notifications are visible through a badge/count;
- users can quickly preview recent notifications without opening the profile first;
- users can open the full notification list in profile;
- users can filter all/unread notifications;
- users can mark one or all notifications as read;
- expert invitation notifications clearly show whether the invitation is active, expired, or whether the protected window already ended;
- notification UI failures do not break the header, home page, question page, or profile;
- users never see other users’ notifications.

## Recommended scope

### In scope

- backend current-user notification summary/unread-count contract;
- bounded latest-notifications response for header preview;
- header notification button/bell with unread badge;
- compact notification dropdown/panel with recent notifications;
- link from header preview to full profile `Уведомления` tab;
- profile notification filters: all/unread;
- mark-one-read and mark-all-read behavior;
- pagination or bounded load-more for the full notification list;
- honest expired/protected-window-ended invitation states;
- graceful loading, empty, and error states;
- backend recipient-scoping and privacy tests;
- frontend parser/UI tests;
- integrated browser smoke for the invitation notification loop.

### Explicitly out of scope

- achievements, badges, leaderboards, or gamification;
- realtime WebSocket/SSE delivery;
- email, push, or external notification delivery;
- admin notification management;
- notification preferences;
- automatic invite-all experts;
- AI/recommendation-based expert matching;
- changing `QuestionProtectionService` protected-window or answer-permission rules;
- treating notifications as permission tokens.

## Key invariants

### 1. Notifications are recipient-scoped

A user can only see their own notifications. Frontend filtering must never be the security boundary.

### 2. Notifications are not permissions

An expert invitation notification never grants answer permission by itself. Answer creation must remain governed by `QuestionProtectionService`.

### 3. Header notification UI must be failure-safe

If notification summary loading fails, the app shell should remain usable. The UI may show a small degraded state, but it must not break navigation or page rendering.

### 4. Expired states must be honest

If an invitation expired or the protected window ended, notification copy must not promise active expert-only help. The user may still navigate to the question, but the state must be clear.

### 5. Keep delivery site-only

The milestone should improve in-app visibility only. Realtime, email, and push delivery remain future work.

## Recommended slices

### S01 — Notification summary and unread-count backend contract

After this slice:

- authenticated users can request their unread count and latest notification summary;
- responses are bounded and recipient-scoped;
- anonymous users are denied;
- users cannot access other users’ notification data;
- invitation notification state includes enough metadata for active/expired/protected-ended display.

Expected proof:

- backend tests for unread count, latest notifications, recipient privacy, anonymous denial, and expired/protected-ended derived state.

### S02 — Header notification entry point

After this slice:

- authenticated users see a notification entry point in the header;
- unread badge reflects backend unread state;
- clicking the entry point opens a compact recent-notifications preview;
- guests do not see authenticated notification controls;
- notification loading/error states do not break header navigation.

Expected proof:

- frontend tests for guest/authenticated header states, unread badge, dropdown rendering, empty/loading/error behavior, and profile-link navigation target.

### S03 — Full profile notification workflow

After this slice:

- profile `Уведомления` supports all/unread filtering;
- users can mark individual notifications read;
- users can mark all notifications read;
- notification list supports pagination or bounded load-more;
- empty and error states are clear and product-safe.

Expected proof:

- backend tests for mark-all-read if implemented server-side;
- frontend tests for filters, mark-read, mark-all-read, pagination/load-more, empty and error states.

### S04 — Expert invitation notification integration hardening

After this slice:

- expert invitation notifications render correctly in header preview and profile list;
- invitation cards show active, expired, and protected-window-ended states honestly;
- mark-read updates header badge/profile state consistently;
- home invited-question highlight still works;
- notification presence still never grants answer permission.

Expected proof:

- backend regression tests around `QuestionProtectionService` permission boundary;
- frontend tests for invitation notification cards, stale states, and home highlight compatibility.

### S05 — Integrated proof and browser smoke

After this slice:

- the assembled notification center is proven end-to-end;
- a newcomer can invite an expert;
- the expert sees an unread header signal;
- the expert opens the notification preview/list;
- marking read updates the badge;
- the expert can navigate to the question;
- ordinary/anonymous users cannot access notification data they should not see.

Expected proof:

- targeted backend notification/invitation tests;
- targeted frontend notification/header/profile tests;
- frontend typecheck and build;
- browser smoke covering the happy path and privacy/permission negative paths.

## Suggested success criteria

- Authenticated users see an unread notification indicator in the header when they have unread notifications.
- Users can preview recent notifications from the header without opening the profile first.
- Users can manage notifications in the profile through all/unread filters and read actions.
- Expert invitation notifications clearly represent active, expired, and protected-window-ended states.
- Notification state never grants answer permission; `QuestionProtectionService` remains authoritative.
- Notification APIs remain recipient-scoped and deny anonymous or cross-user access.
- Header/profile notification failures degrade safely without breaking core navigation or Q&A flows.
- Automated backend/frontend tests, typecheck/build, and browser smoke prove the assembled workflow.

## Short reminder for next session

When resuming, refer to this file as:

> We planned M012 around a **product notification center and unread workflow**, not achievements. The milestone should expand existing recipient-scoped in-app notifications with header unread visibility, compact preview, profile management, mark-read/mark-all-read, honest expired invitation states, and integrated proof that notifications remain private and never grant answer permissions.
