import { pool } from '../db/pool.js';
import { AppError } from './error-handler.js';

export function requireCoursePermission(resolveCourseId = (request) => request.params.courseId ?? request.body?.courseId) {
  return async (request, _response, next) => {
    try {
      const courseId = resolveCourseId(request);

      if (!courseId) {
        throw new AppError(400, 'COURSE_ID_REQUIRED', 'A course ID is required.');
      }

      if (request.user?.role === 'SUPER_ADMIN') {
        return next();
      }

      if (request.user?.role !== 'DEPARTMENT_ADMIN') {
        throw new AppError(403, 'FORBIDDEN', 'You do not have permission to manage this course.');
      }

      const permission = await pool.query(
        `SELECT 1
         FROM admin_course_prefix_permissions permissions
         JOIN courses ON courses.id = $2
         WHERE permissions.user_id = $1
           AND UPPER(courses.course_code) LIKE permissions.course_prefix || '%'`,
        [request.user.id, courseId]
      );

      if (permission.rowCount === 0) {
        throw new AppError(403, 'COURSE_ACCESS_DENIED', 'You do not have permission to manage this course.');
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
