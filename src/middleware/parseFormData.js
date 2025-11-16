/**
 * Middleware to parse FormData fields that are sent as JSON strings
 * This is needed because multer doesn't automatically parse JSON strings in FormData
 */
const parseFormData = (req, res, next) => {
  // Parse tags if it's a JSON string (from FormData)
  if (req.body.tags && typeof req.body.tags === 'string') {
    try {
      req.body.tags = JSON.parse(req.body.tags);
    } catch (e) {
      // If parsing fails, treat as comma-separated string
      req.body.tags = req.body.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);
    }
  }

  // Ensure tags is an array (default to empty array if undefined)
  if (req.body.tags && !Array.isArray(req.body.tags)) {
    req.body.tags = [];
  }

  next();
};

module.exports = parseFormData;

