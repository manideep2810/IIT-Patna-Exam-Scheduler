# IIT Patna Examination Timetable

A web application for IIT Patna's Examination Cell to create and manage examination timetables without student clashes or room-capacity conflicts.

The application has a React/Vite frontend and a Node.js/Express/PostgreSQL API.

## What it does

- Creates examination periods with Super Admin-defined morning and afternoon sessions.
- Lets the Super Admin import rooms, course enrolments, and Department Admin course-prefix access.
- Lets Department Admins schedule only the courses assigned to their prefixes.
- Prevents a student from receiving two examinations in the same session.
- Supports one exam across multiple rooms.
- Allows different exams to share a room in the same session when their combined reservations remain within capacity.
- Displays, filters, exports, and safely deletes scheduled examinations.

## User roles

### Super Admin

The Super Admin can create examination periods and sessions, manage Department Admin accounts, import source data, schedule any course, and export the consolidated timetable.

### Department Admin

A Department Admin signs in with a temporary password, sets a personal password, and schedules only courses covered by their assigned prefixes.

For example, a Department Admin with prefix `CS` can schedule `CS125`, `CS258`, and `CS654`.

## Scheduling rules

Each examination date has two sessions in the `Asia/Kolkata` timezone. The Super Admin chooses their start and end times when creating the examination period. The default End Semester timings are 09:30–12:30 and 14:30–17:30; for example, a Mid Semester period can instead use 10:30–12:30.

| Session | Time |
| --- | --- |
| Morning | 09:30–12:30 |
| Afternoon | 14:30–17:30 |

The application enforces the following rules:

1. A Department Admin may schedule only courses covered by their assigned prefixes.
2. A course may be scheduled only once in an examination period.
3. An exam's total reserved seats must exactly match its enrolled-candidate count.
4. A room's combined reservations in one session cannot exceed its capacity.
5. A student cannot have two examinations in the same date/session.
6. A scheduled exam is changed by deleting it and creating it again; edit and move operations are intentionally not provided.

CSV exports include an `Allocated Students` column for every room allocation. Students enrolled in a course are sorted by roll number, while that exam's rooms are sorted by reserved seats (largest first, then room number). Each room receives the next contiguous group of roll numbers, making the allocation deterministic and reproducible.

## Technology

- Frontend: React, Vite, Lucide icons
- Backend: Node.js, Express
- Database: PostgreSQL
- Authentication: JWT and bcrypt password hashes
- Spreadsheet imports: CSV and XLSX

## Prerequisites

- Node.js current LTS release
- PostgreSQL 14 or later
- npm

## Local setup

### 1. Install dependencies

From the repository root:

```bash
npm install
```

### 2. Configure the API

Create a root `.env` file from `.env.example`.

```env
PORT=3000
DATABASE_URL=postgresql://postgres:your-password@localhost:5432/exam_timetable
SUPER_ADMIN_EMAIL=admin@iitp.ac.in
SUPER_ADMIN_PASSWORD=use-a-strong-password
JWT_SECRET=use-a-random-secret-with-at-least-32-characters
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:5173
MAX_UPLOAD_SIZE_MB=10
```

`JWT_SECRET` must be at least 32 characters. Never commit `.env` files.

### 3. Create the database schema

Create the PostgreSQL database, then run:

```bash
npm run migrate
```

### 4. Create the initial Super Admin

```bash
npm run seed:super-admin
```

The seed is safe to run again: it does not overwrite an existing Super Admin password.

### 5. Configure the frontend

Create `client/.env` from `client/.env.example`:

```env
VITE_API_URL=http://localhost:3000
```

### 6. Run the application

Start the API:

```bash
npm start
```

Start the frontend in a second terminal:

```bash
npm run client:dev
```

Open the frontend URL printed by Vite, normally `http://localhost:5173`.

## First-time workflow

1. Sign in as the Super Admin.
2. Create an examination period.
3. Set the morning and afternoon timing for the period, then create sessions for each examination date.
4. Create Department Admin accounts and give them temporary passwords.
5. Import the Department Admin prefix sheet.
6. Import the room sheet.
7. Import the course-enrolment sheet for the selected examination period.
8. Schedule examinations and allocate one or more rooms.
9. Review the timetable and export CSV files when ready.

## Spreadsheet imports

All imports are available only to the Super Admin. Supported files are `.csv` and `.xlsx`.

### Department Admin access

The first column contains the Department Admin email. Remaining populated columns contain course-code prefixes.

| id | course | course | course |
| --- | --- | --- | --- |
| cs@iitp.ac.in | CS |  |  |
| ee@iitp.ac.in | EE | EC |  |
| ma@iitp.ac.in | MA | MC |  |

- Multiple prefixes per row are supported.
- Prefixes are not course IDs; they are matched against the start of a course code.
- Every listed email must already have an active Department Admin account. If one is missing, the import identifies the email addresses that must be created first.
- Every referenced Department Admin must exist and be active.
- Re-importing access replaces the imported prefixes for the affected administrators.

### Rooms and capacities

Required columns:

| Field | Accepted headers |
| --- | --- |
| Room number | `Room Number`, `Room No`, `room_number` |
| Location / block | `Location`, `Building`, `Block` |
| Capacity | `Exam_Capacity`, `Exam Capacity`, `Capacity` |

- Room number is the import key.
- Re-importing an existing room updates its location and capacity; it does not create a duplicate.
- A room capacity cannot be reduced below the highest number of seats already reserved for that room in any one session.
- If one room in a file fails that capacity check, the entire room import is rejected and no updates are applied.

### Course enrolments

Required columns:

| Field | Required header |
| --- | --- |
| Course code | `sub_code` |
| Course name | `sub_name` |
| Roll numbers | `roll_no` |

Roll numbers in `roll_no` must be separated by semicolons (`;`). Duplicate roll numbers in one course are automatically deduplicated.

When enrolments are re-imported:

- Unscheduled courses are refreshed from the file.
- Courses with a scheduled exam are skipped and left unchanged.
- Courses absent from the file are untouched.

## Room allocation example

An exam with 155 enrolled candidates can be split across rooms:

```text
Room 102: 80 seats
Room 502: 75 seats
Total:    155 seats
```

The same room may contain multiple unrelated exams in one session, provided all reservations together stay within capacity and no student clash exists.

## Useful API endpoints

The browser UI is the recommended way to use the application. Postman collections are included for API testing.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API health check |
| `POST` | `/auth/login` | Sign in |
| `POST` | `/auth/change-password` | Replace a temporary password |
| `GET` | `/exam-periods` | List available examination periods |
| `GET` | `/exam-periods/:examPeriodId/timetable` | Read the timetable |
| `POST` | `/exam-periods/:examPeriodId/exams` | Schedule an exam |
| `DELETE` | `/exam-periods/:examPeriodId/exams/:examId` | Delete a scheduled exam |

## Deployment

### API on Render

Create a Render PostgreSQL database and a Render Node web service in the same region.

| Render setting | Value |
| --- | --- |
| Install command | `npm ci` |
| Build command | Leave empty |
| Start command | `npm run start:once` |
| Health check path | `/health` |

Configure these Render environment variables:

```env
DATABASE_URL=<Render PostgreSQL Internal Database URL>
JWT_SECRET=<random production secret, at least 32 characters>
JWT_EXPIRES_IN=8h
CORS_ORIGIN=https://your-vercel-project.vercel.app
MAX_UPLOAD_SIZE_MB=10
```

Do not set `PORT`; Render supplies it automatically. Run `npm run migrate` and `npm run seed:super-admin` once against the production database before first use.

### Frontend on Vercel

Deploy from the repository root.

| Vercel setting | Value |
| --- | --- |
| Framework preset | Other |
| Root directory | `.` |
| Build command | `npm run client:build` |
| Output directory | `client/dist` |

Set this Vercel environment variable:

```env
VITE_API_URL=https://your-render-api.onrender.com
```

After obtaining the final Vercel URL, update `CORS_ORIGIN` in Render and redeploy the API.

## Project commands

```bash
npm start                # Run API locally with file watching
npm run start:once       # Run API once; use this in production
npm run migrate          # Apply pending PostgreSQL migrations
npm run seed:super-admin # Create the initial Super Admin if absent
npm run client:dev       # Run the Vite frontend locally
npm run client:build     # Create the frontend production build
```

## Security notes

- Passwords are stored only as bcrypt hashes.
- Temporary-password accounts must change their password before protected API access.
- JWTs are sent using the `Authorization: Bearer <token>` header.
- CORS is restricted through `CORS_ORIGIN`.
- Do not commit database URLs, JWT secrets, passwords, or any `.env` file.

## Support

For access, data corrections, or examination scheduling support, contact the IIT Patna Examination Cell.
