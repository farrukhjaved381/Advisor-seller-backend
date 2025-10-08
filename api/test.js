module.exports = async (req, res) => {
  res.json({
    message: 'Vercel serverless function is working!',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    headers: req.headers
  });
};