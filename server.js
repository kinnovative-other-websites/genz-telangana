import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';

import { generatePassImage } from './src/image.js';
import { sendWhatsAppTemplate } from './src/smartping.js';
import { saveLead, markSent, markFailed, getAllRegistrations } from './src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
// Strip any trailing slash so image URLs don't end up with a double slash.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Telangana — 33 districts (keep in sync with public/index.html)
const TELANGANA_DISTRICTS = new Set([
  'Adilabad', 'Bhadradri Kothagudem', 'Hanumakonda', 'Hyderabad', 'Jagtial', 'Jangaon',
  'Jayashankar Bhupalpally', 'Jogulamba Gadwal', 'Kamareddy', 'Karimnagar', 'Khammam',
  'Komaram Bheem Asifabad', 'Mahabubabad', 'Mahabubnagar', 'Mancherial', 'Medak',
  'Medchal–Malkajgiri', 'Mulugu', 'Nagarkurnool', 'Nalgonda', 'Narayanpet', 'Nirmal',
  'Nizamabad', 'Peddapalli', 'Rajanna Sircilla', 'Rangareddy', 'Sangareddy', 'Siddipet',
  'Suryapet', 'Vikarabad', 'Wanaparthy', 'Warangal', 'Yadadri Bhuvanagiri',
]);

// Basic validation helpers
const isValidName = (s) => typeof s === 'string' && s.trim().length >= 2 && s.trim().length <= 60;
const isValidMobile = (s) => typeof s === 'string' && /^[6-9]\d{9}$/.test(s.trim());
const isValidDistrict = (s) => typeof s === 'string' && TELANGANA_DISTRICTS.has(s.trim());

app.post('/api/submit', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const mobile = (req.body.mobile || '').trim();
    const district = (req.body.district || '').trim();

    if (!isValidName(name)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid name.' });
    }
    if (!isValidMobile(mobile)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid 10-digit mobile number.' });
    }
    if (!isValidDistrict(district)) {
      return res.status(400).json({ ok: false, error: 'Please select a valid district.' });
    }

    // 1) Save the lead first (status 'pending') so it's never lost, even if sending fails
    const leadId = saveLead({ name, mobile, district });

    // 2) Generate the personalized image
    const fileId = crypto.randomBytes(8).toString('hex');
    const relPath = await generatePassImage({ id: fileId, name, district });
    const imageUrl = `${PUBLIC_BASE_URL}${relPath}`;

    // 3) Send via SmartPing WhatsApp template
    try {
      const result = await sendWhatsAppTemplate({ toMobile: mobile, name, imageUrl });
      markSent(leadId, imageUrl);
      console.log(`[sent] #${leadId} ${name} | ${mobile} | ${district} -> ${imageUrl}`);
      return res.json({ ok: true, imageUrl, providerResponse: result });
    } catch (sendErr) {
      markFailed(leadId, sendErr.message);
      console.error(`[send failed] #${leadId}`, sendErr);
      return res.status(502).json({ ok: false, error: 'Saved, but WhatsApp sending failed. Please try again.' });
    }
  } catch (err) {
    console.error('[submit error]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to register.' });
  }
});

// ---- Admin: download all registrations as CSV ----
// Protect with ADMIN_KEY in .env. Open:  /export.csv?key=YOUR_ADMIN_KEY
app.get('/export.csv', (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.query.key !== adminKey) {
    return res.status(401).send('Unauthorized');
  }
  const rows = getAllRegistrations();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['id', 'name', 'mobile', 'district', 'status', 'created_at'];
  const csv = [
    header.join(','),
    ...rows.map((r) => [r.id, r.name, r.mobile, r.district, r.status, r.created_at].map(esc).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
  res.send(csv);
});

// ---- Admin: JSON list of registrations (for the /admin dashboard) ----
// Key is sent in the 'x-admin-key' header so it stays out of server access logs.
app.get('/api/registrations', (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  const provided = req.get('x-admin-key') || req.query.key;
  if (!adminKey || provided !== adminKey) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return res.json({ ok: true, rows: getAllRegistrations() });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Public base URL: ${PUBLIC_BASE_URL}`);
});
