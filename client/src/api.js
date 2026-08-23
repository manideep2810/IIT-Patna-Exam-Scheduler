const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request(path, { token, body, method = 'GET', formData = false, download = false } = {}) {
  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body && !formData) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? (formData ? body : JSON.stringify(body)) : undefined
  });

  if (!response.ok) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const error = new Error(payload?.error?.message ?? 'The request could not be completed.');
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    throw error;
  }

  if (download) {
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') ?? '';
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'timetable.csv';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: (token) => request('/auth/me', { token }),
  changePassword: (token, currentPassword, newPassword) => request('/auth/change-password', { token, method: 'POST', body: { currentPassword, newPassword } }),
  logout: (token) => request('/auth/logout', { token, method: 'POST' }),
  examPeriods: (token) => request('/exam-periods', { token }),
  createExamPeriod: (token, body) => request('/admin/exam-periods', { token, method: 'POST', body }),
  slots: (token, periodId) => request(`/exam-periods/${periodId}/slots`, { token }),
  adminSlots: (token, periodId) => request(`/admin/exam-periods/${periodId}/slots`, { token }),
  createSlots: (token, periodId, examDates) => request(`/admin/exam-periods/${periodId}/slots`, { token, method: 'POST', body: { examDates } }),
  timetable: (token, periodId) => request(`/exam-periods/${periodId}/timetable`, { token }),
  schedulableCourses: (token, periodId) => request(`/exam-periods/${periodId}/schedulable-courses`, { token }),
  rooms: (token, periodId, slotId) => request(`/exam-periods/${periodId}/rooms?examSlotId=${encodeURIComponent(slotId)}`, { token }),
  schedule: (token, periodId, body) => request(`/exam-periods/${periodId}/exams`, { token, method: 'POST', body }),
  deleteExam: (token, periodId, examId) => request(`/exam-periods/${periodId}/exams/${examId}`, { token, method: 'DELETE' }),
  departmentAdmins: (token) => request('/admin/department-admins', { token }),
  createDepartmentAdmin: (token, body) => request('/admin/department-admins', { token, method: 'POST', body }),
  setDepartmentAdminStatus: (token, userId, isActive) => request(`/admin/department-admins/${userId}/status`, { token, method: 'PATCH', body: { isActive } }),
  setDepartmentAdminPassword: (token, userId, password) => request(`/admin/department-admins/${userId}/password`, { token, method: 'PATCH', body: { password } }),
  importRoomsData: (token, query) => request(`/admin/rooms?${new URLSearchParams(query)}`, { token }),
  importPermissionsData: (token, query) => request(`/admin/course-prefix-permissions?${new URLSearchParams(query)}`, { token }),
  importEnrollmentData: (token, periodId, query) => request(`/admin/exam-periods/${periodId}/course-enrollments?${new URLSearchParams(query)}`, { token }),
  upload: (token, path, file) => {
    const form = new FormData();
    form.append('file', file);
    return request(path, { token, method: 'POST', body: form, formData: true });
  },
  exportConsolidated: (token, periodId) => request(`/admin/exam-periods/${periodId}/exports/consolidated`, { token, download: true }),
  exportMyTimetable: (token, periodId) => request(`/exam-periods/${periodId}/exports/my-timetable`, { token, download: true }),
  exportDepartmentAdmin: (token, periodId, userId) => request(`/admin/exam-periods/${periodId}/exports/department-admins/${userId}`, { token, download: true })
};
