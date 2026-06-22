// Deletes ALL registrations. Safety: requires the --yes flag to actually run.
//   View count only:  npm run reset
//   Actually delete:  npm run reset -- --yes
import db from './db.js';

const confirmed = process.argv.includes('--yes');
const { c } = db.prepare('SELECT count(*) AS c FROM registrations').get();

if (c === 0) {
  console.log('No registrations to delete — table is already empty.');
  process.exit(0);
}

if (!confirmed) {
  console.log(`This will permanently delete ALL ${c} registrations.`);
  console.log('Re-run with --yes to confirm:  npm run reset -- --yes');
  process.exit(0);
}

db.exec("DELETE FROM registrations; DELETE FROM sqlite_sequence WHERE name='registrations';");
console.log(`Deleted ${c} registrations. Table is now empty (IDs restart from 1).`);
process.exit(0);
