// Quick CLI viewer:  npm run leads
import { getAllRegistrations } from './db.js';

const rows = getAllRegistrations();
if (rows.length === 0) {
  console.log('No registrations yet.');
} else {
  console.table(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      mobile: r.mobile,
      district: r.district,
      status: r.status,
      registered: r.created_at,
    }))
  );
  console.log(`\nTotal: ${rows.length}`);
}
process.exit(0);
