# ChennaiKalyanam Real App Prototype

This is the first runnable Phase 1 app with a real local backend API.

It is dependency-free and uses only Node.js built-in modules, so it can run without installing packages.

## Run

```bash
npm start
```

Open:

```text
http://localhost:4174
```

## Demo OTP

Use:

```text
123456
```

## Demo Admin PIN

Use:

```text
246810
```

Admin dashboard APIs require login. The browser stores the demo admin token in local storage.

## Automated Smoke Test

Keep the app running, then run:

```bash
npm run test:smoke
```

The test resets demo data, then verifies:

- Browse only shows approved profiles
- Contact is locked before payment
- Profile creation is blocked before OTP
- Admin dashboard is blocked before admin login
- Demo admin login returns a session token
- OTP wrong code is rejected
- OTP `123456` is accepted
- New profile goes to admin review
- Admin approval publishes the profile
- Duplicate interest is blocked
- Report opens admin review
- Demo payment unlocks contact
- Account summary shows interest and contact access

## Included Flows

- Browse public approved profiles
- Filter by gender, age, area, and education
- Request and verify OTP
- Submit a new profile for admin approval
- Send interest
- Report suspicious profiles
- Simulate Razorpay-style successful payment
- View admin dashboard
- Approve, reject, or request correction for profiles

## Data

The app creates:

```text
data/db.json
```

from:

```text
data/seed.json
```

You can delete `data/db.json` to reset the app back to seed data.

## Production Upgrade Path

This app proves the flow. See `ROADMAP.md` for the full launch plan.

For production, replace:

- JSON file with PostgreSQL
- Demo OTP with MSG91, Firebase Auth, or Twilio
- Demo payment with Razorpay order + webhook verification
- No-login admin with protected admin authentication
- Local hosting with a cloud server

Copy `.env.example` to `.env` when moving toward production configuration.
