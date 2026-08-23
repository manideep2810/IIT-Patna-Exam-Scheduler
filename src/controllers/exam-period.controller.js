import { createExamPeriod, listExamPeriods } from '../services/exam-period.service.js';

export async function createExamPeriodController(request, response) {
  const examPeriod = await createExamPeriod(request.body ?? {}, request.user.id);
  response.status(201).json({ examPeriod });
}

export async function listExamPeriodsController(_request, response) {
  const examPeriods = await listExamPeriods();
  response.status(200).json({ examPeriods });
}
