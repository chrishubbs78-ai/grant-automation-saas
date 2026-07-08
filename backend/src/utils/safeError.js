// Returns error detail in dev and a generic message in production,
// so raw Sequelize/DB errors never reach API consumers in prod.
function safeError(err) {
  return process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
}

module.exports = { safeError };
