// One-time helper: creates (or updates the password of) a Firebase Authentication user
// so they can sign in as a raffle organizer.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT="$(cat /path/to/service-account.json)" \
//     node scripts/create-organizer-account.mjs angie@example.com "TempPassw0rd!"
import {initializeApp,cert} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';

const [,,email,password]=process.argv;
if(!email||!password){
  console.error('Usage: node scripts/create-organizer-account.mjs <email> <password>');
  process.exit(1);
}

const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
if(!raw){
  console.error('Set FIREBASE_SERVICE_ACCOUNT to the service account JSON (raw or base64).');
  process.exit(1);
}
const json=raw.trim().startsWith('{')?raw:Buffer.from(raw,'base64').toString('utf8');
initializeApp({credential:cert(JSON.parse(json))});

const auth=getAuth();
try{
  const existing=await auth.getUserByEmail(email);
  await auth.updateUser(existing.uid,{password});
  console.log(`Updated password for existing user ${email} (uid ${existing.uid}).`);
}catch(err){
  if(err.code!=='auth/user-not-found')throw err;
  const user=await auth.createUser({email,password,emailVerified:true});
  console.log(`Created user ${email} (uid ${user.uid}).`);
}
console.log('Done. Set ORGANIZER_EMAIL_1 or ORGANIZER_EMAIL_2 in Netlify to this email to grant organizer access.');
