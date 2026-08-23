import {
  createDepartmentAdmin,
  listDepartmentAdmins,
  setDepartmentAdminPassword,
  setDepartmentAdminStatus
} from '../services/department-admin.service.js';
import { exportDepartmentAdminTimetableCsv, exportTimetableCsv } from '../services/timetable-export.service.js';

export async function createDepartmentAdminController(request, response) {
  const user = await createDepartmentAdmin(request.body ?? {});
  response.status(201).json({ user });
}

export async function listDepartmentAdminsController(_request, response) {
  const users = await listDepartmentAdmins();
  response.status(200).json({ users });
}

export async function setDepartmentAdminPasswordController(request, response) {
  const user = await setDepartmentAdminPassword(request.params.userId, request.body?.password);
  response.status(200).json({ user });
}

export async function setDepartmentAdminStatusController(request, response) {
  const user = await setDepartmentAdminStatus(request.params.userId, request.body?.isActive);
  response.status(200).json({ user });
}

export async function exportConsolidatedTimetableController(request, response) {
  const exportFile = await exportTimetableCsv(request.params.examPeriodId, request.user);
  response.status(200).type('text/csv').attachment(exportFile.filename).send(exportFile.csv);
}

export async function exportDepartmentAdminTimetableController(request, response) {
  const exportFile = await exportDepartmentAdminTimetableCsv(
    request.params.examPeriodId,
    request.params.departmentAdminId
  );
  response.status(200).type('text/csv').attachment(exportFile.filename).send(exportFile.csv);
}
