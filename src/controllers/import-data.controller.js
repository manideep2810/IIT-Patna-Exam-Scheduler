import {
  listCourseEnrollmentSummaries,
  listDepartmentPrefixPermissions,
  listRoomsForImportData
} from '../services/import-data.service.js';

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
