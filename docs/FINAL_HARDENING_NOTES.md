# Final Mobile Hardening Notes

## Frozen source risk (NOT fixed in WellnessApp_Store)

`new Date("YYYY-MM-DD")` + legacy `getLocalDateStr` can shift a calendar day on UTC− devices (EST/PST → 2026-08-27).

This is fixed **only** in `MAIMAI_ANDROID/www` (Asia/Tokyo + parseDateOnly noon + diet calendar parse).

V1.1 recommendation: port the same calendar-date hardening into frozen web if web users outside JST are expected.

## AdMob

PRODUCTION IDs configured (owner-provided):
- App: ca-app-pub-6588196119148846~8757683722
- Banner: ca-app-pub-6588196119148846/3181038938

Google TEST IDs removed from wrapper runtime config.
Ad serving still depends on AdMob account/app review + device/network.

