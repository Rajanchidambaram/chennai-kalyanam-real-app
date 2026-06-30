# ChennaiKalyanam Launch Roadmap

This roadmap separates what is already working in the prototype from what must be production-ready before public launch.

## Current Phase: Local Prototype

The app currently proves the core matrimony workflow:

- Browse approved public profiles
- Auto bride/groom matching after loading a member profile
- Compact profile rows with photo, age, job, company, salary, lifestyle badges, and actions
- Profile ID copy and Profile ID search
- Save, hide, compare, report, and send message
- Sent and received message views
- OTP demo flow
- Admin approval flow
- Demo payment/contact unlock flow
- Local JSON data store

## Prototype-Only Pieces

These are useful for demo, but must be replaced before launch:

- `data/db.json` file database
- Demo OTP code `123456`
- Demo admin PIN
- Demo payment success
- Photo URL field instead of real upload
- Local browser storage for session tokens
- Minimal admin authentication
- No real email/SMS notifications
- No production monitoring or backups

## Production Build Order

### 1. Database and Backend

- Replace JSON storage with PostgreSQL, Supabase, Firebase, or another managed database.
- Add migrations for users, profiles, interests, shortlists, blocks, reports, payments, and admin sessions.
- Add server-side validation for every API.
- Add audit fields: `createdAt`, `updatedAt`, `createdBy`, and admin reviewer details.
- Add backup and restore plan.

### 2. Authentication and OTP

- Replace demo OTP with a real provider such as MSG91, Twilio, Firebase Auth, or AWS SNS.
- Add OTP expiry and retry limits.
- Add rate limiting by mobile number and IP.
- Add secure user sessions.
- Separate member and admin roles clearly.

### 3. Profile Photos

- Replace photo URL with secure upload.
- Validate file type and size.
- Store photos in S3, Cloudinary, Firebase Storage, or Supabase Storage.
- Generate safe filenames.
- Add admin photo approval before public display.
- Add moderation path for rejected/correction-needed photos.

### 4. Payments and Contact Unlock

- Replace demo payment with Razorpay orders.
- Verify payment through webhook signature.
- Store invoices/payment records.
- Define refund and cancellation policy.
- Lock/unlock contact data strictly from subscription state.

### 5. Safety and Trust

- Strengthen report and block flows.
- Add duplicate-profile detection checks.
- Add admin review queue filters.
- Add contact abuse monitoring.
- Add privacy-first display rules for mobile/contact data.
- Add Terms, Privacy Policy, Refund Policy, and Community Guidelines.

### 6. Web Launch

- Choose domain.
- Deploy backend and frontend.
- Add HTTPS.
- Configure production environment variables.
- Add logging and error monitoring.
- Run full smoke/regression test before launch.

### 7. Android and iOS

- Decide packaging approach: responsive web/PWA first, then native wrapper or React Native/Flutter later.
- Prepare app icons, splash screens, store screenshots, and privacy labels.
- Test profile creation, browsing, payment, and message flows on real devices.
- Submit to Play Store first, then App Store.

## Suggested MVP Launch Scope

For the first public Chennai-only launch, keep scope tight:

- Verified mobile login
- Profile creation and admin approval
- Photo upload and moderation
- Browse, filter, sort, compare, save, hide, report
- Send and receive message requests
- Paid contact unlock
- Admin dashboard for approvals and reports

Avoid adding chat, horoscope matching automation, video calls, or large community segmentation until the basic marketplace has real users.

## Immediate Next Engineering Tasks

1. Pick production database.
2. Design database schema.
3. Move API data access behind repository/helper functions.
4. Add real authentication/session handling.
5. Add secure photo upload.
6. Add Razorpay integration.
7. Add legal pages and policies.
8. Add deployment scripts/configuration.

