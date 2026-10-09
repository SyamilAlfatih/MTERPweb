const fs = require('fs');
const path = require('path');

const sendFilePath = path.resolve(__dirname, '../../../../Scraps/apps/api/src/routes/send.ts');
if (!fs.existsSync(sendFilePath)) {
  console.error('File not found:', sendFilePath);
  process.exit(1);
}

let content = fs.readFileSync(sendFilePath, 'utf8');

// Check if already patched
if (content.includes("router.post('/department'")) {
  console.log('✅ send.ts is already patched with /department route.');
  process.exit(0);
}

const departmentRouteCode = `/**
 * POST /api/send/department
 * Dispatches a message to all active contacts in the specified department(s),
 * and optionally to an associated WhatsApp Group.
 */
router.post('/department', authenticateRequest, async (req: Request, res: Response) => {
  const { department, departments, message, groupId, priority, metadata } = req.body as {
    department?: string;
    departments?: string[];
    message?: string;
    groupId?: string;
    priority?: string;
    metadata?: Record<string, unknown>;
  };

  const deptList: string[] = [];
  if (typeof department === 'string' && department.trim()) {
    deptList.push(department.trim());
  }
  if (Array.isArray(departments)) {
    departments.forEach((d) => {
      if (typeof d === 'string' && d.trim() && !deptList.includes(d.trim())) {
        deptList.push(d.trim());
      }
    });
  }

  if (deptList.length === 0 || !message || !message.trim()) {
    res.status(400).json({
      ok: false,
      error: 'Target department(s) and message content are required',
    });
    return;
  }

  if (!isWaReady()) {
    res.status(503).json({
      ok: false,
      error: 'WhatsApp client is not ready. Please pair device via QR / pairing code first.',
    });
    return;
  }

  try {
    // Match department case-insensitively via regex
    const deptRegexes = deptList.map((d) => new RegExp(d.trim(), 'i'));
    const contacts = await Contact.find({
      department: { $in: deptRegexes },
      isActive: true,
    });

    const targetChatIds = new Set<string>();
    const contactMap = new Map<string, string>(); // cleanPhone -> contactId

    contacts.forEach((c) => {
      const cleanPhone = c.phone.replace(/\\D/g, '');
      if (cleanPhone) {
        targetChatIds.add(cleanPhone);
        contactMap.set(cleanPhone, String(c._id));
      }
    });

    // If groupId is provided, add it as a recipient
    let groupChatId: string | null = null;
    if (typeof groupId === 'string' && groupId.trim()) {
      groupChatId = formatChatId(groupId.trim(), true);
    }

    // Fallback: If no contacts matched the departments and no group was given,
    // fallback to WHATSAPP_PHONE (Master Gateway Phone) if configured
    if (targetChatIds.size === 0 && !groupChatId && process.env.WHATSAPP_PHONE) {
      const masterPhone = process.env.WHATSAPP_PHONE.trim().replace(/\\D/g, '');
      if (masterPhone) {
        targetChatIds.add(masterPhone);
      }
    }

    if (targetChatIds.size === 0 && !groupChatId) {
      res.status(404).json({
        ok: false,
        error: \`No active contacts found for department(s): \${deptList.join(', ')}\`,
      });
      return;
    }

    const jobResults: Array<{ target: string; jobId?: string; logId?: string; queued?: boolean }> = [];

    // Dispatch to contacts
    for (const phone of targetChatIds) {
      try {
        const contactId = contactMap.get(phone);
        const result = await dispatchMessage({
          phone,
          message: message.trim(),
          isGroup: false,
          contactId,
        });
        jobResults.push({ target: phone, jobId: result.jobId, logId: result.logId, queued: result.queued });
      } catch (err) {
        console.error(\`❌ [Dept Dispatch] Failed to queue for phone \${phone}:\`, (err as Error).message);
      }
    }

    // Dispatch to group if present
    if (groupChatId) {
      try {
        const result = await dispatchMessage({
          phone: groupChatId,
          message: message.trim(),
          isGroup: true,
        });
        jobResults.push({ target: groupChatId, jobId: result.jobId, logId: result.logId, queued: result.queued });
      } catch (err) {
        console.error(\`❌ [Dept Dispatch] Failed to queue for group \${groupChatId}:\`, (err as Error).message);
      }
    }

    res.status(202).json({
      ok: true,
      departments: deptList,
      recipientsCount: jobResults.length,
      groupDispatched: !!groupChatId,
      queued: true,
      dispatches: jobResults,
    });
  } catch (err) {
    const errorMsg = (err as Error).message;
    console.error('❌ Department dispatch error:', errorMsg);
    res.status(500).json({ ok: false, error: errorMsg });
  }
});

`;

// Insert before `router.post('/', authenticateRequest`
const targetAnchor = "router.post('/', authenticateRequest";
if (!content.includes(targetAnchor)) {
  console.error('Target anchor not found in send.ts');
  process.exit(1);
}

content = content.replace(targetAnchor, departmentRouteCode + targetAnchor);

// Also update stats route to allow authenticateRequest instead of requireJwt only
content = content.replace(
  "router.get('/stats', requireJwt,",
  "router.get('/stats', authenticateRequest,"
);

fs.writeFileSync(sendFilePath, content, 'utf8');
console.log('✅ Successfully added /department route and updated /stats in Scraps send.ts');
