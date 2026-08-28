import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';
import {
  findHeaderIndex,
  normalizeUpper,
  readSpreadsheet,
  ValidationCollector,
  valueAt
} from './spreadsheet.service.js';
import { normalizeEmail } from './user.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function withTransaction(work) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function requireHeader(headers, aliases, label) {
  const index = findHeaderIndex(headers, aliases);

  if (index === -1) {
    throw new AppError(400, 'MISSING_REQUIRED_HEADER', `The spreadsheet is missing the required ${label} header.`);
  }

  return index;
}

function nonEmptyRow(row) {
  return row.some((cell) => valueAt([cell], 0) !== '');
}

export async function importAdminCoursePrefixes(file, grantedBy) {
  const { headers, rows, firstDataRowNumber } = await readSpreadsheet(file);
  const emailIndex = requireHeader(headers, ['id', 'email'], 'id or email');
  const collector = new ValidationCollector();
  const admins = new Map();

  rows.forEach((row, index) => {
    const spreadsheetRow = firstDataRowNumber + index;

    if (!nonEmptyRow(row)) {
      return;
    }

    const emailValue = valueAt(row, emailIndex);
    let email;

    try {
      email = normalizeEmail(emailValue);
    } catch {
      collector.add({
        row: spreadsheetRow,
        column: headers[emailIndex],
        code: 'INVALID_ADMIN_EMAIL',
        message: 'Enter the email address of an existing active Department Admin.'
      });
      return;
    }

    if (admins.has(email)) {
      collector.add({
        row: spreadsheetRow,
        column: headers[emailIndex],
        code: 'DUPLICATE_ADMIN_EMAIL',
        message: `Department Admin ${email} appears more than once in this file.`
      });
      return;
    }

    const prefixes = new Set();
    row.forEach((cell, columnIndex) => {
      if (columnIndex === emailIndex) {
        return;
      }

      const value = valueAt(row, columnIndex);

      if (value) {
        prefixes.add(normalizeUpper(value));
      }
    });

    if (prefixes.size === 0) {
      collector.add({
        row: spreadsheetRow,
        column: 'course prefixes',
        code: 'MISSING_COURSE_PREFIX',
        message: `Add at least one course-code prefix for Department Admin ${email}.`
      });
      return;
    }

    admins.set(email, { prefixes: [...prefixes], spreadsheetRow });
  });

  if (admins.size === 0 && collector.totalErrors === 0) {
    throw new AppError(400, 'EMPTY_IMPORT', 'The spreadsheet does not contain any Department Admin permission rows.');
  }

  const usersResult = await pool.query(
    `SELECT id, email, role, is_active
     FROM users
     WHERE email = ANY($1::text[])`,
    [[...admins.keys()]]
  );
  const usersByEmail = new Map(usersResult.rows.map((user) => [user.email, user]));
  const missingDepartmentAdminEmails = [];

  for (const [email, admin] of admins) {
    const user = usersByEmail.get(email);

    if (!user) {
      missingDepartmentAdminEmails.push(email);
      collector.add({
        row: admin.spreadsheetRow,
        column: 'id/email',
        code: 'DEPARTMENT_ADMIN_NOT_FOUND',
        message: `Department Admin ${email} was not found. Create this Department Admin account before importing permissions.`
      });
    } else if (user.role !== 'DEPARTMENT_ADMIN') {
      collector.add({
        row: admin.spreadsheetRow,
        column: 'id/email',
        code: 'NOT_A_DEPARTMENT_ADMIN',
        message: `${email} is not a Department Admin account and cannot receive course-prefix access.`
      });
    } else if (!user.is_active) {
      collector.add({
        row: admin.spreadsheetRow,
        column: 'id/email',
        code: 'DEPARTMENT_ADMIN_INACTIVE',
        message: `Department Admin ${email} is inactive. Activate the account before importing permissions.`
      });
    }
  }

  if (missingDepartmentAdminEmails.length > 0) {
    const visibleEmails = missingDepartmentAdminEmails.slice(0, 20);
    const remaining = missingDepartmentAdminEmails.length - visibleEmails.length;

    throw new AppError(
      400,
      'DEPARTMENT_ADMINS_REQUIRED',
      `Create Department Admin accounts before importing permissions for: ${visibleEmails.join(', ')}${remaining > 0 ? ` and ${remaining} more` : ''}.`,
      {
        missingDepartmentAdminEmails,
        errors: collector.errors,
        totalErrors: collector.totalErrors,
        errorsTruncated: collector.totalErrors > collector.errors.length
      }
    );
  }

  collector.throwIfAny();

  const adminIds = [];
  const permissionUserIds = [];
  const permissionPrefixes = [];

  for (const [email, admin] of admins) {
    const userId = usersByEmail.get(email).id;
    adminIds.push(userId);

    for (const prefix of admin.prefixes) {
      permissionUserIds.push(userId);
      permissionPrefixes.push(prefix);
    }
  }

  await withTransaction(async (client) => {
    await client.query(
      'DELETE FROM admin_course_prefix_permissions WHERE user_id = ANY($1::uuid[])',
      [adminIds]
    );
    await client.query(
      `INSERT INTO admin_course_prefix_permissions (id, user_id, course_prefix, granted_by)
       SELECT gen_random_uuid(), source.user_id, source.course_prefix, $3
       FROM UNNEST($1::uuid[], $2::text[]) AS source(user_id, course_prefix)`,
      [permissionUserIds, permissionPrefixes, grantedBy]
    );
  });

  return {
    adminsProcessed: admins.size,
    coursePrefixesStored: permissionPrefixes.length
  };
}

export async function importRooms(file) {
  const { headers, rows, firstDataRowNumber } = await readSpreadsheet(file);
  const roomNumberIndex = requireHeader(headers, ['room number', 'room no', 'room nu', 'room_number'], 'room number');
  const capacityIndex = requireHeader(headers, ['exam capacity', 'exam_capacity', 'capacity'], 'exam capacity');
  const locationIndex = requireHeader(headers, ['location', 'building', 'block'], 'location, building, or block');
  const collector = new ValidationCollector();
  const rooms = new Map();

  rows.forEach((row, index) => {
    const spreadsheetRow = firstDataRowNumber + index;

    if (!nonEmptyRow(row)) {
      return;
    }

    const roomNumber = normalizeUpper(valueAt(row, roomNumberIndex));
    const capacityText = valueAt(row, capacityIndex);
    const location = valueAt(row, locationIndex);

    if (!roomNumber) {
      collector.add({
        row: spreadsheetRow,
        column: headers[roomNumberIndex],
        code: 'MISSING_ROOM_NUMBER',
        message: 'Room number is required and is used as the room import key.'
      });
    }

    if (!location) {
      collector.add({
        row: spreadsheetRow,
        column: headers[locationIndex],
        code: 'MISSING_ROOM_LOCATION',
        message: 'Location or block is required so rooms can be grouped during allocation.'
      });
    }

    if (!/^\d+$/.test(capacityText) || Number.parseInt(capacityText, 10) < 1) {
      collector.add({
        row: spreadsheetRow,
        column: headers[capacityIndex],
        code: 'INVALID_ROOM_CAPACITY',
        message: 'Exam capacity must be a whole number greater than zero.'
      });
    }

    if (roomNumber && rooms.has(roomNumber)) {
      collector.add({
        row: spreadsheetRow,
        column: headers[roomNumberIndex],
        code: 'DUPLICATE_ROOM_NUMBER',
        message: `Room number ${roomNumber} appears more than once in this file.`
      });
    }

    if (roomNumber && location && /^\d+$/.test(capacityText) && Number.parseInt(capacityText, 10) > 0 && !rooms.has(roomNumber)) {
      rooms.set(roomNumber, {
        location,
        examCapacity: Number.parseInt(capacityText, 10)
      });
    }
  });

  if (rooms.size === 0 && collector.totalErrors === 0) {
    throw new AppError(400, 'EMPTY_IMPORT', 'The spreadsheet does not contain any room rows.');
  }

  collector.throwIfAny();

  const roomNumbers = [...rooms.keys()];
  const locations = roomNumbers.map((roomNumber) => rooms.get(roomNumber).location);
  const capacities = roomNumbers.map((roomNumber) => rooms.get(roomNumber).examCapacity);

  await withTransaction(async (client) => {
    // Scheduling locks room rows before reserving seats. Lock the same rows
    // here so no reservation can be added between this check and the update.
    const existingRooms = await client.query(
      `SELECT id, room_number
       FROM rooms
       WHERE room_number = ANY($1::text[])
       ORDER BY id ASC
       FOR UPDATE`,
      [roomNumbers]
    );

    if (existingRooms.rowCount > 0) {
      const usageResult = await client.query(
        `SELECT rooms.room_number,
                COALESCE(MAX(usage.reserved_seats), 0)::integer AS highest_reserved_seats
         FROM rooms
         LEFT JOIN room_slot_usage usage ON usage.room_id = rooms.id
         WHERE rooms.id = ANY($1::uuid[])
         GROUP BY rooms.room_number`,
        [existingRooms.rows.map((room) => room.id)]
      );
      const reservedSeatsByRoom = new Map(
        usageResult.rows.map((room) => [room.room_number, room.highest_reserved_seats])
      );
      const conflicts = roomNumbers
        .map((roomNumber) => ({
          roomNumber,
          importedCapacity: rooms.get(roomNumber).examCapacity,
          reservedSeats: Number(reservedSeatsByRoom.get(roomNumber) ?? 0)
        }))
        .filter((room) => room.importedCapacity < room.reservedSeats);

      if (conflicts.length > 0) {
        throw new AppError(
          409,
          'ROOM_CAPACITY_BELOW_RESERVED_SEATS',
          `Room capacity cannot be reduced below existing reservations: ${conflicts.map((room) => `${room.roomNumber} has ${room.reservedSeats} reserved seats`).join('; ')}.`,
          { rooms: conflicts }
        );
      }
    }

    await client.query(
      `INSERT INTO rooms (room_number, location, exam_capacity)
       SELECT source.room_number, source.location, source.exam_capacity
       FROM UNNEST($1::text[], $2::text[], $3::integer[]) AS source(room_number, location, exam_capacity)
       ON CONFLICT (room_number) DO UPDATE
       SET location = EXCLUDED.location,
           exam_capacity = EXCLUDED.exam_capacity`,
      [roomNumbers, locations, capacities]
    );
  });

  return { roomsProcessed: roomNumbers.length };
}

export async function importCourseEnrollments(file, examPeriodId) {
  if (typeof examPeriodId !== 'string' || !UUID_PATTERN.test(examPeriodId)) {
    throw new AppError(400, 'INVALID_EXAM_PERIOD_ID', 'examPeriodId must be a valid UUID.');
  }

  const { headers, rows, firstDataRowNumber } = await readSpreadsheet(file);
  const courseCodeIndex = requireHeader(headers, ['sub_code'], 'sub_code');
  const courseNameIndex = requireHeader(headers, ['sub_name'], 'sub_name');
  const rollNumbersIndex = requireHeader(headers, ['roll_no'], 'roll_no');
  const collector = new ValidationCollector();
  const courses = new Map();

  rows.forEach((row, index) => {
    const spreadsheetRow = firstDataRowNumber + index;

    if (!nonEmptyRow(row)) {
      return;
    }

    const courseCode = normalizeUpper(valueAt(row, courseCodeIndex));
    const courseName = valueAt(row, courseNameIndex);
    const rollNumbersText = valueAt(row, rollNumbersIndex);

    if (!courseCode) {
      collector.add({ row: spreadsheetRow, column: headers[courseCodeIndex], code: 'MISSING_COURSE_CODE', message: 'sub_code is required.' });
    }
    if (!courseName) {
      collector.add({ row: spreadsheetRow, column: headers[courseNameIndex], code: 'MISSING_COURSE_NAME', message: 'sub_name is required.' });
    }

    const rollNumbers = [...new Set(rollNumbersText.split(';').map((rollNumber) => normalizeUpper(rollNumber)).filter(Boolean))];

    if (rollNumbers.length === 0) {
      collector.add({ row: spreadsheetRow, column: headers[rollNumbersIndex], code: 'MISSING_ROLL_NUMBERS', message: 'roll_no must contain at least one roll number.' });
    }

    if (!courseCode || !courseName || rollNumbers.length === 0) {
      return;
    }

    const existingCourse = courses.get(courseCode);

    if (existingCourse && existingCourse.courseName !== courseName) {
      collector.add({
        row: spreadsheetRow,
        column: headers[courseNameIndex],
        code: 'CONFLICTING_COURSE_NAME',
        message: `Course ${courseCode} has conflicting sub_name values in this file.`
      });
      return;
    }

    const course = existingCourse ?? { courseName, rollNumbers: new Set() };
    rollNumbers.forEach((rollNumber) => course.rollNumbers.add(rollNumber));
    courses.set(courseCode, course);
  });

  if (courses.size === 0 && collector.totalErrors === 0) {
    throw new AppError(400, 'EMPTY_IMPORT', 'The spreadsheet does not contain any course enrollment rows.');
  }

  collector.throwIfAny();

  return withTransaction(async (client) => {
    const period = await client.query('SELECT id FROM exam_periods WHERE id = $1', [examPeriodId]);

    if (period.rowCount === 0) {
      throw new AppError(404, 'EXAM_PERIOD_NOT_FOUND', 'The selected exam period was not found.');
    }

    const courseCodes = [...courses.keys()];
    await client.query(
      `SELECT id
       FROM courses
       WHERE course_code = ANY($1::text[])
       ORDER BY id ASC
       FOR UPDATE`,
      [courseCodes]
    );
    const scheduledExams = await client.query(
      `SELECT courses.course_code
       FROM exams
       JOIN courses ON courses.id = exams.course_id
       WHERE exams.exam_period_id = $1
         AND exams.status = 'SCHEDULED'
         AND courses.course_code = ANY($2::text[])`,
      [examPeriodId, courseCodes]
    );
    const scheduledCourseCodes = new Set(scheduledExams.rows.map((row) => row.course_code));
    const importableCourseCodes = courseCodes.filter((courseCode) => !scheduledCourseCodes.has(courseCode));
    const skippedCourses = [...scheduledCourseCodes].sort().map((courseCode) => ({
      courseCode,
      reason: 'A scheduled exam already exists for this course.'
    }));

    if (importableCourseCodes.length === 0) {
      return {
        coursesProcessed: 0,
        coursesSkipped: skippedCourses.length,
        skippedCourses,
        studentsCreated: 0,
        enrollmentsStored: 0
      };
    }

    const courseNames = importableCourseCodes.map((courseCode) => courses.get(courseCode).courseName);
    const courseRows = await client.query(
      `INSERT INTO courses (course_code, course_name)
       SELECT source.course_code, source.course_name
       FROM UNNEST($1::text[], $2::text[]) AS source(course_code, course_name)
       ON CONFLICT (course_code) DO UPDATE
       SET course_name = EXCLUDED.course_name
       RETURNING id, course_code`,
      [importableCourseCodes, courseNames]
    );
    const courseIdsByCode = new Map(courseRows.rows.map((course) => [course.course_code, course.id]));
    const rollNumbers = [
      ...new Set(importableCourseCodes.flatMap((courseCode) => [...courses.get(courseCode).rollNumbers]))
    ];
    const newStudents = await client.query(
      `INSERT INTO students (roll_number)
       SELECT roll_number FROM UNNEST($1::text[]) AS source(roll_number)
       ON CONFLICT (roll_number) DO NOTHING
       RETURNING id`,
      [rollNumbers]
    );
    const students = await client.query(
      'SELECT id, roll_number FROM students WHERE roll_number = ANY($1::text[])',
      [rollNumbers]
    );
    const studentIdsByRollNumber = new Map(students.rows.map((student) => [student.roll_number, student.id]));
    const courseIds = importableCourseCodes.map((courseCode) => courseIdsByCode.get(courseCode));

    await client.query(
      'DELETE FROM course_enrollments WHERE exam_period_id = $1 AND course_id = ANY($2::uuid[])',
      [examPeriodId, courseIds]
    );

    const enrollmentCourseIds = [];
    const enrollmentStudentIds = [];

    for (const courseCode of importableCourseCodes) {
      const course = courses.get(courseCode);

      for (const rollNumber of course.rollNumbers) {
        enrollmentCourseIds.push(courseIdsByCode.get(courseCode));
        enrollmentStudentIds.push(studentIdsByRollNumber.get(rollNumber));
      }
    }

    await client.query(
      `INSERT INTO course_enrollments (exam_period_id, course_id, student_id)
       SELECT $1, source.course_id, source.student_id
       FROM UNNEST($2::uuid[], $3::uuid[]) AS source(course_id, student_id)`,
      [examPeriodId, enrollmentCourseIds, enrollmentStudentIds]
    );

    return {
      coursesProcessed: importableCourseCodes.length,
      coursesSkipped: skippedCourses.length,
      skippedCourses,
      studentsCreated: newStudents.rowCount,
      enrollmentsStored: enrollmentCourseIds.length
    };
  });
}
