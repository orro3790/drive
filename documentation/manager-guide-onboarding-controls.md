# Manager Guide: Driver Onboarding Controls

Last updated: 2026-02-10

## Why this exists

Before this update, adding a new driver required changing environment variables and redeploying.

Now onboarding is managed directly inside Drive, so managers can:

- approve driver signups immediately,
- issue one-time invite codes when needed,
- revoke access quickly,
- see exactly what happened to each approval/invite.

In short: faster onboarding, less operational risk, and a clear audit trail.

---

## Where to find it

Go to **Settings > Onboarding**.

You will see two controls:

1. **Approve by email**
2. **Issue invite**

And a table showing onboarding entries and statuses.

---

## When to use each option

### Approve by email

Use this when you trust the recipient and just need to allow signup for that email.

- No code sharing required.
- Driver signs up with the approved email.

### Issue invite

Use this when you want tighter control.

- Generates a one-time code tied to one email.
- You can choose an expiry window.
- Code is consumed on successful signup and cannot be reused.

---

## Status meanings (plain language)

- **Pending**: Still valid and not used yet.
- **Reserved**: Temporarily held during an in-progress signup attempt.
- **Consumed**: Successfully used in signup.
- **Revoked**: Manually cancelled by a manager.
- **Expired**: Invite reached expiry time before being used.

---

## Typical workflow

1. Receive onboarding request from a driver.
2. Add an **approval** or create an **invite**.
3. Share invite code privately (if invite flow is used).
4. Driver signs up.
5. Check status in Onboarding list:
   - should move from **Pending** to **Reserved** while signup is processing,
   - then to **Consumed** after success,
   - or back to **Pending** if signup fails before account creation.

If the wrong person was approved, use **Revoke** immediately.

---

## Why this is safer

- No shared static production code.
- One-time invite consumption blocks replay.
- Expiry and revoke reduce accidental long-lived access.
- Every entry keeps timestamps and actor fields for accountability.

This protects against both abuse and operational mistakes.

---

## Common questions

### "Can an invite be used twice?"

No. Successful signup consumes it exactly once.

### "Can I undo a consumed entry?"

A consumed entry is historical audit data and should stay consumed.
If needed, use normal user management actions for the account itself.

### "What if I approved the wrong email?"

Revoke it while status is **Pending** or **Reserved**.

### "Do I still need deploys for onboarding list changes?"

No. These controls are now in-app and take effect immediately.
