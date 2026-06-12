# StreamShōgun Roku Pro Integration

This sideload build integrates StreamShōgun account entitlements without adding
external checkout links inside the Roku channel.

## Implemented

- Settings → StreamShōgun Account signs in with the existing API.
- Account sign-in can jump directly to Roku Pay when a stored purchase needs validation.
- AccountSessionTask calls `/v1/auth/login`, `/v1/auth/refresh`, and `/v1/features`.
- MainScene quietly refreshes saved account entitlements on startup when stale.
- Closing Roku Pay forces an account entitlement refresh when a saved session exists.
- Roku Pay can jump directly to Account when validation needs a StreamShōgun sign-in.
- Account → Roku Pay uses one-shot auto-validation when a signed-in account has stored Roku Pay purchase metadata.
- Roku Registry stores local access/refresh tokens, plan, status, billing interval, and feature flags.
- Free Roku sessions are limited to one playlist.
- Active Pro entitlement unlocks unlimited playlists.
- Active Pro entitlement enables the authenticated EPG proxy for raw `.xml.gz` guide sources.
- Playlist and raw `.xml.gz` EPG Pro gates expose an in-flow Upgrade action that opens Roku Pay.
- Settings → Pro Features opens Roku Pay when locked and Account when already active.
- Settings → Roku Pay loads ChannelStore catalog data.
- Roku Pay purchase flow sends `getUserData` RFI before `doOrder`.
- Restore flow sends `getAllPurchases` and stores matching Pro purchase metadata.
- Stored Roku Pay purchases can be retried with Validate after the user signs in.
- ValidateRokuPayTask sends purchase IDs to `/v1/roku/validate-purchase` when a StreamShōgun account session is available.
- The API calls Roku Pay `validate-transaction` when `ROKU_PAY_API_KEY` and product IDs are configured.
- Monthly → yearly and yearly → monthly plan switches pass Roku's `Upgrade` / `Downgrade` order action to ChannelStore.
- `/v1/roku/pay-push` accepts Roku Pay push notifications, records idempotent audit rows, and updates the matched subscription entitlement.

## Store Release Boundary

Roku's current requirements say transactional apps and subscription services
must use Roku Pay for on-device purchase, upgrade, downgrade, authentication,
and entitlement flows. The channel must not send customers to external purchase
or activation pages for those flows.

Before submitting a paid Roku store build, verify:

- Developer Dashboard products match `roku_product_pro_monthly` and `roku_product_pro_yearly`.
- The Roku Pay web services endpoint is set to `/v1/roku/pay-push`.
- Production `ROKU_PAY_API_KEY` and product ID environment variables are configured.
- Physical-device upgrade, downgrade, cancellation, grace, hold, and restore events reconcile against `/v1/features`.

The Roku app stores Roku Pay purchases as `pending_backend_validation` until
the backend validates the purchase. Do not grant Pro from the local record
alone.

Primary Roku docs:

- https://developer.roku.com/docs/developer-program/roku-pay/roku-pay-requirements.md
- https://developer.roku.com/dev/docs/implementation
- https://developer.roku.com/dev/docs/channelstore
- https://developer.roku.com/dev/docs/push-notifications
- https://developer.roku.com/dev/docs/on-device-upgrade-downgrade
