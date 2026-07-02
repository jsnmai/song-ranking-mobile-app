# Profile Identity And Taste Data Map

This document is the launch baseline for LISTn profile identity, Auxstrology, and future
profile-photo work. It exists so product, privacy, App Store metadata, and engineering behavior stay
aligned as profile surfaces become richer.

## Launch Decision

Keep Auxstrology for launch. Treat it as a playful, derived music-taste signature generated from
LISTn-owned activity, not as personality, health, psychological, or predictive analysis.

Keep editable profile identity: display name, username, avatar color, and best-effort timezone. Add
custom profile photos only through a storage-backed, server-validated upload flow. Do not ship a
local-filesystem avatar upload path in production because Railway containers are ephemeral and local
uploads make deletion, moderation, cache invalidation, and CDN behavior fragile.

Fable 5/design can continue profile layout and visual polish separately. The engineering baseline is
to provide consistent identity data and a reusable avatar contract.

## Data Inventory

| Data | Source | Purpose | Visibility | Deletion |
| --- | --- | --- | --- | --- |
| `display_name` | User-provided | Profile identity, search, feed/profile attribution | Basic profile identity | Delete with account |
| `username` | User-provided, normalized lowercase | Stable profile handle and routing | Basic profile identity | Delete with account |
| `avatar_color` | User-selected token | Non-photo avatar fallback | Basic profile identity | Delete with account |
| `timezone` | Device-derived IANA key, best-effort | Local-day streaks and Auxstrology timing axes | Private profile context; not displayed | Delete with account |
| `rating_events` | User rating actions | Feed, recent verdicts, Auxstrology, future recaps | Taste-bearing, visibility-gated | Delete with account |
| `comparisons` | User pairwise choices | Scoring receipts, Auxstrology, future intelligence | Current-user only today | Delete with account |
| `interaction_events` | Whitelisted app interactions | Future product analytics and taste-intelligence signals | Private analytics context | Delete with account |
| Auxstrology snapshots | Derived server-side | Fast profile rendering of taste signature | Taste-bearing, visibility-gated | Delete with account |
| Future profile photo object | User-provided image | Richer profile identity | Basic profile identity, reportable UGC | Delete object and DB reference |

## Current Profile Edit Baseline

- Usernames are lowercased, allow only letters/numbers/underscores, and reject reserved route or
  trusted names such as `me`, `search`, `support`, `admin`, and `listn`.
- Display names are trimmed and length-limited.
- Avatar color is a fixed design-token enum. Explicit `null` resets the user to the deterministic
  fallback color.
- Timezone is accepted only when it is a real IANA timezone key. It is captured silently and
  best-effort; failure must not interrupt auth or profile load.
- `PATCH /profile/me` is rate-limited because it can mutate public identity and test username
  availability.

## Auxstrology Acceptance Rules

- Auxstrology must be computed from LISTn-owned data only: ratings, comparisons, interaction events,
  and validated timezone.
- Other-user Auxstrology is taste-bearing and must use the same visibility/blocking checks as other
  profile taste modules.
- Locked/new-user states must render intentionally.
- Copy must stay in music-taste language. Avoid clinical, psychological, fate, health, or protected
  characteristic claims.
- Snapshots are an optimization/read model, not a permanent identity record. Account deletion removes
  them.

## Custom Profile Photo Security Contract

Custom photos should ship in a later storage-backed implementation slice with this contract:

- Use the platform photo picker so LISTn does not request broad library access unnecessarily.
- Require authentication and a dedicated upload rate limit.
- Store images in object storage (for example S3/R2/Supabase Storage), not the Railway app
  container filesystem.
- Generate object keys server-side. Never trust or expose user filenames.
- Allowlist input content types and verify file signatures server-side. Do not trust the
  client-supplied MIME type.
- Enforce strict max upload size, decoded dimensions, and output dimensions.
- Decode and re-encode server-side to strip EXIF/location metadata and normalize the format.
- Prefer one canonical square output plus optional thumbnail sizes.
- Track `avatar_image_key`, public/CDN URL or path, version, dimensions, content hash, and
  `avatar_image_updated_at`.
- Delete or garbage-collect replaced avatar objects and delete all avatar objects on account
  deletion.
- Treat profile photos as user-generated content: report/profile flows and block behavior must cover
  abusive images; moderation can remove an avatar without deleting the account.

Do not implement profile photos as raw base64 stored in the database, client-only validation, direct
public bucket writes, or local disk uploads.

## App Store And Privacy Notes

Profile identity and photos are user-provided content. Timezone and interaction events are collected
to power app functionality and product/taste intelligence, and they must be disclosed in privacy
policy/App Store privacy details as appropriate. Auxstrology is derived from user activity and should
be described as a music-taste feature.

Before App Store submission, make sure Privacy Policy, Terms, Community Guidelines, and Support
contact explain:

- what profile and activity data LISTn collects,
- why timezone and interaction events exist,
- how visibility and blocks affect taste surfaces,
- how users report profiles/content,
- how account deletion removes user-owned profile, activity, and derived data.
