// CLI equivalent of the "Manage organizers" panel's add action — grants an email organizer
// access to one raffle (creating their Firebase Auth login if it doesn't exist yet).
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT="$(cat /path/to/service-account.json)" \
//     node scripts/add-organizer.mjs angie@example.com 2
import {initializeApp,cert} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {randomUUID} from 'node:crypto';

const [,,emailArg,raffleIdArg]=process.argv;
if(!emailArg||!raffleIdArg){
  console.error('Usage: node scripts/add-organizer.mjs <email> <raffleId>');
  process.exit(1);
}
const email=emailArg.trim().toLowerCase(),raffleId=String(raffleIdArg).trim();

const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
if(!raw){
  console.error('Set FIREBASE_SERVICE_ACCOUNT to the service account JSON (raw or base64).');
  process.exit(1);
}
const json=raw.trim().startsWith('{')?raw:Buffer.from(raw,'base64').toString('utf8');
initializeApp({credential:cert(JSON.parse(json))});

const d=getFirestore();
const raffleSnap=await d.collection('givingboard_raffles').doc(raffleId).get();
if(!raffleSnap.exists){console.error(`No raffle with id "${raffleId}".`);process.exit(1)}

const ref=d.collection('givingboard_admins').doc(email),existing=await ref.get();
if(existing.exists&&existing.data().role==='super'){console.error('That account already has full access.');process.exit(1)}
await ref.set({role:'organizer',raffleIds:FieldValue.arrayUnion(raffleId),createdAt:new Date().toISOString(),createdBy:'cli'},{merge:true});

let tempPassword=null;
try{await getAuth().getUserByEmail(email)}
catch{tempPassword=randomUUID().replace(/-/g,'').slice(0,12);await getAuth().createUser({email,password:tempPassword,emailVerified:true})}

console.log(`${email} can now sign in as organizer for raffle ${raffleId} (${raffleSnap.data().title}).`);
if(tempPassword)console.log(`Temporary password: ${tempPassword}`);
