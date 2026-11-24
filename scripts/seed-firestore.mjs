import {initializeApp,cert} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
if(!raw){console.error('Set FIREBASE_SERVICE_ACCOUNT (raw JSON or base64) before running this script.');process.exit(1)}
let json;try{json=JSON.parse(raw)}catch{json=JSON.parse(Buffer.from(raw,'base64').toString('utf8'))}
initializeApp({credential:cert(json)});
const db=getFirestore();

const raffles={
  '1':{slug:'sample',title:'The Giving Board',spots_total:30,price:10,max_per_person:3,charities:'Two selected charities',prize:'A surprise prize',payment_instructions:'Send payment to the organizer using the handle she shared with you.',drawing_date:'',venmo_url:'https://venmo.com/u/Bagglady_X',paypal_url:'https://www.paypal.com/qrcodes/p2pqrc/THG6R3RFLW2CE',organizer_email:'',closed:0,winner:null,pending_winner:null,draw_started_at:null,draw_reveal_at:null,board:{},version:0},
  '2':{slug:'angie',title:'Angie\u2019s Raffle',spots_total:30,price:10,max_per_person:3,charities:'Charities to be announced',prize:'Prize to be announced',payment_instructions:'Pay Angie with Venmo or PayPal, then enter the username or payer email you used. Angie checks payments manually.',drawing_date:'',venmo_url:'https://venmo.com/u/Bagglady_X',paypal_url:'https://www.paypal.com/qrcodes/p2pqrc/THG6R3RFLW2CE',organizer_email:'angbaggs@gmail.com',closed:1,winner:null,pending_winner:null,draw_started_at:null,draw_reveal_at:null,board:{},version:0}
};

for(const [id,data] of Object.entries(raffles)){
  const ref=db.collection('givingboard_raffles').doc(id);
  const snap=await ref.get();
  if(snap.exists){console.log(`givingboard_raffles/${id} already exists, skipping`);continue}
  await ref.set(data);
  console.log(`Created givingboard_raffles/${id} (${data.slug})`);
}
console.log('Done.');
