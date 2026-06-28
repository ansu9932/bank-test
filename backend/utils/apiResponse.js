/**
 * Standard API response helpers
 */

const success = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
};

const created = (res, data = {}, message = 'Created successfully') => {
  return success(res, data, message, 201);
};

const error = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString(),
  };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

const unauthorized = (res, message = 'Unauthorized access') => {
  return error(res, message, 401);
};

const forbidden = (res, message = 'Access forbidden') => {
  return error(res, message, 403);
};

const notFound = (res, message = 'Resource not found') => {
  return error(res, message, 404);
};

const badRequest = (res, message = 'Bad request', errors = null) => {
  return error(res, message, 400, errors);
};

const tooManyRequests = (res, message = 'Too many requests') => {
  return error(res, message, 429);
};

/**
 * Distinct link-validation failure response. Carries an explicit `errorType`
 * (e.g. 'EXPIRED_LINK' | 'INVALID_LINK') so the frontend can branch on the
 * exact failure and render the self-service recovery form.
 */
const linkError = (res, errorType = 'INVALID_LINK', message = 'This link is no longer valid', statusCode = 400) => {
  return res.status(statusCode).json({
    success: false,
    errorType,
    message,
    timestamp: new Date().toISOString(),
  });
};

module.exports = { success, created, error, unauthorized, forbidden, notFound, badRequest, tooManyRequests, linkError };
