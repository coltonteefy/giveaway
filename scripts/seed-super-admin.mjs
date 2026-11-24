// One-time bootstrap: makes an email the primary ("super") organizer who can manage all
// raffles and add/remove other organizers. Run this once to set yourself up, then use the
// "Manage organizers" panel in the dashboard to add everyone else.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT="$(cat /path/to/service-account.json)" \
//     node scripts/seed-super-admin.mjs you@example.com
import {initializeApp,cert} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const [,,emailArg]=process.argv;
if(!emailArg){
  console.error('Usage: node scripts/seed-super-admin.mjs <email>');
  process.exit(1);
}
const email=emailArg.trim().toLowerCase();

const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
if(!raw){
  console.error('Set FIREBASE_SERVICE_ACCOUNT to the service account JSON (raw or base64).');
  process.exit(1);
}
const json=raw.trim().startsWith('{')?raw:Buffer.from(raw,'base64').toString('utf8');
initializeApp({credential:cert(JSON.parse(json))});

const d=getFirestore();
await d.collection('givingboard_admins').doc(email).set({role:'super',createdAt:new Date().toISOString(),createdBy:'seed-script'},{merge:true});
console.log(`${email} is now the primary organizer for all raffles.`);
