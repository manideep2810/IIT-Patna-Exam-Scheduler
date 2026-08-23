export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(request, _response, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${request.method} ${request.path} was not found.`));
}

export function errorHandler(error, _request, response, _next) {
  if (error instanceof AppError) {
    return response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      }
    });
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must contain valid JSON.'
      }
    });
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    return response.status(400).json({
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'The uploaded file exceeds the configured maximum upload size.'
      }
    });
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return response.status(400).json({
      error: {
        code: 'INVALID_UPLOAD_FIELD',
        message: 'Attach one spreadsheet using the multipart field name file.'
      }
    });
  }

  if (error.code === '23505') {
    return response.status(409).json({
      error: {
        code: 'DUPLICATE_VALUE',
        message: 'A record with this value already exists.'
      }
    });
  }

  if (error.code === '23503') {
    return response.status(400).json({
      error: {
        code: 'INVALID_REFERENCE',
        message: 'One of the supplied related records does not exist.'
      }
    });
  }

  console.error(error);
  return response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.'
    }
  });
}
