# Production Database Schema Plan

Recommended first production database: PostgreSQL, either directly hosted or through Supabase. It gives relational integrity for profiles, payments, reports, and message requests while still being easy to query for admin workflows.

## Core Tables

### users

Stores login identity and role.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| mobile | varchar(20) | Unique, normalized Indian mobile number |
| email | varchar(255) | Optional |
| role | varchar(20) | `member`, `admin`, `moderator` |
| status | varchar(30) | `active`, `blocked`, `deleted` |
| mobile_verified_at | timestamp | Null until OTP success |
| created_at | timestamp | Required |
| updated_at | timestamp | Required |

Indexes:

- Unique index on `mobile`
- Index on `role`
- Index on `status`

### profiles

Stores the matrimony profile owned by a user.

| Column | Type | Notes |
| --- | --- | --- |
| id | varchar(20) | Public ID like `CK1028` |
| user_id | uuid | Foreign key to `users.id` |
| profile_for | varchar(30) | Self, Son, Daughter, Sibling |
| name | varchar(120) | Public display name |
| gender | varchar(20) | Bride, Groom |
| age | integer | Required |
| location | varchar(120) | Chennai area |
| education | varchar(120) | Example: Engineering, MBA |
| job | varchar(160) | Profession |
| company_name | varchar(160) | Optional |
| income | varchar(120) | Free-text income |
| salary_range | varchar(60) | Searchable range |
| height | varchar(50) | Optional |
| fitness | varchar(80) | Optional |
| diet | varchar(80) | Optional |
| smoking | varchar(40) | No, Occasionally, Not specified |
| drinking | varchar(40) | No, Occasionally, Not specified |
| family | text | Family details |
| about | text | Profile intro |
| preference | text | Partner preference |
| horoscope | varchar(80) | Available, Optional, etc. |
| verification_status | varchar(40) | pending, approved, rejected, correction_requested |
| visibility_status | varchar(40) | hidden, public |
| photo_status | varchar(40) | pending, approved, rejected |
| created_at | timestamp | Required |
| updated_at | timestamp | Required |

Indexes:

- Primary key on `id`
- Index on `user_id`
- Composite index on `gender`, `visibility_status`, `verification_status`
- Indexes on `location`, `education`, `salary_range`, `fitness`, `age`

### profile_photos

Stores uploaded profile photo metadata.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| profile_id | varchar(20) | Foreign key to `profiles.id` |
| storage_key | varchar(500) | S3/Cloudinary/Supabase key |
| public_url | varchar(1000) | CDN URL when approved |
| status | varchar(40) | pending, approved, rejected |
| uploaded_at | timestamp | Required |
| reviewed_by | uuid | Admin user id |
| reviewed_at | timestamp | Nullable |

### message_requests

Production replacement for current `interests`.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| from_user_id | uuid | Sender user |
| from_mobile | varchar(20) | Keep for audit/demo migration |
| to_profile_id | varchar(20) | Receiver profile |
| message | varchar(240) | Short family message |
| status | varchar(40) | sent, accepted, declined, closed |
| created_at | timestamp | Required |
| updated_at | timestamp | Required |

Rules:

- Unique active request from one user/mobile to one target profile.
- Message should be server-side trimmed and length-limited.

### shortlists

Saved profiles.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | Nullable during migration |
| mobile | varchar(20) | Current prototype key |
| profile_id | varchar(20) | Saved profile |
| created_at | timestamp | Required |

Unique constraint:

- `(mobile, profile_id)` or `(user_id, profile_id)` after auth migration.

### profile_blocks

Hidden/blocked profiles per user.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | Nullable during migration |
| mobile | varchar(20) | Current prototype key |
| profile_id | varchar(20) | Hidden profile |
| created_at | timestamp | Required |

Unique constraint:

- `(mobile, profile_id)` or `(user_id, profile_id)`.

### reports

User reports for admin review.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| profile_id | varchar(20) | Reported profile |
| reporter_user_id | uuid | Nullable |
| reporter_mobile | varchar(20) | Optional |
| reason | varchar(240) | Required |
| details | text | Optional |
| status | varchar(40) | open, reviewing, resolved, dismissed |
| created_at | timestamp | Required |
| resolved_by | uuid | Admin user id |
| resolved_at | timestamp | Nullable |

### subscriptions

Controls contact unlock.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | Subscriber |
| mobile | varchar(20) | Migration support |
| plan | varchar(40) | monthly, family |
| status | varchar(40) | active, expired, cancelled |
| starts_at | timestamp | Required |
| ends_at | timestamp | Required |
| created_at | timestamp | Required |

### payments

Stores payment gateway records.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | Payer |
| mobile | varchar(20) | Migration support |
| provider | varchar(40) | razorpay |
| provider_order_id | varchar(120) | Razorpay order id |
| provider_payment_id | varchar(120) | Razorpay payment id |
| amount_rupees | integer | Required |
| status | varchar(40) | created, paid, failed, refunded |
| raw_payload | jsonb | Gateway response/webhook |
| created_at | timestamp | Required |

### admin_sessions

Temporary until full admin auth is built.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| admin_user_id | uuid | Admin user |
| token_hash | varchar(255) | Store hash, not raw token |
| expires_at | timestamp | Required |
| created_at | timestamp | Required |

## Migration Strategy From JSON

1. Create tables with migrations.
2. Write import script from `data/seed.json` and `data/db.json`.
3. Import users first.
4. Import profiles and preserve current public IDs.
5. Import interests into `message_requests`.
6. Import shortlists into `shortlists`.
7. Import blocks into `profile_blocks`.
8. Import reports, subscriptions, payments.
9. Switch server data access from JSON helper functions to database repository functions.
10. Keep `seed.json` only for local demo fixtures.

## Repository Layer Plan

Create a data access layer before directly integrating a database:

- `repositories/usersRepository`
- `repositories/profilesRepository`
- `repositories/messagesRepository`
- `repositories/shortlistsRepository`
- `repositories/blocksRepository`
- `repositories/paymentsRepository`
- `repositories/reportsRepository`

That lets the app move from JSON to PostgreSQL without rewriting every API route at once.

## First Production Milestone

The first production migration should support:

- Mobile OTP user lookup
- Profile create/edit/admin approval
- Browse with filters and sort
- Save/hide/report profiles
- Send and receive message requests

Payments and photo upload can be added after this database foundation is stable.

