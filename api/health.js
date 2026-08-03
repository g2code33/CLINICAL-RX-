module.exports = function handler(req, res) {
  return res.status(200).json({
    ok: true,
    name: 'clinical-rx-api',
    timestamp: Date.now()
  });
};
