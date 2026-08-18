# Swiggy Dineout go-live runbook

Last reviewed: 2026-08-18

## Release invariant

Keep `SWIGGY_DINEOUT_ENABLED=false`,
`SWIGGY_DINEOUT_REMINDERS_ENABLED=false`, and
`NEXT_PUBLIC_SWIGGY_DINEOUT_ENABLED=false` until the corresponding server,
worker, and client commits are deployed and the exact callback URI for that
environment is confirmed on Swiggy's allowlist. Production stays dark through
the complete development soak.

## Environment contract

| Environment | OAuth callback (exact match) | Frontend return |
| --- | --- | --- |
| Development | `https://dev-orderapi.hoizr.com/auth/swiggy/callback` | `https://dev.hoizr.com/dineout` |
| Production | `https://orderapi.hoizr.com/auth/swiggy/callback` | `https://hoizr.com/dineout` |

For each backend, provision a unique 32-byte hex
`SWIGGY_TOKEN_ENCRYPTION_KEY`, `SWIGGY_CLIENT_ID=swiggy-mcp`, and
`SWIGGY_MCP_BASE=https://mcp.swiggy.com`. Never copy the encryption key between
development and production. The frontend flag is a build-time Vercel variable,
so changing it requires a fresh deployment.

## Merge and deploy order

1. Confirm `@hoizr-technology/shared` 0.1.121 is available to both consumers.
2. Merge and deploy customer-server to `dev`; leave the feature off and check
   health, GraphQL schema, and OAuth route behavior while disabled.
3. Merge and deploy hoizr-workers to `dev`; leave reminders off and confirm the
   cron process boots without sending jobs.
4. Merge and deploy hoizr-client to `dev`; first keep the public flag off, then
   rebuild with it on only after the backend is healthy.
5. Enable the development backend and run the acceptance checklist below.
6. Promote server and worker changes to production before the client change.
   Provision production variables dark, deploy, and verify health.
7. Promote the client. Enable production only after the development soak,
   callback confirmation, and release-owner approval.

## Development acceptance checklist

- Sign in to Hoizr and connect from the Profile Swiggy card.
- Verify PKCE/state succeeds and redirects to `/dineout?swiggy=connected`.
- Reload Profile and Dineout; status remains connected and no token appears in
  browser storage, GraphQL, logs, or URLs.
- Search by restaurant, cuisine, locality, and category; open details and load
  current free slots.
- Make one free test reservation. Verify one remote order, one local
  `dineoutbookings` record, confirmation UI, and My Reservations status.
- Exercise a double click and a simulated ambiguous/duplicate response; verify
  no second `book_table` call and no invented order ID.
- Exercise 401, 419, plain-string tool errors, and 429 with `Retry-After`;
  verify reconnect/error states and no rate-limit retry loop.
- Disconnect from Profile. Verify `/auth/logout` happens before conditional
  local token deletion, then reconnect successfully.
- Confirm every Swiggy-originated web surface uses the supplied logo unchanged.
- Keep reminder email/WhatsApp disabled until templates and recipients are
  separately approved, then test with one internal reservation.

## Soak, ramp, and rollback

Run the development flow with a small internal cohort for at least 48 hours.
Track tool name, anonymous session ID, outcome, latency, 401/419, 429,
`Retry-After`, duplicate/ambiguous bookings, and deprecation metadata. Do not
log tokens, arguments, response bodies, saved addresses, phone numbers, or
customer identifiers.

For production, begin with a restricted release audience where the deployment
platform supports it, then increase exposure through 1%, 10%, 50%, and 100%
checkpoints, holding each checkpoint for at least 24 hours. Stop the ramp on an
auth regression, elevated 429/5xx rate, duplicate reservation, or stale menu /
availability behavior.

Rollback is configuration-first: set the frontend and server feature flags to
false and redeploy the frontend. The server-side disconnect safety path remains
available while disabled so customers' remote sessions can still be revoked.
Do not rotate the token-encryption key during rollback; doing so would prevent
safe remote logout of existing connections.
