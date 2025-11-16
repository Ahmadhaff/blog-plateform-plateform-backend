class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

const createError = (message, statusCode) => new AppError(message, statusCode);

module.exports = {
  AppError,
  createError
};
