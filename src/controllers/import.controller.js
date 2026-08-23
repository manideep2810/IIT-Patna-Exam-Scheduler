import {
  importAdminCoursePrefixes,
  importCourseEnrollments,
  importRooms
} from '../services/import.service.js';

export async function importAdminCoursePrefixesController(request, response) {
  const summary = await importAdminCoursePrefixes(request.file, request.user.id);
  response.status(200).json({ message: 'Department Admin course prefixes imported successfully.', summary });
}

export async function importRoomsController(request, response) {
  const summary = await importRooms(request.file);
  response.status(200).json({ message: 'Rooms imported successfully.', summary });
}

export async function importCourseEnrollmentsController(request, response) {
  const summary = await importCourseEnrollments(request.file, request.params.examPeriodId);
  const message = summary.coursesSkipped > 0
    ? 'Course enrollments imported with scheduled courses skipped.'
    : 'Course enrollments imported successfully.';
  response.status(200).json({ message, summary });
}
