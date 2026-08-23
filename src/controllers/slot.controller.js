import { createSlots, listSlots } from '../services/slot.service.js';

export async function createSlotsController(request, response) {
  const slots = await createSlots(request.params.examPeriodId, request.body?.examDates);
  response.status(201).json({ slots });
}

export async function listSlotsController(request, response) {
  const slots = await listSlots(request.params.examPeriodId);
  response.status(200).json({ slots });
}
