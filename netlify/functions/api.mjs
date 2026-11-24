import {webcrypto as crypto} from 'node:crypto';
import {initializeApp,getApps,cert} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';

function db(){
  if(!getApps().length){
    const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
    if(!raw)throw new Error('Firebase is not configured.');
    let json;try{json=JSON.parse(raw)}catch{json=JSON.parse(Buffer.from(raw,'base64').toString('utf8'))}
    initializeApp({credential:cert(json)});
  }
  return getFirestore();
}

const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const fail=(message,status=400)=>json({error:message},status);
const cookies=req=>Object.fromEntries((req.headers.get('cookie')||'').split(';').map(p=>p.trim().split('=').map(decodeURIComponent)).filter(p=>p.length===2));
const hex=arr=>[...new Uint8Array(arr)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function hash(value){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))}
async function sign(value,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))}
async function validCookie(raw,purpose,secret){if(!raw||!secret)return null;let parts=raw.split('.');if(parts.length<3)return null;let signature=parts.pop(),exp=parts.pop(),id=parts.join('.');if(!/^\d+$/.test(exp)||Number(exp)<Date.now())return null;let expected=await sign(`${purpose}.${id}.${exp}`,secret);return signature===expected?id:null}
async function newCookie(id,purpose,secret,request){let exp=Date.now()+7*86400000,value=`${id}.${exp}.${await sign(`${purpose}.${id}.${exp}`,secret)}`;let secure=new URL(request.url).protocol==='https:'?'; Secure':'';return `${purpose}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`}
const participantPath=raffle=>raffle.slug==='angie'?'/r/angie':'/';
const used=raffle=>Object.keys(raffle.board||{}).map(Number);
const settings=r=>({slug:r.slug,title:r.title,total:r.spots_total,price:r.price,max:r.max_per_person,charities:r.charities,prize:r.prize,instructions:r.payment_instructions,drawingDate:r.drawing_date,venmoUrl:r.venmo_url,paypalUrl:r.paypal_url,organizerEmail:r.organizer_email,closed:!!r.closed,winner:r.winner??null,claimed:used(r).length,drawAt:r.winner?null:r.draw_reveal_at??null,drawStartedAt:r.winner?null:r.draw_started_at??null,serverNow:Date.now()});
async function getRaffle(d,id){let snap=await d.collection('givingboard_raffles').doc(String(id)).get();return snap.exists?{id:snap.id,...snap.data()}:null}
async function revealIfReady(d,raffle){
  if(!raffle.pending_winner||!raffle.draw_reveal_at||Date.now()<raffle.draw_reveal_at)return raffle;
  await d.runTransaction(async tx=>{let ref=d.collection('givingboard_raffles').doc(raffle.id),snap=await tx.get(ref),cur=snap.data();if(cur.version!==raffle.version||cur.winner||!cur.pending_winner)return;tx.update(ref,{winner:cur.pending_winner,pending_winner:null,version:cur.version+1})});
  return getRaffle(d,raffle.id);
}
const clean=(value,n=100)=>String(value??'').trim().slice(0,n);
const adminSession=async(req,env)=>{let raw=await validCookie(cookies(req).admin,'admin',env.SESSION_SECRET);if(!raw)return null;let i=raw.indexOf(':');if(i<0)return null;return {raffleId:raw.slice(0,i),email:raw.slice(i+1)}};
async function getAdminDoc(d,email){let snap=await d.collection('givingboard_admins').doc(email).get();return snap.exists?snap.data():null}
async function allRaffleIds(d){let docs=await d.collection('givingboard_raffles').listDocuments();return docs.map(ref=>ref.id)}
async function accessibleRaffleIds(d,adminDoc){if(!adminDoc)return [];if(adminDoc.role==='super')return allRaffleIds(d);return Array.isArray(adminDoc.raffleIds)?adminDoc.raffleIds.map(String):[]}
async function participant(req,env,d,raffleId){let id=await validCookie(cookies(req).entry,'entry',env.SESSION_SECRET);if(!id)return null;let snap=await d.collection('givingboard_raffles').doc(String(raffleId)).collection('givingboard_requests').doc(id).get();return snap.exists?{id:snap.id,...snap.data()}:null}
async function body(req){if(!req.headers.get('content-type')?.includes('application/json'))throw Error('Send JSON.');return req.json()}
const randomId=()=>crypto.randomUUID();
const randomCode=()=>{let a=new Uint32Array(1);crypto.getRandomValues(a);return String(a[0]%1000000).padStart(6,'0')};
async function deliverCode(env,r,code,origin,raffle){
  if(!env.BREVO_API_KEY||!env.BREVO_SENDER_EMAIL)return 'manual';
  let link=`${origin}${participantPath(raffle)}#${new URLSearchParams({email:r.email,code})}`;
  try{let res=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'content-type':'application/json','api-key':env.BREVO_API_KEY},body:JSON.stringify({sender:{email:env.BREVO_SENDER_EMAIL,name:'The Giving Board'},to:[{email:r.email,name:r.name}],subject:'Your raffle spots are ready',htmlContent:`<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#17332f"><div style="background:#103b39;color:#d8f26b;padding:24px;font-weight:bold;font-size:20px">♥ The Giving Board</div><div style="padding:30px"><h1>Your spots are ready.</h1><p>Hi ${r.name.replace(/[&<>"']/g,'')}, your payment was approved for <b>${r.approved} raffle spot${r.approved===1?'':'s'}</b>.</p><p><a href="${link.replace(/&/g,'&amp;')}" style="display:inline-block;background:#103b39;color:white;padding:15px 24px;text-decoration:none;border-radius:9px">Choose my numbers</a></p><p>This link works once and expires in 24 hours. If it does not open, visit ${origin}${participantPath(raffle)} and enter your email with backup code <b>${code}</b>.</p></div></div>`})});return res.ok?'sent':'manual'}catch{return 'manual'}
}

export default async (request,context)=>{
  const env=process.env;
  try{
    const url=new URL(request.url),method=request.method;
    // In production, Netlify's /api/* redirect invokes this function but request.url still
    // reflects the original requested path (e.g. "/api/config"), not the rewritten
    // "/.netlify/functions/api/config" destination. Support both so direct function calls
    // (used for local testing) and the normal redirected calls both resolve correctly.
    let route=url.pathname.startsWith('/.netlify/functions/api')?'/api'+url.pathname.slice('/.netlify/functions/api'.length)||'/api/':url.pathname;
    let raffleId=1,d=db(),adminEmail=null,adminDoc=null;
    if(route.startsWith('/api/r/')){if(!route.startsWith('/api/r/angie/'))return fail('Not found.',404);route='/api/'+route.slice('/api/r/angie/'.length);raffleId=2}
    if(route.startsWith('/api/admin/')&&route!=='/api/admin/login'&&route!=='/api/admin/logout'){
      let session=await adminSession(request,env);if(!session)return fail('Organizer sign in required.',401);
      adminEmail=session.email;adminDoc=await getAdminDoc(d,adminEmail);if(!adminDoc)return fail('Organizer sign in required.',401);
      let accessible=await accessibleRaffleIds(d,adminDoc);if(!accessible.includes(session.raffleId))return fail('Organizer sign in required.',401);
      raffleId=Number(session.raffleId)
    }
    if(method==='POST'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return fail('Invalid origin.',403);
    let raffle=await getRaffle(d,raffleId);if(!raffle)return fail('Raffle unavailable.',503);raffle=await revealIfReady(d,raffle);
    const raffleRef=d.collection('givingboard_raffles').doc(String(raffleId)),requestsCol=raffleRef.collection('givingboard_requests');
    if(method==='GET'&&route==='/api/config')return json(settings(raffle));
    if(method==='POST'&&route==='/api/requests'){
      if(raffle.closed)return fail('This raffle is closed.');let b=await body(request),name=clean(b.name,60),email=clean(b.email,120).toLowerCase(),tag=clean(b.tag,120),requested=Number(b.requested),payment=clean(b.method,15);
      let tagValid=payment==='Venmo'?/^@?[a-zA-Z0-9._-]{2,50}$/.test(tag):payment==='PayPal'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag);
      if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!tagValid||!Number.isInteger(requested)||requested<1||requested>raffle.max_per_person||!['Venmo','PayPal'].includes(payment)||b.paid!==true)return fail('Check your name, email, payment identifier, amount, and payment confirmation.');
      // Query only by email so participant flows need no composite Firestore indexes.
      // Do not limit before filtering: earlier declined requests may precede an active one.
      let existing=await requestsCol.where('email','==',email).get();if(existing.docs.some(doc=>doc.data().status!=='declined'))return fail('This email already has an entry. Contact the organizer if you need help.',409);
      await requestsCol.doc(randomId()).set({name,email,method:payment,tag,requested,amount:requested*raffle.price,approved:0,status:'pending',code_hash:null,code_expires:null,failed_attempts:0,created_at:new Date().toISOString()});
      return json({ok:true,status:'pending'},201)
    }
    if(method==='POST'&&route==='/api/verify'){
      let b=await body(request),email=clean(b.email,120).toLowerCase(),code=clean(b.code,6);if(!/^[0-9]{6}$/.test(code))return fail('Enter the six-digit code.');
      let snap=await requestsCol.where('email','==',email).get();
      let r=snap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(entry=>entry.status==='approved').sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))[0];
      if(!r)return fail('Code not found or expired. Ask the organizer to resend it.',401);
      if(!r.code_hash||!r.code_expires||r.code_expires<Date.now()||r.failed_attempts>=5)return fail('Code not found or expired. Ask the organizer to resend it.',401);
      if(await hash(`${r.id}.${code}.${env.SESSION_SECRET}`)!==r.code_hash){await requestsCol.doc(r.id).update({failed_attempts:(r.failed_attempts||0)+1});return fail('Code not found or expired. Ask the organizer to resend it.',401)}
      await requestsCol.doc(r.id).update({code_hash:null,code_expires:null,failed_attempts:0});return json({ok:true},200,{'set-cookie':await newCookie(r.id,'entry',env.SESSION_SECRET,request)})
    }
    if(method==='GET'&&route==='/api/me'){
      let r=await participant(request,env,d,raffleId);if(!r)return fail('Sign in with your emailed code.',401);let board=raffle.board||{};let mine=Object.keys(board).filter(n=>board[n]===r.id).map(Number);return json({name:r.name,status:r.status,approved:r.approved,requested:r.requested,spots:mine,used:used(raffle),...settings(raffle)})
    }
    if(method==='POST'&&route==='/api/claim'){
      let r=await participant(request,env,d,raffleId);if(!r||r.status!=='approved')return fail('Your entry is not approved.',403);let b=await body(request),numbers=b.numbers;if(!Array.isArray(numbers)||numbers.length!==r.approved||new Set(numbers).size!==numbers.length||numbers.some(n=>!Number.isInteger(n)||n<1||n>raffle.spots_total))return fail(`Choose exactly ${r.approved} valid spots.`);
      let outcome=await d.runTransaction(async tx=>{
        let snap=await tx.get(raffleRef),cur=snap.data();if(cur.closed||cur.winner)return {error:'The board is closed.',status:400};let board=cur.board||{};if(Object.values(board).includes(r.id))return {error:'You have already chosen your spots.',status:409};if(numbers.some(n=>board[n]))return {error:'One of those spots was just claimed. Choose again.',status:409};
        for(let n of numbers)board[n]=r.id;tx.update(raffleRef,{board,version:cur.version+1});return {ok:true}
      });
      if(outcome.error)return fail(outcome.error,outcome.status);return json({ok:true,spots:numbers})
    }
    if(method==='POST'&&route==='/api/logout'){return json({ok:true},200,{'set-cookie':'entry=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'})}
    if(method==='POST'&&route==='/api/admin/login'){
      let b=await body(request);if(!env.SESSION_SECRET)return fail('Organizer access is not configured.',503);
      let decoded;try{decoded=await getAuth().verifyIdToken(clean(b.idToken,4000))}catch{return fail('Incorrect email or password.',401)}
      let email=(decoded.email||'').toLowerCase(),doc=await getAdminDoc(d,email);if(!doc)return fail('This account is not an organizer for any raffle.',403);
      let accessible=await accessibleRaffleIds(d,doc);if(!accessible.length)return fail('This account is not an organizer for any raffle.',403);
      let requested=clean(b.raffleId,10),target=accessible.includes(requested)?requested:accessible[0];
      return json({ok:true},200,{'set-cookie':await newCookie(`${target}:${email}`,'admin',env.SESSION_SECRET,request)})
    }
    if(method==='POST'&&route==='/api/admin/logout')return json({ok:true},200,{'set-cookie':'admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});
    if(!route.startsWith('/api/admin/'))return fail('Not found.',404);
    if(method==='GET'&&route==='/api/admin/me'){
      let accessible=await accessibleRaffleIds(d,adminDoc),raffles=[];
      for(let id of accessible){let r=await getRaffle(d,id);if(r)raffles.push({id:r.id,title:r.title})}
      return json({email:adminEmail,role:adminDoc.role,currentRaffleId:String(raffleId),raffles})
    }
    if(method==='POST'&&route==='/api/admin/switch-raffle'){
      let b=await body(request),accessible=await accessibleRaffleIds(d,adminDoc),target=clean(b.raffleId,10);
      if(!accessible.includes(target))return fail('You do not have access to that raffle.',403);
      return json({ok:true},200,{'set-cookie':await newCookie(`${target}:${adminEmail}`,'admin',env.SESSION_SECRET,request)})
    }
    if(route.startsWith('/api/admin/organizers')&&adminDoc.role!=='super')return fail('Only the primary organizer can manage admins.',403);
    if(method==='GET'&&route==='/api/admin/organizers'){
      let snap=await d.collection('givingboard_admins').get();
      let list=snap.docs.map(doc=>({email:doc.id,role:doc.data().role,raffleIds:doc.data().raffleIds||[]}));
      return json({admins:list})
    }
    if(method==='POST'&&route==='/api/admin/organizers/add'){
      let b=await body(request),email=clean(b.email,120).toLowerCase(),targetRaffle=clean(b.raffleId,10);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail('Enter a valid email address.');
      if(!(await getRaffle(d,targetRaffle)))return fail('Choose a valid raffle.');
      let ref=d.collection('givingboard_admins').doc(email),existing=await ref.get();
      if(existing.exists&&existing.data().role==='super')return fail('That account already has full access.');
      await ref.set({role:'organizer',raffleIds:FieldValue.arrayUnion(targetRaffle),createdAt:new Date().toISOString(),createdBy:adminEmail},{merge:true});
      let tempPassword=null;
      try{await getAuth().getUserByEmail(email)}catch{tempPassword=crypto.randomUUID().replace(/-/g,'').slice(0,12);await getAuth().createUser({email,password:tempPassword,emailVerified:true})}
      return json({ok:true,tempPassword})
    }
    if(method==='POST'&&route==='/api/admin/organizers/remove'){
      let b=await body(request),email=clean(b.email,120).toLowerCase();
      if(email===adminEmail)return fail('You cannot remove your own access.');
      let ref=d.collection('givingboard_admins').doc(email),existing=await ref.get();
      if(!existing.exists)return fail('That account is not an organizer.');
      if(existing.data().role==='super')return fail('That account cannot be removed.');
      await ref.delete();return json({ok:true})
    }
    if(method==='GET'&&route==='/api/admin/state'){
      let snap=await requestsCol.orderBy('created_at','desc').get(),board=raffle.board||{};
      let rows=snap.docs.map(doc=>{let r={id:doc.id,...doc.data()};return {id:r.id,name:r.name,email:r.email,method:r.method,tag:r.tag,requested:r.requested,amount:r.amount,approved:r.approved,status:r.status,created_at:r.created_at,code_expires:r.code_expires,spots:Object.keys(board).filter(n=>board[n]===r.id).map(Number)}});
      let archSnap=await raffleRef.collection('givingboard_history').orderBy('drawn_at','desc').limit(5).get();
      let history=archSnap.docs.map(doc=>{let h=doc.data(),prior=h.snapshot.settings;return {slug:raffle.slug,title:h.title,winner:h.winner,winner_name:h.winner_name,winner_email:h.winner_email,drawn_at:h.drawn_at,outcome:h.outcome,prize:prior.prize,charities:prior.charities}});
      return json({settings:settings(raffle),history,requests:rows})
    }
    if(method==='POST'&&route==='/api/admin/settings'){
      if(raffle.pending_winner||raffle.winner)return fail('Start a new raffle before changing details.');
      let b=await body(request),title=clean(b.title,70),total=Number(b.total),price=Number(b.price),max=Number(b.max),charities=clean(b.charities,120),prize=clean(b.prize,120),instructions=clean(b.instructions,250),date=clean(b.drawingDate,40),venmoUrl=clean(b.venmoUrl,250),paypalUrl=clean(b.paypalUrl,250),organizerEmail=clean(b.organizerEmail,120).toLowerCase();
      if(!title||!charities||!prize||!instructions||!Number.isInteger(total)||total<1||total>200||!Number.isInteger(price)||price<1||price>1000||!Number.isInteger(max)||max<1||max>10||max>total)return fail('Check raffle settings and limits.');
      let allowedUrl=(value,hosts)=>{try{let u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.includes(u.hostname)}catch{return false}};
      if(!allowedUrl(venmoUrl,['venmo.com','www.venmo.com'])||!allowedUrl(paypalUrl,['paypal.com','www.paypal.com','paypal.me','www.paypal.me'])||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizerEmail))return fail('Check the Venmo link, PayPal link, and organizer email.');
      let highest=Math.max(0,...used(raffle));let approvedSnap=await requestsCol.where('status','==','approved').get();let commitments=approvedSnap.docs.reduce((sum,doc)=>sum+(doc.data().approved||0),0);if(total<highest||total<commitments)return fail(`Keep at least ${Math.max(highest,commitments)} spots for existing claims and approvals.`);
      await raffleRef.update({title,spots_total:total,price,max_per_person:max,charities,prize,payment_instructions:instructions,drawing_date:date,venmo_url:venmoUrl,paypal_url:paypalUrl,organizer_email:organizerEmail,version:raffle.version+1});return json({ok:true})
    }
    if(method==='POST'&&route==='/api/admin/approve'){
      let b=await body(request),count=Number(b.count),rSnap=await requestsCol.doc(clean(b.id,50)).get();if(!rSnap.exists)return fail('This request cannot be approved.');let r={id:rSnap.id,...rSnap.data()};if(r.status!=='pending'||raffle.closed)return fail('This request cannot be approved.');if(!Number.isInteger(count)||count<1||count>r.requested)return fail('Choose a number within this request.');
      let approvedSnap=await requestsCol.where('status','==','approved').get();let commitments=approvedSnap.docs.reduce((sum,doc)=>sum+(doc.data().approved||0),0);if(commitments+count>raffle.spots_total)return fail('Not enough unallocated spots remain.');
      let code=randomCode(),expiry=Date.now()+86400000,codeHash=await hash(`${r.id}.${code}.${env.SESSION_SECRET}`);await requestsCol.doc(r.id).update({approved:count,status:'approved',code_hash:codeHash,code_expires:expiry,failed_attempts:0});r.approved=count;let delivery=await deliverCode(env,r,code,url.origin,raffle);return json({ok:true,delivery,code:delivery==='manual'?code:undefined})
    }
    if(method==='POST'&&route==='/api/admin/resend'){
      let b=await body(request),rSnap=await requestsCol.doc(clean(b.id,50)).get();if(!rSnap.exists)return fail('Only approved requests can receive a code.');let r={id:rSnap.id,...rSnap.data()};if(r.status!=='approved')return fail('Only approved requests can receive a code.');let code=randomCode(),expiry=Date.now()+86400000;await requestsCol.doc(r.id).update({code_hash:await hash(`${r.id}.${code}.${env.SESSION_SECRET}`),code_expires:expiry,failed_attempts:0});let delivery=await deliverCode(env,r,code,url.origin,raffle);return json({ok:true,delivery,code:delivery==='manual'?code:undefined})
    }
    if(method==='POST'&&route==='/api/admin/decline'){
      let b=await body(request),rSnap=await requestsCol.doc(clean(b.id,50)).get();if(!rSnap.exists||rSnap.data().status!=='pending')return fail('Only pending requests can be declined.');await requestsCol.doc(rSnap.id).update({status:'declined'});return json({ok:true})
    }
    if(method==='POST'&&route==='/api/admin/close'){
      if(raffle.winner||raffle.pending_winner)return fail('The draw has started or a winner was selected.');await raffleRef.update({closed:raffle.closed?0:1,version:raffle.version+1});return json({ok:true})
    }
    if(method==='POST'&&route==='/api/admin/start-draw'){
      if(!raffle.closed||raffle.winner||raffle.pending_winner)return fail('Close the board before starting a new draw.');let numbers=used(raffle);if(!numbers.length)return fail('No claimed spots to draw from.');let bytes=new Uint32Array(1),limit=Math.floor(4294967296/numbers.length)*numbers.length;do{crypto.getRandomValues(bytes)}while(bytes[0]>=limit);let winner=numbers[bytes[0]%numbers.length],started=Date.now();
      let outcome=await d.runTransaction(async tx=>{let snap=await tx.get(raffleRef),cur=snap.data();if(cur.version!==raffle.version||cur.winner||cur.pending_winner||!cur.closed)return {error:true};tx.update(raffleRef,{pending_winner:winner,draw_started_at:started,draw_reveal_at:started+15000,version:cur.version+1});return {ok:true}});
      if(outcome.error)return fail('Draw state changed. Refresh.',409);return json({ok:true,drawAt:started+15000})
    }
    if(method==='POST'&&route==='/api/admin/reset'){
      if(raffle.pending_winner)return fail('Wait for the countdown to finish before restarting.');
      let snap=await requestsCol.orderBy('created_at').get(),requestsList=snap.docs.map(doc=>({id:doc.id,...doc.data()}));
      let winnerId=(raffle.board||{})[raffle.winner],owner=requestsList.find(r=>r.id===winnerId);
      let shouldArchive=raffle.winner||requestsList.length||used(raffle).length;
      let outcome=await d.runTransaction(async tx=>{
        let fresh=await tx.get(raffleRef),cur=fresh.data();if(cur.version!==raffle.version)return {error:true};
        if(shouldArchive)tx.set(raffleRef.collection('givingboard_history').doc(randomId()),{title:raffle.title,winner:raffle.winner||0,winner_name:owner?.name||'',winner_email:owner?.email||'',drawn_at:new Date().toISOString(),snapshot:{settings:settings(raffle),board:raffle.board||{},requests:requestsList},outcome:raffle.winner?'winner':'restarted'});
        tx.update(raffleRef,{board:{},closed:1,winner:null,pending_winner:null,draw_started_at:null,draw_reveal_at:null,version:cur.version+1});
        return {ok:true}
      });
      if(outcome.error)return fail('Board changed. Refresh and try again.',409);
      let batch=d.batch();snap.docs.forEach(doc=>batch.delete(doc.ref));if(snap.docs.length)await batch.commit();
      return json({ok:true})
    }
    return fail('Not found.',404)
  }catch(error){return fail(error?.message||'Something went wrong.',500)}
};
