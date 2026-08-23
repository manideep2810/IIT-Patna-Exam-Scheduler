# University Exam Clash Detection Timetable

## Project objective

Build a Node.js + Express + React application for creating university exam timetables. The system must prevent student exam clashes and ensure that each room's capacity is not exceeded.

PostgreSQL is the selected database because the domain is highly relational and scheduling checks must stay correct during concurrent requests.

## Roles

- **Super Admin**: manages exam periods, imports data, rooms, department-admin accounts and passwords, course permissions, and the full timetable.
- **Department Admin**: logs in, changes the initial password, and schedules only courses explicitly granted to them.

The initial Super Admin is created through a database seed/migration using environment variables. Passwords are never stored as plaintext. The Super Admin directly sets a department admin's initial password (for example `12345678`); only its hash is stored and `must_change_password` is set to `true`.

## Fixed timetable slots

Each active exam date has exactly two sessions, in the `Asia/Kolkata` timezone:

| Session | Time |
| --- | --- |
| Morning | 09:30–12:30 |
| Afternoon | 14:30–17:30 |

An `exam_period` owns its dates and `exam_slots`; the UI displays dates with these two sessions rather than hourly cells.

## Imports managed by the Super Admin

### 1. Department-admin course permissions

The spreadsheet has an email in its first column and one or more course codes in subsequent columns.

```text
cs@iitp.ac.in -> CS
ee@iitp.ac.in -> EE, EC
ma@iitp.ac.in -> MA, MC
```

The import is normalized into one `admin_course_prefix_permissions` row per email/prefix pair. A prefix such as `CS` grants access to course codes beginning with `CS`, such as `CS125`, `CS258`, and `CS654`. Prefixes are not course IDs and are not foreign keys to `courses`.

### 2. Rooms

Import room number, location/building, and `exam_capacity`. Location/building is required so the allocation board can group rooms clearly; room number is the unique room key.

### 3. Course enrollments

Import `sub_code`, `sub_name`, and the semicolon-separated `roll_no` list. The backend splits, trims, uppercases where appropriate, validates, and deduplicates roll numbers before saving one normalized enrollment row per student/course/exam period.

Imports are synchronous: the request validates the file, shows validation errors directly to the Super Admin, and writes data only when it is valid. No import-job or import-error history is stored.

## Core business rules

### Course access

A department admin can schedule a course only when its course code starts with one of that admin's stored course prefixes.

### Student clash detection

A student must not have two exams in the same `exam_slot`, even if the exams use different rooms.

When an exam is scheduled, the application snapshots its enrolled students into `exam_candidates`.

```text
UNIQUE (exam_slot_id, student_id)
```

This is a database-level protection. If the selected course has students already in another exam in that slot, scheduling is rejected and the API returns the conflicting roll numbers.

### Multi-room exams and shared rooms

An exam may be split across multiple rooms. A room may also host multiple different exams in the same slot.

There is deliberately **no** `UNIQUE (exam_slot_id, room_id)` constraint on `exam_room_allocations`.

Capacity checks are:

```text
For one exam:
SUM(all allocated room seats) >= number of enrolled candidates

For one room in one slot:
SUM(seats reserved by every exam in that room and slot) <= room.exam_capacity
```

`room_slot_usage` stores the aggregate reserved seats for a room and slot. It is an occupancy counter, not an exam allocation; its unique room/slot row permits many exam allocations to share that room and slot.

All schedule creation, update, move, and cancellation operations run as a single PostgreSQL transaction so these checks remain correct under concurrent admin requests.

## Planned database model

| Area | Tables | Responsibility |
| --- | --- | --- |
| Organisation/authentication | `departments`, `users` | Roles, Super-Admin-managed passwords, first-login change flow |
| Course access | `courses`, `admin_course_prefix_permissions` | Course catalogue and per-admin prefix ACL |
| Student data | `students`, `course_enrollments` | Normalized roll numbers and period-specific enrollments |
| Timetable | `exam_periods`, `exam_slots`, `exams` | Period, two sessions per day, course exam |
| Rooms | `rooms`, `exam_room_allocations`, `room_slot_usage` | Capacities, multi-room allocation, shared-room occupancy |
| Clash safety | `exam_candidates` | Scheduled student snapshot and unique slot/student protection |

Important relationships:

```text
users --< admin_course_prefix_permissions
exam_periods --< exam_slots --< exams >-- courses
exam_periods --< course_enrollments >-- students
exams --< exam_room_allocations >-- rooms
exams --< exam_candidates >-- students
exam_slots --< room_slot_usage >-- rooms
```

The full visual-schema source is maintained as DBML and can be pasted into dbdiagram.io's DBML editor when diagram work begins.

## Delivery phases

### Phase 1 — Foundation and schema

Phase 1 creates only the backend foundation and database. It does not include the React UI, import endpoints, authentication endpoints, scheduling logic, linting, tests, audit logs, password-reset tokens, or asynchronous import processing.

#### 1. Technology and project setup

- Use Node.js (current LTS), Express, PostgreSQL, and a PostgreSQL migration tool.
- Create a backend application structure with clear folders for configuration, routes, controllers, services, database migrations, and database seeds.
- Install only the Phase-1 dependencies required to run Express, connect to PostgreSQL, load environment variables, generate UUIDs, and hash the seeded Super Admin password.
- Add a minimal `GET /health` endpoint that reports that the API is running. It must not expose credentials or database internals.

#### 2. Environment configuration

- Add `.env.example`; do not commit a real `.env` file.
- Define these required configuration values:

  ```text
  PORT
  DATABASE_URL
  SUPER_ADMIN_EMAIL
  SUPER_ADMIN_PASSWORD
  ```

- Validate configuration during startup and fail with a clear local error if a required value is missing.
- Use the configured `DATABASE_URL` for all migrations, seed operations, and application database connections.

#### 3. Migration strategy

- Store schema changes as ordered, version-controlled SQL migrations.
- Apply migrations forward only; never rely on manual table creation in pgAdmin or a database GUI.
- Keep the schema source of truth in both migrations and `schema.dbml`; update both whenever a Phase-1 schema decision changes.
- Create the database objects in dependency order: enum types, independent tables, tables with foreign keys, indexes, and constraints.

#### 4. Database schema to implement

Create the tables already captured in `schema.dbml`:

```text
departments
users
courses
admin_course_prefix_permissions
students
exam_periods
course_enrollments
rooms
exam_slots
exams
exam_room_allocations
room_slot_usage
exam_candidates
```

Create these PostgreSQL enums:

```text
user_role: SUPER_ADMIN, DEPARTMENT_ADMIN
exam_status: DRAFT, SCHEDULED, CANCELLED
slot_session: MORNING, AFTERNOON
```

The database must include all foreign keys and unique indexes described in `schema.dbml`, especially:

```text
users.email
courses.course_code
students.roll_number
admin_course_prefix_permissions(user_id, course_prefix)
course_enrollments(exam_period_id, course_id, student_id)
exam_slots(exam_period_id, exam_date, session)
exams(exam_period_id, course_id)
exams(exam_slot_id, course_id)
exam_room_allocations(exam_id, room_id)
room_slot_usage(exam_slot_id, room_id)
exam_candidates(exam_id, student_id)
exam_candidates(exam_slot_id, student_id)
```

The `exam_candidates(exam_slot_id, student_id)` unique index is mandatory because it is the final database-level protection against a student clash.

#### 5. Data-integrity constraints

Add database check constraints for the simple invariants that do not require scheduling logic:

- `rooms.exam_capacity > 0`
- `exam_room_allocations.seats_reserved > 0`
- `room_slot_usage.reserved_seats >= 0`
- `exam_slots.end_at > exam_slots.start_at`
- `exam_periods.end_date >= exam_periods.start_date`

Use database defaults for `created_at` and `updated_at` timestamps where appropriate. Exact room aggregation checks and candidate snapshot insertion belong to Phase 4 because they require one scheduling transaction.

#### 6. Seed the first Super Admin

- Add a seed command that reads `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` from the environment.
- Hash the password with bcrypt or Argon2 before insertion.
- Insert one active user with role `SUPER_ADMIN` and `must_change_password = false`.
- Make the seed safe to re-run: it must not create duplicate Super Admin rows for the same email.
- Do not seed department admins, rooms, courses, enrollments, or timetable data in Phase 1.

#### 7. Manual completion checks

Without automated tests or linting, verify Phase 1 manually:

1. Start PostgreSQL and configure a local `.env` file.
2. Run all migrations successfully against an empty database.
3. Run the Super Admin seed twice and confirm that only one matching account exists and its password column contains a hash.
4. Inspect the database or paste `schema.dbml` into dbdiagram.io to verify tables, relationships, enums, indexes, and constraints.
5. Start Express and confirm `GET /health` returns a successful response.

#### Phase-1 deliverables

- Runnable Express backend skeleton.
- PostgreSQL connection configuration and `.env.example`.
- Ordered migrations for the complete core schema.
- Idempotent Super Admin seed command.
- Updated `schema.dbml` matching the migrations.
- A short setup/run section in this README.

#### Phase-1 setup and run

1. Create an empty PostgreSQL database, for example `exam_timetable`.
2. Copy `.env.example` to `.env` and replace its placeholder values.
3. Install dependencies with `npm install`.
4. Create the schema with `npm run migrate`.
5. Create the first Super Admin with `npm run seed:super-admin`.
6. Start the API with `npm start`.
7. Open `http://localhost:3000/health`; it should return `{"status":"ok"}`.

Running `npm run migrate` again skips migrations that have already been applied. Running `npm run seed:super-admin` again leaves the existing Super Admin and password unchanged.

### Phase 2 — Authentication and authorization

Phase 2 adds the API authentication and authorization layer. It does not add the React UI, spreadsheet imports, course/room management screens, exam-period creation, or timetable scheduling.

#### 1. Authentication approach

- Use short-lived JSON Web Tokens (JWTs) sent in the `Authorization: Bearer <token>` request header.
- Do not create password-reset-token, refresh-token, session, audit-log, or other authentication-history tables.
- Logout is client-side: the frontend deletes its saved access token. JWT expiry limits any remaining token lifetime.
- Add these environment variables to `.env.example`:

  ```text
  JWT_SECRET
  JWT_EXPIRES_IN=8h
  CORS_ORIGIN=http://localhost:5173
  ```

- Reject startup when `JWT_SECRET` is missing or too weak for development/production use.

#### 2. Password rules and first-login flow

- Continue using bcrypt with a cost factor of 12 for every password stored by the application.
- Require a minimum password length of eight characters; this supports the agreed temporary password format such as `12345678`.
- The Super Admin creates a department admin with a temporary password and `must_change_password = true`.
- A department admin can log in with that temporary password and receives a JWT whose response includes `mustChangePassword: true`.
- While that flag is true, middleware allows only `GET /auth/me`, `POST /auth/change-password`, and `POST /auth/logout`; all other protected routes return a clear `PASSWORD_CHANGE_REQUIRED` response.
- `POST /auth/change-password` verifies the current password, hashes the new password, and sets `must_change_password = false`.
- The Super Admin may directly replace a department admin's password at any time. This sets `must_change_password = true` again; no email/reset link is involved.

#### 3. API endpoints

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | Public | Verify email/password and return a JWT plus safe user data. |
| `GET` | `/auth/me` | Authenticated | Return the currently authenticated user. |
| `POST` | `/auth/change-password` | Authenticated | Change the caller's password; required on first login. |
| `POST` | `/auth/logout` | Authenticated | Return success; the client removes its JWT. |
| `POST` | `/admin/department-admins` | Super Admin | Create a department-admin account and set its temporary password. |
| `GET` | `/admin/department-admins` | Super Admin | List department admins without password hashes. |
| `PATCH` | `/admin/department-admins/:userId/password` | Super Admin | Set a new temporary password for one department admin. |
| `PATCH` | `/admin/department-admins/:userId/status` | Super Admin | Activate or deactivate a department-admin account. |

All successful user responses must omit `password_hash`. Validation and failure responses will use one consistent JSON error shape:

```json
{
  "error": {
    "code": "PASSWORD_CHANGE_REQUIRED",
    "message": "Change your temporary password before continuing."
  }
}
```

#### 4. Middleware and authorization rules

- `authenticate`: verify the JWT, load the current user from the database, reject unknown or inactive users, and attach safe user data to the request.
- `requireRole(...roles)`: enforce `SUPER_ADMIN` or `DEPARTMENT_ADMIN` access as appropriate.
- `requirePasswordChanged`: enforce the first-login restriction described above.
- `requireCoursePermission(courseId)`: reusable middleware/service for Phase 4. It confirms that a Super Admin has universal access and a Department Admin has a prefix matching the selected course's code.
- Deactivated department-admin accounts must be blocked immediately because `authenticate` checks the user record on every protected request.

#### 5. Security and application configuration

- Add `helmet` for standard HTTP security headers.
- Configure CORS to allow only `CORS_ORIGIN` during development; do not use a wildcard origin with authenticated requests.
- Normalize login and account-creation emails by trimming whitespace and converting them to lowercase.
- Add a Phase-2 migration with a unique index on `LOWER(users.email)` so email uniqueness is case-insensitive at the database level.
- Use generic login failures such as `Invalid email or password`; never reveal whether an email address exists.
- Do not log passwords, JWTs, Authorization headers, or password hashes.

#### 6. Backend structure

- Add `auth` and `admin` route modules, controllers, services, middleware, and validation helpers.
- Keep SQL in service/repository code and keep HTTP request/response handling in controllers.
- Add shared error-handling middleware so expected errors have the standard JSON response shape and unexpected errors do not expose stack traces.
- Extend `src/app.js` to register security middleware, CORS, JSON parsing, routes, and the final error handler.

#### 7. Manual completion checks

1. Seed the Super Admin and log in successfully.
2. Confirm invalid credentials receive the generic login error.
3. Create a department admin, log in using the temporary password, and confirm protected admin/scheduling-placeholder routes are blocked until password change.
4. Change the department admin password and confirm `mustChangePassword` becomes false.
5. Confirm a department admin cannot call Super Admin endpoints.
6. Reset that department admin password from the Super Admin endpoint and confirm first-login restriction is restored.
7. Deactivate the account and confirm its previously issued token is rejected on the next request.
8. Confirm all account responses omit password hashes and that email addresses differing only by case cannot be created twice.

#### Phase-2 deliverables

- JWT configuration and authentication middleware.
- Login, logout, current-user, and password-change endpoints.
- Super Admin department-admin provisioning, password-setting, listing, and activation endpoints.
- Role, password-change, and reusable course-permission authorization middleware.
- Security middleware, CORS configuration, common error responses, and the email-normalization migration.

### Phase 3 — Import pipeline

Phase 3 adds synchronous Super-Admin CSV/XLSX imports. It does not add import jobs, background workers, import-history tables, persisted import-error records, UI screens, or timetable scheduling.

#### 1. Necessary prerequisite: exam periods

Course enrollments are stored against an `exam_period_id`; therefore an exam period must exist before its enrollment file can be imported. Add only these minimal Super Admin endpoints in this phase:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/admin/exam-periods` | Create an exam period with name, start date, end date, and timezone. |
| `GET` | `/admin/exam-periods` | List existing exam periods so the caller can choose the enrollment-import target. |

Slot generation remains Phase 4. This phase creates no `exam_slots` automatically.

#### 2. Import endpoints

All endpoints require an authenticated Super Admin whose password-change requirement is already cleared. Each accepts one `multipart/form-data` file field named `file`.

| Method | Endpoint | Accepted input | Result |
| --- | --- | --- | --- |
| `POST` | `/admin/imports/admin-course-permissions` | CSV or XLSX access-control sheet | Department Admin course-prefix permissions are synchronized. No course lookup is performed. |
| `POST` | `/admin/imports/rooms` | CSV or XLSX rooms sheet | Rooms are inserted or updated by room number; a capacity below seats already reserved in any one slot is rejected. |
| `POST` | `/admin/exam-periods/:examPeriodId/imports/course-enrollments` | CSV or XLSX enrollment sheet | Courses, students, and normalized enrollments are synchronized for the selected exam period. |

Use an in-memory multipart parser with a conservative upload-size limit and a single XLSX/CSV parsing library. Files are parsed without executing formulas or macros. No uploaded file is retained after the request completes.

#### 3. Common synchronous import behaviour

Every import follows one request/response lifecycle:

```text
receive file
-> validate file type, size, worksheet, headers, and every row
-> normalize and deduplicate in memory
-> if any validation error: return errors and write nothing
-> if valid: apply the complete change in one PostgreSQL transaction
-> return an import summary
```

- Accepted extensions: `.csv` and `.xlsx` only.
- Read the first non-empty worksheet for XLSX files.
- Reject empty files, missing required headers, duplicate logical keys, invalid UUID route parameters, malformed emails, blank required cells, invalid capacities, and invalid roll-number data.
- Return validation errors directly; do not store them. Error entries contain spreadsheet row, column, code, and message.
- Cap returned error entries (for example 100) while returning the total error count, so a bad upload cannot create an excessively large API response.
- Normalize before comparison:
  - emails: trim and lowercase;
  - course codes, course prefixes, and room numbers: trim and uppercase;
  - roll numbers: trim and uppercase;
  - headers: trim and compare case-insensitively.
- Deduplicate values inside a file before database writes, while treating contradictory duplicate rows as validation errors.
- Use parameterized queries and one database transaction per successful import. There must be no partial imports.

A successful response returns only a summary, for example:

```json
{
  "message": "Course enrollments imported successfully.",
  "summary": {
    "coursesProcessed": 42,
    "studentsCreated": 18,
    "enrollmentsStored": 2310
  }
}
```

#### 4. Admin-course-permission spreadsheet

The first column is the admin email (`id` or `email`). Every subsequent non-empty cell in the row is a course code. Column labels after the email column are not significant because the source example repeats the header `course`.

```text
id              | course | course | course
cs@iitp.ac.in   | CS
ee@iitp.ac.in   | EE     | EC
ma@iitp.ac.in   | MA     | MC
```

Validation and database behaviour:

- Each email must belong to an existing active `DEPARTMENT_ADMIN`; this import does not create user accounts or set passwords.
- Unknown emails, Super Admin emails, and inactive Department Admin accounts produce validation errors.
- Every non-empty cell other than the email cell is treated as a course-code prefix. Rows may contain five, six, or more populated prefix cells; every populated cell is iterated and stored.
- Prefixes are normalized and deduplicated per user, but are not validated against `courses` and do not create course records.
- The import operates on direct `admin_course_prefix_permissions`; department metadata remains optional and does not determine access.
- An unknown, inactive, or non-Department-Admin email is rejected with a clear message telling the Super Admin whether to create, activate, or correct the account.

#### 5. Rooms spreadsheet

Support the supplied sheet shape through case-insensitive header aliases:

| Database field | Accepted header examples | Required |
| --- | --- | --- |
| `room_number` | `Room Nu`, `room number`, `room_no` | Yes |
| `location` | `Location`, `building`, `block` | Yes |
| `exam_capacity` | `Exam_Capacity`, `exam capacity`, `capacity` | Yes |

- `room_number` is the import key; room rows are deduplicated and upserted by this normalized number.
- Capacity must be a whole number greater than zero.
- Every room row must include a non-empty location/building/block value.
- Duplicate normalized room numbers in the same file are errors.
- The import never deletes or deactivates rooms that are absent from the uploaded file.
- After scheduling exists in Phase 4, capacity reductions that would place a room below already reserved seats must be rejected.

#### 6. Enrollment spreadsheet

Required headers are `sub_code`, `sub_name`, and `roll_no` (case-insensitive aliases may be documented if future source files differ). The `roll_no` cell contains semicolon-separated roll numbers.

```text
sub_code | sub_name                         | roll_no
CB5103   | Introduction to Computation...   | 2611CB01;2611CB02;2611CB03
```

Validation and database behaviour:

- The route's `examPeriodId` must reference an existing exam period.
- `sub_code` is required and normalized into `courses.course_code`.
- `sub_name` is required. If a non-empty name differs from the stored name, the import updates the course name.
- Each `roll_no` cell must contain at least one non-empty roll number after splitting on `;`.
- Duplicate roll numbers in one course are collapsed to one enrollment; conflicting duplicate course names are validation errors.
- Students are upserted by normalized `roll_number`.
- For every course included in the file, its enrollment set for the selected exam period is replaced atomically with the normalized set from the import. This prevents old/stale enrollments from causing false clash checks.
- A course with an already `SCHEDULED` exam in that period is skipped rather than changed. The response identifies every skipped course and its reason; every other valid, unscheduled course in the same file is imported normally. This keeps scheduled `exam_candidates` snapshots consistent.
- The importer locks existing course rows while checking schedule status. Scheduling locks the same course row, so a concurrent import either finishes before scheduling snapshots the new enrollments or observes the new scheduled exam and skips that course.

#### 7. Import application details

- Use bulk inserts/upserts where practical rather than issuing one database request per spreadsheet row.
- Do all database writes with the transaction client, not the general connection pool, so rollback is guaranteed on any failure.
- Permission synchronization, room upsert, and per-course enrollment replacement each have separate transactions; different uploaded files are independent.
- Add only migrations needed for minimal exam-period endpoints or import-supporting indexes. Do not add `import_jobs`, `import_errors`, audit tables, or asynchronous queues.
- Extend the Postman collection with an exam-period request and all three multipart file-upload requests after implementation.

#### 8. Manual completion checks

1. Create an exam period and use its ID to import a valid enrollment file.
2. Import each provided file type as both CSV and XLSX.
3. Upload one invalid row in each import and confirm the complete upload is rolled back.
4. Re-upload a corrected permissions file and confirm each listed admin's permissions match the selected synchronization policy.
5. Re-upload a rooms file and confirm existing room rows update by room number without deletion of absent rooms.
6. Re-upload enrollments for a course and confirm stale student rows for that course/period are removed.
7. Confirm unknown Department Admin emails and invalid/inactive accounts are rejected by the permission import.
8. Confirm imports never return password hashes or retain spreadsheet files/errors in the database.

#### Confirmed import rules

1. For every Department Admin listed in a permission file, replace that admin's complete stored prefix set with the populated prefixes in that row.
2. Replace enrollments only for the courses contained in an uploaded enrollment file, within the selected exam period.
3. Reject an unknown or inactive Department Admin email; the Super Admin must create or activate the account first.

### Phase 4 — Scheduling engine

Phase 4 turns the imported data into a working scheduling API. It adds the two daily exam slots, authorized course/room selection, timetable reads, and atomic exam creation. React screens and later editing/cancellation workflows remain outside this phase.

#### 1. Slot generation

Each configured exam date receives exactly two `exam_slots` in the exam period timezone:

| Session | Start | End |
| --- | --- | --- |
| `MORNING` | 09:30 | 12:30 |
| `AFTERNOON` | 14:30 | 17:30 |

Planned Super Admin endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/admin/exam-periods/:examPeriodId/slots` | Create both fixed sessions for one or more selected exam dates. |
| `GET` | `/admin/exam-periods/:examPeriodId/slots` | List an exam period's dates and slots. |

The create request accepts an explicit `examDates` array. This allows the Super Admin to include/exclude weekends and holidays instead of blindly generating a slot for every calendar date. Every selected date must be inside the exam period; duplicate date/session combinations are rejected by the database's existing unique constraint.

#### 2. Scheduling APIs

All schedule creation requires an authenticated user who has completed any required password change.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- |
| `GET` | `/exam-periods/:examPeriodId/schedulable-courses` | Super Admin / Department Admin | List courses with enrollments in the period that the caller may schedule. |
| `GET` | `/exam-periods/:examPeriodId/rooms?examSlotId=...` | Super Admin / Department Admin | List active rooms, their total capacity, and seats already reserved in the selected slot. |
| `POST` | `/exam-periods/:examPeriodId/exams` | Super Admin / authorized Department Admin | Schedule one course into one fixed slot and one or more rooms. |
| `GET` | `/exam-periods/:examPeriodId/timetable` | Super Admin / Department Admin | Return the timetable grouped by date and session. Department Admins see only courses matching their allowed prefixes. |

The schedule-create payload will be:

```json
{
  "courseId": "course UUID",
  "examSlotId": "slot UUID",
  "roomAllocations": [
    { "roomId": "room UUID", "seatsReserved": 70 },
    { "roomId": "another room UUID", "seatsReserved": 30 }
  ]
}
```

The API returns the created `SCHEDULED` exam, its candidate count, room allocations, and the slot details.

#### 3. Course access and schedulable-course list

- Super Admins can see and schedule every course with enrollments in the selected period.
- Department Admins can see and schedule only courses where `UPPER(course_code)` starts with one of their values in `admin_course_prefix_permissions`.
- For example, prefix `CS` permits `CS125`, `CS258`, and `CS654`; no course code must exactly equal `CS`.
- A course can have only one exam in an exam period. This is already protected by `UNIQUE (exam_period_id, course_id)`.
- If permission prefixes overlap across admins, either authorized admin may schedule the course first; subsequent attempts receive a clear `COURSE_ALREADY_SCHEDULED` response.

#### 4. Room model and multi-room allocation

One exam may use multiple rooms. One room may host multiple different exams in the same slot. There is no unique room/slot restriction on individual `exam_room_allocations`.

`seatsReserved` means the exact number of seats consumed by this exam in that room, not the room's total capacity. The schedule request must obey:

```text
For the new exam:
SUM(roomAllocations.seatsReserved) = enrolled candidate count

For every room in the selected slot:
existing room_slot_usage.reserved_seats
+ new seatsReserved for that room
<= rooms.exam_capacity
```

Exact equality is recommended rather than allowing over-reservation: it prevents an exam from reserving unused seats and incorrectly blocking another exam from using the same room/slot.

Validation rules:

- `roomAllocations` must be a non-empty array.
- A room can occur only once in an exam's allocation list.
- Every `roomId` must exist and be active.
- Every `seatsReserved` must be a positive integer.
- The slot must belong to the requested exam period.
- The course must have at least one enrollment in that exam period.

#### 5. Student clash detection

For the chosen course, the system loads its normalized `course_enrollments` for the requested period and compares them to `exam_candidates` already occupying the selected slot.

```text
target course students
INTERSECT
students already in exam_candidates for the slot
= empty set required
```

If a conflict exists, create no exam and return a response such as:

```json
{
  "error": {
    "code": "STUDENT_EXAM_CLASH",
    "message": "Cannot schedule this course because some students already have an exam in this slot.",
    "details": {
      "conflictingRollNumbers": ["2301CB01", "2301CB07"],
      "totalConflicts": 2
    }
  }
}
```

Return a bounded roll-number list plus the total count for very large clashes. `UNIQUE (exam_slot_id, student_id)` on `exam_candidates` remains the final database-level guard against concurrent scheduling requests creating a clash after the initial check.

#### 6. Atomic scheduling transaction

The schedule-create service uses one PostgreSQL transaction. No individual insert is committed until all checks succeed.

```text
validate authenticated user, IDs, prefix access, slot, course, and room allocations
-> load course enrollments for the period
-> check existing candidate clashes and collect roll numbers
-> atomically reserve room seats in room_slot_usage within room capacity
-> create the SCHEDULED exam
-> create every exam_room_allocation
-> copy enrolled students into exam_candidates
-> commit
```

For shared rooms, room-capacity updates must be concurrency-safe. The implementation will use atomic `INSERT ... ON CONFLICT ... DO UPDATE` updates to `room_slot_usage`, with a capacity condition, so two admins cannot both reserve the last available seats. A failed room update rolls back the entire transaction and returns the affected room, its capacity, current reservation, and attempted reservation.

If the database reports the candidate unique-index conflict during the final insert, the transaction rolls back, re-queries the conflicting roll numbers, and returns the same user-friendly student-clash response.

#### 7. Timetable and room-availability responses

The timetable response includes:

- exam period, dates, sessions, and fixed start/end times;
- course code/name, scheduled candidate count, status, and creator;
- each allocated room number, location, and seats reserved;
- for Super Admins, every exam; for Department Admins, only exams matching their permitted prefixes.

The room-list response includes `examCapacity`, `reservedSeats`, and `availableSeats` for the selected slot. It is informational; the create transaction always rechecks capacity rather than trusting a previously loaded availability value.

#### 8. Error behaviour

Use the existing standard JSON error structure with scheduling-specific error codes:

```text
EXAM_PERIOD_NOT_FOUND
EXAM_SLOT_NOT_FOUND
SLOT_NOT_IN_EXAM_PERIOD
COURSE_NOT_FOUND
COURSE_ACCESS_DENIED
COURSE_ALREADY_SCHEDULED
COURSE_HAS_NO_ENROLLMENTS
INVALID_ROOM_ALLOCATION
ROOM_NOT_FOUND
ROOM_INACTIVE
ROOM_CAPACITY_EXCEEDED
STUDENT_EXAM_CLASH
```

Every error leaves the database unchanged. No audit or background-import tables are introduced.

#### 9. Scope deliberately deferred to Phase 5

- Delete an existing exam and release its room usage/candidate snapshot.
- Export timetable files.
- Individual candidate-to-room or seat-number assignment.

Moving, editing room allocations, and rescheduling are deliberately not planned. To make any such change, an authorized admin deletes the exam and creates it again through the Phase-4 scheduling API.

Phase 4 stores room-level seat reservations only. It does not yet decide which exact candidate sits in which room; that can be added later without weakening capacity or clash checks.

#### 10. Manual completion checks

1. Generate slots for selected dates and confirm exactly two fixed sessions are created per date.
2. Confirm a Department Admin sees only courses matching their prefixes and cannot schedule another course.
3. Schedule a course with one room and then with multiple rooms; confirm reserved seats equal the enrollment count.
4. Schedule two unrelated courses into the same room/slot while their combined reserved seats remain within capacity.
5. Attempt to exceed aggregate room capacity and confirm the operation is rejected with no partial allocation.
6. Attempt to schedule overlapping student enrollments in one slot and confirm the response lists conflicting roll numbers.
7. Schedule the same course twice in the same period and confirm the second request is rejected.
8. Use two simultaneous schedule requests against the same students/room capacity and confirm database constraints permit at most one valid result.

#### Confirmed Phase-4 rules

1. The Super Admin explicitly supplies the dates for which the system generates the two fixed exam sessions.
2. `seatsReserved` across all rooms must equal the enrolled candidate count exactly.
3. Phase 4 creates only new `SCHEDULED` exams. Phase 5 adds delete-and-recreate; moving and editing remain unsupported.
- Return conflict roll numbers for student clashes and clear capacity messages for overbooking.

### Phase 5 — Timetable and administration APIs

Phase 5 finalizes timetable administration with safe exam deletion and export endpoints. There are no edit, move, reschedule, soft-cancel, audit-log, PDF, or UI features in this phase. To change a scheduled exam, an authorized admin deletes it and creates a new one.

#### 1. Safe delete-and-recreate workflow

Add one deletion endpoint:

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `DELETE` | `/exam-periods/:examPeriodId/exams/:examId` | Super Admin / authorized Department Admin | Permanently delete one scheduled exam and release its candidate and room-seat reservations. |

Authorization rules mirror schedule creation:

- Super Admin can delete any exam in the period.
- Department Admin can delete only an exam whose course code matches one of their stored course prefixes.
- The route must verify that the exam belongs to the requested exam period.

This is a hard delete, not a soft cancel. A soft-cancelled `exams` row would still conflict with the existing `UNIQUE (exam_period_id, course_id)` constraint and prevent the intended delete-and-create-again workflow.

#### 2. Atomic deletion transaction

Deleting an exam must reverse the scheduling transaction in one PostgreSQL transaction:

```text
validate exam period, exam, and prefix access
-> lock the exam's course row
-> load its room allocations
-> lock allocated room rows and corresponding room_slot_usage rows in stable order
-> subtract each allocation's seatsReserved from room_slot_usage
-> remove room_slot_usage rows that now have zero reserved seats
-> delete the exam
-> cascade-delete exam_room_allocations and exam_candidates
-> commit
```

The service must reject an impossible negative room usage rather than silently corrupting data. It uses the same course/room locking order as schedule creation, so deletion cannot race with a simultaneous scheduling request for the same course or rooms.

A successful response returns the deleted course, slot, candidate count, and released room-seat allocations. The same course may then be scheduled again through `POST /exam-periods/:examPeriodId/exams`.

#### 3. Consolidated timetable export

Add a Super-Admin-only export endpoint:

| Method | Endpoint | Output |
| --- | --- | --- |
| `GET` | `/exam-periods/:examPeriodId/exports/consolidated` | Downloadable CSV timetable for every scheduled exam in the period. |

The response uses `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment`. CSV is the initial format because it opens in Excel and avoids adding a spreadsheet-writing dependency.

The export uses one row per exam-room allocation, making multi-room exams unambiguous:

```text
Exam Date,Session,Start Time,End Time,Course Code,Course Name,Candidate Count,Room Number,Location,Seats Reserved
2026-12-01,MORNING,09:30,12:30,CS125,...,100,LT001,Lecture Hall,70
2026-12-01,MORNING,09:30,12:30,CS125,...,100,LT002,Lecture Hall,30
```

The query is sorted by date, session, course code, and room number. Values are CSV-escaped to preserve commas, quotes, and newlines in course or location names and to prevent spreadsheet formula injection for text beginning with `=`, `+`, `-`, or `@`.

#### 4. Department-wise timetable export

Department-wise export requires a reliable definition of *department*. The current imports grant access through course-code prefixes and do not populate `courses.department_id`; therefore filtering by the current `departments` table would usually be incomplete.

Recommended initial definition: a Department Admin export shows the exams whose course codes match that admin's stored prefixes. Add:

| Method | Endpoint | Access | Output |
| --- | --- | --- | --- |
| `GET` | `/exam-periods/:examPeriodId/exports/my-timetable` | Department Admin | Downloadable CSV of that admin's prefix-matched courses. |
| `GET` | `/exam-periods/:examPeriodId/exports/department-admins/:userId` | Super Admin | Downloadable CSV for one selected Department Admin's prefix-matched courses. |

This produces a practical department/admin-scoped timetable with today's data model. If two admins have overlapping prefixes, the same course can correctly appear in both exports.

If a formal academic-department export is required instead, a later phase must add a trusted course-to-department mapping/import before using `courses.department_id` for export filtering.

#### 5. Export contents and empty results

- Both export types use the same columns and include only `SCHEDULED` exams.
- Department Admin exports never include courses outside the authenticated admin's prefixes, even if a different `userId` is supplied.
- A valid exam period with no matching scheduled exams returns a CSV containing headers only and HTTP 200.
- Unknown exam periods, unknown Department Admin IDs, inactive Department Admin accounts, or unauthorized export attempts return standard JSON errors rather than a misleading empty file.

#### 6. Error behaviour

Use these additional error codes:

```text
EXAM_NOT_FOUND
EXAM_NOT_IN_EXAM_PERIOD
EXAM_DELETE_FORBIDDEN
ROOM_USAGE_INCONSISTENT
DEPARTMENT_ADMIN_NOT_FOUND
DEPARTMENT_ADMIN_INACTIVE
EXPORT_ACCESS_DENIED
```

Deletion and export do not add audit logs, background jobs, or new import tables.

#### 7. Manual completion checks

1. Delete a multi-room exam and confirm every `exam_candidates` row, allocation, and room-seat reservation is released.
2. Schedule another exam into the freed room/slot seats and confirm capacity is available again.
3. Delete an exam and schedule the same course into another slot successfully.
4. Confirm a Department Admin cannot delete or export a course outside their prefixes.
5. Export a consolidated timetable and confirm multi-room exams produce one row per allocated room.
6. Export a Department Admin timetable and confirm it contains only prefix-matched courses.
7. Include course/location values containing commas, quotes, and formula-like text; confirm the CSV remains safe and correctly formatted.

#### Implemented decisions

1. **Department-wise definition** — recommended: treat it as a Department Admin/prefix-scoped export because current imports do not assign courses to formal departments. Alternative: first add a formal course-to-department mapping and export by `department_id`.
2. **Export format** — recommended: CSV only for this phase; it opens in Excel without adding a writer dependency. Alternative: also generate `.xlsx` files now.

### Phase 6 — React UI

- Super Admin screens: imports, rooms, admins/permissions, exam periods, and master timetable.
- Department Admin screens: permitted course dropdown, date-by-session timetable, schedule modal, and validation feedback.

## Scheduling transaction outline

1. Authenticate the user and verify course permission.
2. Load the selected course's enrolled students for the active exam period.
3. Check for existing `exam_candidates` in the target slot and return their roll numbers if found.
4. Validate the proposed room allocations and each room's aggregate slot occupancy.
5. Confirm allocated seats across all selected rooms cover all candidates.
6. Create/update the exam, allocations, room usage, and candidate snapshot in one transaction.

## React client

The React/Vite frontend is in `client/` and is wired to the Express API.

1. Keep the backend running on `http://localhost:3000`.
2. Run `npm run client:dev` from the repository root.
3. Open `http://localhost:5173` and sign in with a seeded Super Admin or Department Admin account.

The browser client defaults to `http://localhost:3000`. Set `VITE_API_URL` in a client environment file when deploying the frontend against another API address. The UI uses light transitions and honors the operating-system reduced-motion setting.

The Super Admin import screen includes a paginated data browser for rooms, Department Admin prefix access, and course-enrolment summaries. Its backing APIs are `GET /admin/rooms`, `GET /admin/course-prefix-permissions`, and `GET /admin/exam-periods/:examPeriodId/course-enrollments`; each supports `page`, `pageSize`, and `search`, with a location or account-status filter where applicable.

## Future decisions

- Exact candidate-to-room/seating assignment can be added after core scheduling. The current design reserves enough seats per room without assigning individual seats.
- Departments are optional metadata because the current admin import contains email and course codes, not a department identifier. Direct course permissions remain authoritative.
