import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { AppError } from './error-handler.js';
import { findUserById, toSafeUser } from '../services/user.service.js';

export async function authenticate(request, _response, next) {
  try {
    const authorization = request.get('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'A Bearer access token is required.');
    }

    const token = authorization.slice('Bearer '.length).trim();
    const payload = jwt.verify(token, env.jwtSecret);

    if (typeof payload !== 'object' || typeof payload.sub !== 'string') {
      throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired.');
    }

    const user = await findUserById(payload.sub);

    if (!user || !user.is_active) {
      throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired.');
    }

    request.user = toSafeUser(user);
    return next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    return next(new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired.'));
  }
}

export function requireRole(...roles) {
  return (request, _response, next) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    }

    return next();
  };
}

export function requirePasswordChanged(request, _response, next) {
  if (request.user?.mustChangePassword) {
    return next(
      new AppError(
        403,
        'PASSWORD_CHANGE_REQUIRED',
        'Change your temporary password before continuing.'
      )
    );
  }

  return next();
}
