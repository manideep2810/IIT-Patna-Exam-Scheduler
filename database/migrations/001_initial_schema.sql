CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'DEPARTMENT_ADMIN');
CREATE TYPE exam_status AS ENUM ('DRAFT', 'SCHEDULED', 'CANCELLED');
CREATE TYPE slot_session AS ENUM ('MORNING', 'AFTERNOON');

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  name varchar(150) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  email varchar(320) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  role user_role NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  course_code varchar(50) NOT NULL UNIQUE,
  course_name varchar(255),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_course_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_course_permissions_user_course_key UNIQUE (user_id, course_id)
);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_number varchar(80) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exam_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  timezone varchar(50) NOT NULL DEFAULT 'Asia/Kolkata',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_periods_date_range_check CHECK (end_date >= start_date)
);

CREATE TABLE course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_period_id uuid NOT NULL REFERENCES exam_periods(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_enrollments_period_course_student_key
    UNIQUE (exam_period_id, course_id, student_id)
);

CREATE INDEX course_enrollments_period_course_idx
  ON course_enrollments (exam_period_id, course_id);
CREATE INDEX course_enrollments_period_student_idx
  ON course_enrollments (exam_period_id, student_id);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code varchar(50) NOT NULL UNIQUE,
  location varchar(150),
  room_number varchar(50),
  exam_capacity integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rooms_exam_capacity_check CHECK (exam_capacity > 0)
);

CREATE TABLE exam_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_period_id uuid NOT NULL REFERENCES exam_periods(id) ON DELETE CASCADE,
  exam_date date NOT NULL,
  session slot_session NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_slots_period_date_session_key UNIQUE (exam_period_id, exam_date, session),
  CONSTRAINT exam_slots_id_period_key UNIQUE (id, exam_period_id),
  CONSTRAINT exam_slots_time_range_check CHECK (end_at > start_at)
);

CREATE TABLE exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_period_id uuid NOT NULL REFERENCES exam_periods(id) ON DELETE CASCADE,
  exam_slot_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES courses(id),
  status exam_status NOT NULL DEFAULT 'DRAFT',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exams_slot_period_fkey
    FOREIGN KEY (exam_slot_id, exam_period_id)
    REFERENCES exam_slots (id, exam_period_id),
  CONSTRAINT exams_period_course_key UNIQUE (exam_period_id, course_id),
  CONSTRAINT exams_slot_course_key UNIQUE (exam_slot_id, course_id),
  CONSTRAINT exams_id_slot_key UNIQUE (id, exam_slot_id)
);

CREATE TABLE exam_room_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id),
  seats_reserved integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_room_allocations_exam_room_key UNIQUE (exam_id, room_id),
  CONSTRAINT exam_room_allocations_seats_reserved_check CHECK (seats_reserved > 0)
);

CREATE INDEX exam_room_allocations_room_idx ON exam_room_allocations (room_id);

CREATE TABLE room_slot_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_slot_id uuid NOT NULL REFERENCES exam_slots(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id),
  reserved_seats integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_slot_usage_slot_room_key UNIQUE (exam_slot_id, room_id),
  CONSTRAINT room_slot_usage_reserved_seats_check CHECK (reserved_seats >= 0)
);

CREATE TABLE exam_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL,
  exam_slot_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_candidates_exam_slot_fkey
    FOREIGN KEY (exam_id, exam_slot_id)
    REFERENCES exams (id, exam_slot_id)
    ON DELETE CASCADE,
  CONSTRAINT exam_candidates_exam_student_key UNIQUE (exam_id, student_id),
  CONSTRAINT exam_candidates_slot_student_key UNIQUE (exam_slot_id, student_id)
);

CREATE INDEX exam_candidates_slot_idx ON exam_candidates (exam_slot_id);
