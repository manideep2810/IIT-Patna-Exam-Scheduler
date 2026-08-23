import {
  deleteExam,
  getTimetable,
  listRoomAvailability,
  listSchedulableCourses,
  scheduleExam
} from '../services/schedule.service.js';
import { exportTimetableCsv } from '../services/timetable-export.service.js';

export async function listSchedulableCoursesController(request, response) {
  const courses = await listSchedulableCourses(request.params.examPeriodId, request.user);
  response.status(200).json({ courses });
}

export async function listRoomAvailabilityController(request, response) {
  const rooms = await listRoomAvailability(request.params.examPeriodId, request.query.examSlotId);
  response.status(200).json({ rooms });
}

export async function scheduleExamController(request, response) {
  const exam = await scheduleExam(request.params.examPeriodId, request.body, request.user);
  response.status(201).json({ exam });
}

export async function deleteExamController(request, response) {
  const exam = await deleteExam(request.params.examPeriodId, request.params.examId, request.user);
  response.status(200).json({ message: 'Exam deleted. Its room seats are available for scheduling again.', exam });
}

export async function getTimetableController(request, response) {
  const timetable = await getTimetable(request.params.examPeriodId, request.user);
  response.status(200).json(timetable);
}

export async function exportMyTimetableController(request, response) {
  const exportFile = await exportTimetableCsv(request.params.examPeriodId, request.user);
  response
    .status(200)
    .type('text/csv')
    .attachment(exportFile.filename)
    .send(exportFile.csv);
}
