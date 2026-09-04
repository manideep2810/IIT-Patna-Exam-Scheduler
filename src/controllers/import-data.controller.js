import {
  deleteAllCourseEnrollmentImportData,
  deleteAllRoomsImportData,
  deleteCourseEnrollmentImportData,
  deleteRoomImportData,
  listCourseEnrollmentSummaries,
  listDepartmentPrefixPermissions,
  listRoomsForImportData
} from '../services/import-data.service.js';

export async function deleteRoomImportDataController(request, response) {
  const result = await deleteRoomImportData(request.params.roomId);
  response.status(200).json({ message: `Room ${result.roomNumber} was deleted.`, ...result });
}

export async function deleteAllRoomsImportDataController(_request, response) {
  const result = await deleteAllRoomsImportData();
  response.status(200).json({ message: `${result.deletedCount} room${result.deletedCount === 1 ? '' : 's'} deleted.`, ...result });
}

export async function deleteCourseEnrollmentImportDataController(request, response) {
  const result = await deleteCourseEnrollmentImportData(request.params.examPeriodId, request.params.courseId);
  response.status(200).json({ message: 'Course enrolments were deleted.', ...result });
}

export async function deleteAllCourseEnrollmentImportDataController(request, response) {
  const result = await deleteAllCourseEnrollmentImportData(request.params.examPeriodId);
  response.status(200).json({ message: `${result.deletedCount} enrolment record${result.deletedCount === 1 ? '' : 's'} deleted.`, ...result });
}

export async function listRoomsForImportDataController(request, response) {
  const result = await listRoomsForImportData(request.query);
  response.status(200).json(result);
}

export async function listDepartmentPrefixPermissionsController(request, response) {
  const result = await listDepartmentPrefixPermissions(request.query);
  response.status(200).json(result);
}

export async function listCourseEnrollmentSummariesController(request, response) {
  const result = await listCourseEnrollmentSummaries(request.params.examPeriodId, request.query);
  response.status(200).json(result);
}
