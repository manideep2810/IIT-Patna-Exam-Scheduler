import { Router } from 'express';

import {
  deleteExamController,
  exportMyTimetableController,
  getRoomAllocationSummaryController,
  getTimetableController,
  listRoomAvailabilityController,
  listSchedulableCoursesController,
  scheduleExamController
} from '../controllers/schedule.controller.js';
import { listExamPeriodsController } from '../controllers/exam-period.controller.js';
import { authenticate, requirePasswordChanged } from '../middleware/auth.js';
import { listSlotsController } from '../controllers/slot.controller.js';

const scheduleRouter = Router();

scheduleRouter.use(authenticate, requirePasswordChanged);
scheduleRouter.get('/', listExamPeriodsController);
scheduleRouter.get('/:examPeriodId/slots', listSlotsController);
scheduleRouter.get('/:examPeriodId/schedulable-courses', listSchedulableCoursesController);
scheduleRouter.get('/:examPeriodId/rooms', listRoomAvailabilityController);
scheduleRouter.get('/:examPeriodId/room-allocations', getRoomAllocationSummaryController);
scheduleRouter.post('/:examPeriodId/exams', scheduleExamController);
scheduleRouter.delete('/:examPeriodId/exams/:examId', deleteExamController);
scheduleRouter.get('/:examPeriodId/timetable', getTimetableController);
scheduleRouter.get('/:examPeriodId/exports/my-timetable', exportMyTimetableController);

export default scheduleRouter;
