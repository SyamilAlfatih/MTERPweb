const bcrypt = require('bcryptjs');
const { ApiKey } = require('../models');

const apiKeyAuth = async (req, res, next) => {
  try {
    const rawKey = req.header('X-API-Key') || req.header('x-api-key');

    if (!rawKey) {
      return res.status(401).json({ msg: 'No API key provided, authorization denied' });
    }

    // Extract prefix for efficient query (first 14 chars, e.g. "mterp_xxxxxxxx")
    const keyPrefix = rawKey.slice(0, 14);

    // Look for active keys with this prefix
    const potentialKeys = await ApiKey.find({ keyPrefix, isActive: true });

    if (!potentialKeys || potentialKeys.length === 0) {
      return res.status(401).json({ msg: 'Invalid or inactive API key' });
    }

    // Compare with bcrypt
    let matchedKey = null;
    for (const keyDoc of potentialKeys) {
      const isMatch = await bcrypt.compare(rawKey, keyDoc.keyHash);
      if (isMatch) {
        matchedKey = keyDoc;
        break;
      }
    }

    if (!matchedKey) {
      return res.status(401).json({ msg: 'Invalid or inactive API key' });
    }

    // Update lastUsedAt asynchronously
    ApiKey.updateOne({ _id: matchedKey._id }, { $set: { lastUsedAt: new Date() } }).exec().catch(err => {
      console.error('Failed to update API key lastUsedAt:', err);
    });

    req.apiKey = matchedKey;
    next();
  } catch (error) {
    console.error('API key auth error:', error);
    res.status(500).json({ msg: 'Server error during API key authentication' });
  }
};

module.exports = apiKeyAuth;
