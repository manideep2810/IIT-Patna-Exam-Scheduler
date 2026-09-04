import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CONFLICTING_ROLL_NUMBERS = 100;

function requireUuid(value, label, code) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(400, code, `${label} must be a valid UUID.`);
  }

  return value;
}

function parseRoomAllocations(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError(400, 'INVALID_ROOM_ALLOCATION', 'Provide at least one room allocation.');
  }

  const roomIds = new Set();

  return value.map((allocation, index) => {
    const roomId = requireUuid(allocation?.roomId, `roomAllocations[${index}].roomId`, 'INVALID_ROOM_ALLOCATION');
    const seatsReserved = allocation?.seatsReserved;

    if (!Number.isInteger(seatsReserved) || seatsReserved < 1) {
      throw new AppError(
        400,
        'INVALID_ROOM_ALLOCATION',
        `roomAllocations[${index}].seatsReserved must be a positive integer.`
      );
    }

    if (roomIds.has(roomId)) {
      throw new AppError(400, 'INVALID_ROOM_ALLOCATION', 'A room can be allocated only once for an exam.');
    }

    roomIds.add(roomId);
    return { roomId, seatsReserved };
  });
}

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

async function requireExamPeriod(client, examPeriodId) {
  const result = await client.query('SELECT id FROM exam_periods WHERE id = $1', [examPeriodId]);

  if (result.rowCount === 0) {
    throw new AppError(404, 'EXAM_PERIOD_NOT_FOUND', 'The selected exam period was not found.');
  }
}

async function requireSlotInPeriod(client, examPeriodId, examSlotId) {
  const slotResult = await client.query(
    `SELECT id, exam_period_id, exam_date, session, start_at, end_at
     FROM exam_slots
     WHERE id = $1`,
    [examSlotId]
  );
  const slot = slotResult.rows[0];

  if (!slot) {
    throw new AppError(404, 'EXAM_SLOT_NOT_FOUND', 'The selected exam slot was not found.');
  }

  if (slot.exam_period_id !== examPeriodId) {
    throw new AppError(400, 'SLOT_NOT_IN_EXAM_PERIOD', 'The selected exam slot does not belong to this exam period.');
  }

  return slot;
}

async function getStudentClashes(database, examPeriodId, courseId, examSlotId) {
  const result = await database.query(
    `WITH conflicts AS (
       SELECT DISTINCT students.roll_number
       FROM course_enrollments enrollments
       JOIN exam_candidates candidates ON candidates.student_id = enrollments.student_id
       JOIN students ON students.id = enrollments.student_id
       WHERE enrollments.exam_period_id = $1
         AND enrollments.course_id = $2
         AND candidates.exam_slot_id = $3
     )
     SELECT roll_number, COUNT(*) OVER () AS total_conflicts
     FROM conflicts
     ORDER BY roll_number ASC
     LIMIT $4`,
    [examPeriodId, courseId, examSlotId, MAX_CONFLICTING_ROLL_NUMBERS]
  );

  return {
    rollNumbers: result.rows.map((row) => row.roll_number),
    total: result.rowCount > 0 ? Number.parseInt(result.rows[0].total_conflicts, 10) : 0
  };
}

function studentClashError(clashes) {
  return new AppError(
    409,
    'STUDENT_EXAM_CLASH',
    'Cannot schedule this course because some students already have an exam in this slot.',
    {
      conflictingRollNumbers: clashes.rollNumbers,
      totalConflicts: clashes.total,
      rollNumbersTruncated: clashes.total > clashes.rollNumbers.length
    }
  );
}

async function authorizeCourse(client, user, courseCode) {
  if (user.role === 'SUPER_ADMIN') {
    return;
  }

  const permission = await client.query(
    `SELECT 1
     FROM admin_course_prefix_permissions
     WHERE user_id = $1
       AND UPPER($2) LIKE course_prefix || '%'`,
    [user.id, courseCode]
  );

  if (permission.rowCount === 0) {
    throw new AppError(403, 'COURSE_ACCESS_DENIED', 'You do not have permission to schedule this course.');
  }
}

function toCourse(row) {
  return {
    id: row.id,
    courseCode: row.course_code,
    courseName: row.course_name,
    candidateCount: Number.parseInt(row.candidate_count, 10)
  };
}

export async function listSchedulableCourses(examPeriodId, user) {
  requireUuid(examPeriodId, 'examPeriodId', 'INVALID_EXAM_PERIOD_ID');
  const period = await pool.query('SELECT id FROM exam_periods WHERE id = $1', [examPeriodId]);

  if (period.rowCount === 0) {
    throw new AppError(404, 'EXAM_PERIOD_NOT_FOUND', 'The selected exam period was not found.');
  }

  const result = await pool.query(
    `SELECT courses.id, courses.course_code, courses.course_name, COUNT(enrollments.student_id) AS candidate_count
     FROM course_enrollments enrollments
     JOIN courses ON courses.id = enrollments.course_id
     WHERE enrollments.exam_period_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM exams
         WHERE exams.exam_period_id = $1 AND exams.course_id = courses.id
       )
       AND (
         $2 = 'SUPER_ADMIN'
         OR EXISTS (
           SELECT 1
           FROM admin_course_prefix_permissions permissions
           WHERE permissions.user_id = $3
             AND UPPER(courses.course_code) LIKE permissions.course_prefix || '%'
         )
       )
     GROUP BY courses.id, courses.course_code, courses.course_name
     ORDER BY courses.course_code ASC`,
    [examPeriodId, user.role, user.id]
  );

  return result.rows.map(toCourse);
}

export async function listRoomAvailability(examPeriodId, examSlotId) {
  requireUuid(examPeriodId, 'examPeriodId', 'INVALID_EXAM_PERIOD_ID');
  requireUuid(examSlotId, 'examSlotId', 'INVALID_EXAM_SLOT_ID');
  const client = await pool.connect();

  try {
    await requireExamPeriod(client, examPeriodId);
    await requireSlotInPeriod(client, examPeriodId, examSlotId);
    const result = await client.query(
      `SELECT rooms.id,
              rooms.room_number,
              rooms.location,
              rooms.exam_capacity,
              COALESCE(usage.reserved_seats, 0) AS reserved_seats,
              rooms.exam_capacity - COALESCE(usage.reserved_seats, 0) AS available_seats
       FROM rooms
       LEFT JOIN room_slot_usage usage
         ON usage.room_id = rooms.id AND usage.exam_slot_id = $1
       WHERE rooms.is_active = true
       ORDER BY rooms.room_number ASC`,
      [examSlotId]
    );

    return result.rows.map((room) => ({
      id: room.id,
      roomNumber: room.room_number,
      location: room.location,
      examCapacity: room.exam_capacity,
      reservedSeats: room.reserved_seats,
      availableSeats: room.available_seats
    }));
  } finally {
    client.release();
  }
}

export async function scheduleExam(examPeriodId, payload, user) {
  requireUuid(examPeriodId, 'examPeriodId', 'INVALID_EXAM_PERIOD_ID');
  const courseId = requireUuid(payload?.courseId, 'courseId', 'INVALID_COURSE_ID');
  const examSlotId = requireUuid(payload?.examSlotId, 'examSlotId', 'INVALID_EXAM_SLOT_ID');
  const requestedAllocations = parseRoomAllocations(payload?.roomAllocations);

  try {
    return await withTransaction(async (client) => {
      await requireExamPeriod(client, examPeriodId);
      const slot = await requireSlotInPeriod(client, examPeriodId, examSlotId);
      const courseResult = await client.query(
        'SELECT id, course_code, course_name FROM courses WHERE id = $1 FOR UPDATE',
        [courseId]
      );
      const course = courseResult.rows[0];

      if (!course) {
        throw new AppError(404, 'COURSE_NOT_FOUND', 'The selected course was not found.');
      }

      await authorizeCourse(client, user, course.course_code);

      const enrollments = await client.query(
        `SELECT student_id
         FROM course_enrollments
         WHERE exam_period_id = $1 AND course_id = $2`,
        [examPeriodId, courseId]
      );

      if (enrollments.rowCount === 0) {
        throw new AppError(400, 'COURSE_HAS_NO_ENROLLMENTS', 'This course has no enrolled students in the selected exam period.');
      }

      const existingExam = await client.query(
        'SELECT id FROM exams WHERE exam_period_id = $1 AND course_id = $2',
        [examPeriodId, courseId]
      );

      if (existingExam.rowCount > 0) {
        throw new AppError(409, 'COURSE_ALREADY_SCHEDULED', 'This course already has an exam in the selected exam period.');
      }

      const clashes = await getStudentClashes(client, examPeriodId, courseId, examSlotId);

      if (clashes.total > 0) {
        throw studentClashError(clashes);
      }

      const roomIds = requestedAllocations.map((allocation) => allocation.roomId);
      const roomsResult = await client.query(
        `SELECT id, room_number, location, exam_capacity, is_active
         FROM rooms
         WHERE id = ANY($1::uuid[])
         ORDER BY id ASC
         FOR UPDATE`,
        [roomIds]
      );
      const roomsById = new Map(roomsResult.rows.map((room) => [room.id, room]));

      for (const allocation of requestedAllocations) {
        const room = roomsById.get(allocation.roomId);

        if (!room) {
          throw new AppError(404, 'ROOM_NOT_FOUND', `Room ${allocation.roomId} was not found.`);
        }

        if (!room.is_active) {
          throw new AppError(400, 'ROOM_INACTIVE', `Room ${room.room_number} is inactive.`);
        }

        if (allocation.seatsReserved > room.exam_capacity) {
          throw new AppError(
            409,
            'ROOM_CAPACITY_EXCEEDED',
            `Room ${room.room_number} has capacity ${room.exam_capacity}, below the requested ${allocation.seatsReserved} seats.`,
            { roomId: room.id, roomNumber: room.room_number, examCapacity: room.exam_capacity }
          );
        }
      }

      const candidateCount = enrollments.rowCount;
      const reservedSeatCount = requestedAllocations.reduce((total, allocation) => total + allocation.seatsReserved, 0);

      if (reservedSeatCount !== candidateCount) {
        throw new AppError(
          400,
          'INVALID_ROOM_ALLOCATION',
          `Reserved seats must exactly equal the ${candidateCount} enrolled candidates; received ${reservedSeatCount}.`,
          { candidateCount, reservedSeatCount }
        );
      }

      const examResult = await client.query(
        `INSERT INTO exams (exam_period_id, exam_slot_id, course_id, status, created_by)
         VALUES ($1, $2, $3, 'SCHEDULED', $4)
         RETURNING id, status, created_at`,
        [examPeriodId, examSlotId, courseId, user.id]
      );
      const exam = examResult.rows[0];

      const allocationsForReservation = [...requestedAllocations].sort((first, second) => first.roomId.localeCompare(second.roomId));

      for (const allocation of allocationsForReservation) {
        const room = roomsById.get(allocation.roomId);
        const usageUpdate = await client.query(
          `INSERT INTO room_slot_usage AS usage (exam_slot_id, room_id, reserved_seats)
           VALUES ($1, $2, $3)
           ON CONFLICT (exam_slot_id, room_id) DO UPDATE
           SET reserved_seats = usage.reserved_seats + EXCLUDED.reserved_seats,
               updated_at = now()
           WHERE usage.reserved_seats + EXCLUDED.reserved_seats <= $4
           RETURNING reserved_seats`,
          [examSlotId, allocation.roomId, allocation.seatsReserved, room.exam_capacity]
        );

        if (usageUpdate.rowCount === 0) {
          const currentUsage = await client.query(
            `SELECT COALESCE(reserved_seats, 0) AS reserved_seats
             FROM room_slot_usage
             WHERE exam_slot_id = $1 AND room_id = $2`,
            [examSlotId, allocation.roomId]
          );
          const currentReservedSeats = currentUsage.rows[0]?.reserved_seats ?? 0;

          throw new AppError(
            409,
            'ROOM_CAPACITY_EXCEEDED',
            `Room ${room.room_number} does not have enough available seats in this slot.`,
            {
              roomId: room.id,
              roomNumber: room.room_number,
              examCapacity: room.exam_capacity,
              currentReservedSeats,
              attemptedReservation: allocation.seatsReserved
            }
          );
        }
      }

      await client.query(
        `INSERT INTO exam_room_allocations (id, exam_id, room_id, seats_reserved)
         SELECT gen_random_uuid(), $1, source.room_id, source.seats_reserved
         FROM UNNEST($2::uuid[], $3::integer[]) AS source(room_id, seats_reserved)`,
        [
          exam.id,
          requestedAllocations.map((allocation) => allocation.roomId),
          requestedAllocations.map((allocation) => allocation.seatsReserved)
        ]
      );

      await client.query(
        `INSERT INTO exam_candidates (id, exam_id, exam_slot_id, student_id)
         SELECT gen_random_uuid(), $1, $2, student_id
         FROM UNNEST($3::uuid[]) AS source(student_id)`,
        [exam.id, examSlotId, enrollments.rows.map((enrollment) => enrollment.student_id)]
      );

      return {
        id: exam.id,
        status: exam.status,
        createdAt: exam.created_at,
        course: {
          id: course.id,
          courseCode: course.course_code,
          courseName: course.course_name
        },
        slot: {
          id: slot.id,
          examDate: slot.exam_date,
          session: slot.session,
          startAt: slot.start_at,
          endAt: slot.end_at
        },
        candidateCount,
        roomAllocations: requestedAllocations.map((allocation) => {
          const room = roomsById.get(allocation.roomId);
          return {
            roomId: room.id,
            roomNumber: room.room_number,
            location: room.location,
            seatsReserved: allocation.seatsReserved
          };
        })
      };
    });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'exams_period_course_key') {
      throw new AppError(409, 'COURSE_ALREADY_SCHEDULED', 'This course already has an exam in the selected exam period.');
    }

    if (error.code === '23505' && error.constraint === 'exam_candidates_slot_student_key') {
      const clashes = await getStudentClashes(pool, examPeriodId, courseId, examSlotId);
      throw studentClashError(clashes);
    }

    throw error;
  }
}

export async function deleteExam(examPeriodId, examId, user) {
  requireUuid(examPeriodId, 'examPeriodId', 'INVALID_EXAM_PERIOD_ID');
  requireUuid(examId, 'examId', 'INVALID_EXAM_ID');

  return withTransaction(async (client) => {
    await requireExamPeriod(client, examPeriodId);
    const examResult = await client.query(
      `SELECT exams.id,
              exams.exam_slot_id,
              exams.status,
              courses.id AS course_id,
              courses.course_code,
              courses.course_name,
              candidates.candidate_count,
              slots.exam_date,
              slots.session,
              slots.start_at,
              slots.end_at
       FROM exams
       JOIN courses ON courses.id = exams.course_id
       JOIN exam_slots slots ON slots.id = exams.exam_slot_id
       JOIN LATERAL (
         SELECT COUNT(*)::integer AS candidate_count
         FROM exam_candidates
         WHERE exam_id = exams.id
       ) candidates ON true
       WHERE exams.id = $1 AND exams.exam_period_id = $2
       FOR UPDATE OF exams, courses`,
      [examId, examPeriodId]
    );
    const exam = examResult.rows[0];

    if (!exam) {
      throw new AppError(404, 'EXAM_NOT_FOUND', 'The selected exam was not found in this exam period.');
    }

    await authorizeCourse(client, user, exam.course_code);

    const allocationResult = await client.query(
      `SELECT allocations.room_id, allocations.seats_reserved, rooms.room_number, rooms.location
       FROM exam_room_allocations allocations
       JOIN rooms ON rooms.id = allocations.room_id
       WHERE allocations.exam_id = $1
       ORDER BY allocations.room_id ASC`,
      [examId]
    );
    const allocations = allocationResult.rows;
    const roomIds = allocations.map((allocation) => allocation.room_id);

    if (roomIds.length > 0) {
      await client.query(
        `SELECT id
         FROM rooms
         WHERE id = ANY($1::uuid[])
         ORDER BY id ASC
         FOR UPDATE`,
        [roomIds]
      );

      const usageResult = await client.query(
        `SELECT room_id, reserved_seats
         FROM room_slot_usage
         WHERE exam_slot_id = $1 AND room_id = ANY($2::uuid[])
         ORDER BY room_id ASC
         FOR UPDATE`,
        [exam.exam_slot_id, roomIds]
      );
      const usageByRoomId = new Map(usageResult.rows.map((usage) => [usage.room_id, usage]));

      for (const allocation of allocations) {
        const usage = usageByRoomId.get(allocation.room_id);

        if (!usage || usage.reserved_seats < allocation.seats_reserved) {
          throw new AppError(
            409,
            'ROOM_USAGE_INCONSISTENT',
            `Room usage for ${allocation.room_number} cannot be safely released.`,
            { roomId: allocation.room_id, roomNumber: allocation.room_number }
          );
        }

        await client.query(
          `UPDATE room_slot_usage
           SET reserved_seats = reserved_seats - $3,
               updated_at = now()
           WHERE exam_slot_id = $1 AND room_id = $2`,
          [exam.exam_slot_id, allocation.room_id, allocation.seats_reserved]
        );
      }

      await client.query(
        `DELETE FROM room_slot_usage
         WHERE exam_slot_id = $1
           AND room_id = ANY($2::uuid[])
           AND reserved_seats = 0`,
        [exam.exam_slot_id, roomIds]
      );
    }

    await client.query('DELETE FROM exams WHERE id = $1', [examId]);

    return {
      id: exam.id,
      status: exam.status,
      course: {
        id: exam.course_id,
        courseCode: exam.course_code,
        courseName: exam.course_name
      },
      candidateCount: exam.candidate_count,
      slot: {
        id: exam.exam_slot_id,
        examDate: exam.exam_date,
        session: exam.session,
        startAt: exam.start_at,
        endAt: exam.end_at
      },
      releasedRoomAllocations: allocations.map((allocation) => ({
        roomId: allocation.room_id,
        roomNumber: allocation.room_number,
        location: allocation.location,
        seatsReleased: allocation.seats_reserved
      }))
    };
  });
}

export async function getTimetable(examPeriodId, user) {
  requireUuid(examPeriodId, 'examPeriodId', 'INVALID_EXAM_PERIOD_ID');
  const period = await pool.query('SELECT id, name, timezone FROM exam_periods WHERE id = $1', [examPeriodId]);

  if (period.rowCount === 0) {
    throw new AppError(404, 'EXAM_PERIOD_NOT_FOUND', 'The selected exam period was not found.');
  }

  const result = await pool.query(
    `SELECT slots.id AS slot_id,
            slots.exam_date,
            slots.session,
            slots.start_at,
            slots.end_at,
            exams.id AS exam_id,
            exams.status,
            exams.created_at,
            courses.id AS course_id,
            courses.course_code,
            courses.course_name,
            candidates.candidate_count,
            allocations.seats_reserved,
            rooms.id AS room_id,
            rooms.room_number,
            rooms.location
     FROM exams
     JOIN exam_slots slots ON slots.id = exams.exam_slot_id
     JOIN exam_periods periods ON periods.id = exams.exam_period_id
     JOIN courses ON courses.id = exams.course_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::integer AS candidate_count
       FROM exam_candidates
       WHERE exam_id = exams.id
     ) candidates ON true
     LEFT JOIN exam_room_allocations allocations ON allocations.exam_id = exams.id
     LEFT JOIN rooms ON rooms.id = allocations.room_id
     WHERE exams.exam_period_id = $1
       AND exams.status = 'SCHEDULED'
       AND slots.exam_date BETWEEN periods.start_date AND periods.end_date
       AND (
         $2 = 'SUPER_ADMIN'
         OR EXISTS (
           SELECT 1
           FROM admin_course_prefix_permissions permissions
           WHERE permissions.user_id = $3
             AND UPPER(courses.course_code) LIKE permissions.course_prefix || '%'
         )
       )
     ORDER BY slots.exam_date ASC, slots.start_at ASC, courses.course_code ASC, rooms.room_number ASC`,
    [examPeriodId, user.role, user.id]
  );
  const slots = new Map();

  for (const row of result.rows) {
    if (!slots.has(row.slot_id)) {
      slots.set(row.slot_id, {
        id: row.slot_id,
        examDate: row.exam_date,
        session: row.session,
        startAt: row.start_at,
        endAt: row.end_at,
        exams: new Map()
      });
    }

    const slot = slots.get(row.slot_id);

    if (!slot.exams.has(row.exam_id)) {
      slot.exams.set(row.exam_id, {
        id: row.exam_id,
        status: row.status,
        createdAt: row.created_at,
        candidateCount: row.candidate_count,
        course: {
          id: row.course_id,
          courseCode: row.course_code,
          courseName: row.course_name
        },
        roomAllocations: []
      });
    }

    if (row.room_id) {
      slot.exams.get(row.exam_id).roomAllocations.push({
        roomId: row.room_id,
        roomNumber: row.room_number,
        location: row.location,
        seatsReserved: row.seats_reserved
      });
    }
  }

  return {
    examPeriod: {
      id: period.rows[0].id,
      name: period.rows[0].name,
      timezone: period.rows[0].timezone
    },
    slots: [...slots.values()].map((slot) => ({
      ...slot,
      exams: [...slot.exams.values()]
    }))
  };
}

export async function getRoomAllocationSummary(examPeriodId, examSlotId, roomId, user) {
  requireUuid(examPeriodId, 'examPeriodId', 'INVALID_EXAM_PERIOD_ID');
  requireUuid(examSlotId, 'examSlotId', 'INVALID_EXAM_SLOT_ID');
  requireUuid(roomId, 'roomId', 'INVALID_ROOM_ID');

  const slotAndRoom = await pool.query(
    `SELECT slots.id AS slot_id, slots.exam_date, slots.session, slots.start_at, slots.end_at,
            rooms.id AS room_id, rooms.room_number, rooms.location, rooms.exam_capacity,
            COALESCE(usage.reserved_seats, 0)::integer AS reserved_seats
     FROM exam_slots slots
     CROSS JOIN rooms
     LEFT JOIN room_slot_usage usage ON usage.exam_slot_id = slots.id AND usage.room_id = rooms.id
     WHERE slots.id = $1
       AND slots.exam_period_id = $2
       AND rooms.id = $3`,
    [examSlotId, examPeriodId, roomId]
  );
  const selection = slotAndRoom.rows[0];

  if (!selection) {
    throw new AppError(404, 'ROOM_OR_SLOT_NOT_FOUND', 'The selected room or examination session was not found in this period.');
  }

  const allocationsResult = await pool.query(
    `SELECT exams.id AS exam_id, courses.course_code, courses.course_name,
            allocations.seats_reserved
     FROM exam_room_allocations allocations
     JOIN exams ON exams.id = allocations.exam_id
     JOIN courses ON courses.id = exams.course_id
     WHERE exams.exam_period_id = $1
       AND exams.exam_slot_id = $2
       AND exams.status = 'SCHEDULED'
       AND allocations.room_id = $3
       AND (
         $4 = 'SUPER_ADMIN'
         OR EXISTS (
           SELECT 1
           FROM admin_course_prefix_permissions permissions
           WHERE permissions.user_id = $5
             AND UPPER(courses.course_code) LIKE permissions.course_prefix || '%'
         )
       )
     ORDER BY courses.course_code ASC`,
    [examPeriodId, examSlotId, roomId, user.role, user.id]
  );
  const examIds = allocationsResult.rows.map((row) => row.exam_id);
  const candidatesByExam = new Map();
  const allocationsByExam = new Map();

  if (examIds.length > 0) {
    const [candidatesResult, allAllocationsResult] = await Promise.all([
      pool.query(
        `SELECT candidates.exam_id, students.roll_number
         FROM exam_candidates candidates
         JOIN students ON students.id = candidates.student_id
         WHERE candidates.exam_id = ANY($1::uuid[])
         ORDER BY candidates.exam_id ASC, students.roll_number ASC`,
        [examIds]
      ),
      pool.query(
        `SELECT allocations.exam_id, allocations.room_id, allocations.seats_reserved,
                rooms.room_number
         FROM exam_room_allocations allocations
         JOIN rooms ON rooms.id = allocations.room_id
         WHERE allocations.exam_id = ANY($1::uuid[])
         ORDER BY allocations.exam_id ASC, allocations.seats_reserved DESC, rooms.room_number ASC`,
        [examIds]
      )
    ]);

    for (const candidate of candidatesResult.rows) {
      const entries = candidatesByExam.get(candidate.exam_id) ?? [];
      entries.push(candidate.roll_number);
      candidatesByExam.set(candidate.exam_id, entries);
    }
    for (const allocation of allAllocationsResult.rows) {
      const entries = allocationsByExam.get(allocation.exam_id) ?? [];
      entries.push(allocation);
      allocationsByExam.set(allocation.exam_id, entries);
    }
  }

  const courseAllocations = allocationsResult.rows.map((allocation) => {
    const candidates = candidatesByExam.get(allocation.exam_id) ?? [];
    const allAllocations = allocationsByExam.get(allocation.exam_id) ?? [];
    let offset = 0;
    let roomStudents = [];

    for (const examAllocation of allAllocations) {
      const nextOffset = offset + Number(examAllocation.seats_reserved);
      if (examAllocation.room_id === roomId) {
        roomStudents = candidates.slice(offset, nextOffset);
        break;
      }
      offset = nextOffset;
    }

    return {
      examId: allocation.exam_id,
      courseCode: allocation.course_code,
      courseName: allocation.course_name,
      seatsReserved: Number(allocation.seats_reserved),
      students: roomStudents
    };
  });

  return {
    slot: {
      id: selection.slot_id,
      examDate: selection.exam_date,
      session: selection.session,
      startAt: selection.start_at,
      endAt: selection.end_at
    },
    room: {
      id: selection.room_id,
      roomNumber: selection.room_number,
      location: selection.location,
      capacity: Number(selection.exam_capacity),
      reservedSeats: Number(selection.reserved_seats),
      vacantSeats: Math.max(0, Number(selection.exam_capacity) - Number(selection.reserved_seats))
    },
    courseAllocations
  };
}
