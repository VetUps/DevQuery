# M004 — Reputation system and expert access policy

## Context

Following M001–M003, the next proposed milestone is not achievements yet, but a first real reputation-driven product layer.

The idea from `Постановка задачи.docx` is broader than showing a numeric score:
- users gain points for meaningful contributions;
- expert status should unlock product capabilities;
- newcomer questions should be protected from low-quality/toxic interactions;
- admins should control thresholds and be able to manually adjust user reputation level;
- this system should later coexist with a separate achievements milestone.

## Recommended milestone direction

**M004: Reputation system and expert access policy**

Goal: introduce the first working version of the reputation system that:
- tracks reputation points;
- derives user levels/statuses from configurable thresholds;
- gives experts product-level permissions;
- protects newcomers;
- is visible and explainable in the UI;
- is manageable from admin surfaces.

## Why this milestone

This is stronger than simply displaying reputation because it gives reputation real product meaning:
1. it affects permissions and capabilities;
2. it supports expert discovery and trust;
3. it protects novice users;
4. it provides a foundation for later achievements/badges without mixing both systems too early.

## Scope proposal

### In scope
- numeric reputation score;
- configurable reputation thresholds for user levels/statuses;
- reputation event/transaction ledger;
- visible reputation + level on profile and compact author surfaces;
- rule: newcomer questions have protected interaction rules;
- rule: expert-only answering threshold for protected newcomer questions;
- rule: downvoting newcomer questions can be restricted;
- admin-safe controls for thresholds and manual level/reputation overrides;
- automated proof for backend rules + frontend UX.

### Explicitly out of scope for M004
- achievements/badges;
- invite-expert locking flow;
- recommendation system;
- AI moderation;
- AI answer summary;
- knowledge graph UI;
- analytics dashboard.

## Recommended UX/product improvements over the raw idea

### 1. Reputation should be explainable
Do not show only a number. Add:
- current score;
- current level;
- how many points remain until the next level;
- a simple reputation history / ledger view.

Reason: if permissions depend on reputation, users must understand why they can or cannot do something.

### 2. Use a protected window for newcomer questions instead of a permanent hard lock
Instead of making newcomer questions answerable only by experts forever, consider:
- first 12–24 hours: expert-only answers;
- after that: open to everyone.

Reason: this keeps the anti-toxicity protection while reducing the risk that a newcomer question gets stuck without answers.

If strict permanent gating is still preferred, the UI must explain it clearly.

### 3. Manual admin override should be explicit
Recommended model shape:
- `reputation_score`
- `manual_level_override` (nullable)

Reason: this preserves a clean score-based system while still allowing operational/manual intervention without corrupting the meaning of the score.

## Recommended backend/domain shape

### Reputation model
Prefer:
- numeric `reputation_score`;
- level computed from thresholds;
- optional explicit manual override when needed.

### Reputation event sources for the first milestone
Keep the first ruleset small and understandable. Candidate first events:
- selected best solution;
- upvote on solution;
- upvote on question;
- optionally approved edit.

Avoid a large complicated scoring matrix in the first milestone.

### Reputation ledger
Store every change as a transaction/event, for example:
- reason/type;
- delta;
- source object reference;
- timestamp;
- actor/system source.

Reason: helps explainability, debugging, moderation, and future analytics.

## Recommended slices

### S01 — Reputation domain model and transaction ledger
- score model;
- threshold config;
- level resolution;
- reputation transaction history;
- backend tests.

### S02 — Public reputation/profile surfaces
- profile reputation block;
- level badge;
- compact author credibility UI;
- “how reputation works” UX.

### S03 — Expert access rules for newcomer questions
- newcomer detection;
- expert-threshold answer restriction;
- downvote restriction for newcomer questions;
- explicit failure messaging;
- backend + frontend proof.

### S04 — Admin reputation controls
- threshold settings;
- manual override;
- admin-safe controls;
- auditable behavior.

### S05 — Integrated proof and UX hardening
- end-to-end verification of reputation rules;
- ledger visibility;
- empty/loading/error states;
- build/typecheck/tests.

## Key UX principles

- Restrictions must always be explained.
- Reputation must feel useful, not decorative.
- Users should understand how to progress.
- Manual admin intervention must remain operationally safe and transparent.
- Achievements should remain a later, separate milestone built on top of this foundation.

## Short reminder for next session

When resuming, refer to this file as:

> We planned M004 around a **reputation system and expert access policy**, not achievements yet. The milestone should include score, levels, thresholds, newcomer protection rules, expert-only capabilities, admin overrides, and a reputation ledger, with achievements deferred to a separate future milestone.
