import { Router } from 'express';

import {
  createDepartmentAdminController,
  exportConsolidatedTimetableController,
  exportDepartmentAdminTimetableController,
  listDepartmentAdminsController,
  setDepartmentAdminPasswordController,
  setDepartmentAdminStatusController
} from '../controllers/admin.controller.js';
import {
  createExamPeriodController,
  listExamPeriodsController
} from '../controllers/exam-period.controller.js';
import {
  importAdminCoursePrefixesController,
  importCourseEnrollmentsController,
  importRoomsController
} from '../controllers/import.controller.js';
import { authenticate, requirePasswordChanged, requireRole } from '../middleware/auth.js';
import { uploadSingleSpreadsheet } from '../middleware/upload.js';
import { createSlotsController, listSlotsController } from '../controllers/slot.controller.js';
import {
  deleteAllCourseEnrollmentImportDataController,
  deleteAllRoomsImportDataController,
  deleteCourseEnrollmentImportDataController,
  deleteRoomImportDataController,
  listCourseEnrollmentSummariesController,
  listDepartmentPrefixPermissionsController,
  listRoomsForImportDataController
} from '../controllers/import-data.controller.js';

const adminRouter = Router();

adminRouter.use(authenticate, requirePasswordChanged, requireRole('SUPER_ADMIN'));
adminRouter.post('/department-admins', createDepartmentAdminController);
adminRouter.get('/department-admins', listDepartmentAdminsController);
adminRouter.patch('/department-admins/:userId/password', setDepartmentAdminPasswordController);
adminRouter.patch('/department-admins/:userId/status', setDepartmentAdminStatusController);
adminRouter.post('/exam-periods', createExamPeriodController);
adminRouter.get('/exam-periods', listExamPeriodsController);
adminRouter.post('/exam-periods/:examPeriodId/slots', createSlotsController);
adminRouter.get('/exam-periods/:examPeriodId/slots', listSlotsController);
adminRouter.get('/exam-periods/:examPeriodId/course-enrollments', listCourseEnrollmentSummariesController);
adminRouter.delete('/exam-periods/:examPeriodId/course-enrollments', deleteAllCourseEnrollmentImportDataController);
adminRouter.delete('/exam-periods/:examPeriodId/course-enrollments/:courseId', deleteCourseEnrollmentImportDataController);
adminRouter.get('/rooms', listRoomsForImportDataController);
adminRouter.delete('/rooms', deleteAllRoomsImportDataController);
adminRouter.delete('/rooms/:roomId', deleteRoomImportDataController);
adminRouter.get('/course-prefix-permissions', listDepartmentPrefixPermissionsController);
adminRouter.get('/exam-periods/:examPeriodId/exports/consolidated', exportConsolidatedTimetableController);
adminRouter.get(
  '/exam-periods/:examPeriodId/exports/department-admins/:departmentAdminId',
  exportDepartmentAdminTimetableController
);
adminRouter.post('/imports/admin-course-permissions', uploadSingleSpreadsheet, importAdminCoursePrefixesController);
adminRouter.post('/imports/rooms', uploadSingleSpreadsheet, importRoomsController);
adminRouter.post(
  '/exam-periods/:examPeriodId/imports/course-enrollments',
  uploadSingleSpreadsheet,
  importCourseEnrollmentsController
);

export default adminRouter;
