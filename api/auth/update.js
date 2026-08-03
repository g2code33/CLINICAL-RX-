const { redis } = require('../_lib/redis.js');
const { verifyToken, hashPassword } = require('../_lib/auth.js');
const { guard, fail, ok } = require('../_lib/errors.js');

module.exports = guard(async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'No token provided');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const userId = verifyToken(token);
  if (!userId) return fail(res, 401, 'Invalid token');

  const { name, securityQuestion, securityAnswer } = req.body || {};
  const users = await redis.hgetall('users');
  if (!users) return fail(res, 404, 'User not found.');

  let userEmail = null, userData = null;
  for (const [email, data] of Object.entries(users)) {
    const user = JSON.parse(data);
    if (user.id === userId) { userEmail = email; userData = user; break; }
  }
  if (!userEmail || !userData) return fail(res, 404, 'User not found.');

  if (name !== undefined) userData.name = String(name).trim();
  if (securityQuestion !== undefined) {
    if (securityQuestion.trim()) {
      userData.securityQuestion = securityQuestion.trim();
      if (securityAnswer && securityAnswer.trim()) {
        userData.securityAnswer = hashPassword(securityAnswer.trim());
      }
    } else {
      delete userData.securityQuestion;
      delete userData.securityAnswer;
    }
  }

  await redis.hset('users', { [userEmail]: JSON.stringify(userData) });
  return ok(res, 200, { user: { id: userData.id, name: userData.name, email: userEmail } });
});
