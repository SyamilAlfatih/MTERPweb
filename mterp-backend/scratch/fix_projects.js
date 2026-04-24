const fs = require('fs');
const path = 'c:\\Users\\megat\\Personal Space Syamil\\MTERPweb\\mterp-backend\\src\\routes\\projects.js';
let content = fs.readFileSync(path, 'utf8');

const targetPart = /\}\);\s*\.lean\(\);\s*res\.json\(logs\);\s*\} catch \(error\) \{\s*console\.error\('Get material logs error:', error\);\s*res\.status\(500\)\.json\(\{ msg: 'Server error' \}\);\s*\}\s*\}\);/;
// Wait, the regex might be tricky. Let's just use string replacement if possible.
// Or just find the lines.

const lines = content.split(/\r?\n/);
const startLine = 323; // 1-indexed
const endLine = 330;

const newRoute = `// GET /api/projects/:id/material-logs - Get material usage logs for a project
router.get('/:id/material-logs', auth, async (req, res) => {
  try {
    const { date } = req.query;
    let query = { projectId: req.params.id };
    
    if (date) {
      const { start, end } = wibDayRange(date);
      query.createdAt = { $gte: start, $lte: end };
    }

    const logs = await MaterialLog.find(query)
      .populate('supplyId', 'item unit')
      .populate('recordedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean();

    res.json(logs);
  } catch (error) {
    console.error('Get material logs error:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});`;

// Since I already removed .lean(); in one step, I should check the current content.
// Actually, I'll just look for "res.json(logs);" and replace the surrounding block.

const index = lines.findIndex(l => l.includes('res.json(logs);') && l.includes('325'));
// Actually splitting by index is better.

lines.splice(322, 330 - 322 + 1, newRoute); // lines are 0-indexed, so 323 is index 322.

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Fixed projects.js');
