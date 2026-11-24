const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const fail=(message,status=400)=>json({error:message},status);
const html=body=>new Response(body,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const cookies=req=>Object.fromEntries((req.headers.get('cookie')||'').split(';').map(p=>p.trim().split('=').map(decodeURIComponent)).filter(p=>p.length===2));
const hex=arr=>[...new Uint8Array(arr)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function hash(value){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))}
async function sign(value,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))}
async function validCookie(raw,purpose,secret){if(!raw||!secret)return null;let parts=raw.split('.');if(parts.length!==3)return null;let [id,exp,signature]=parts;if(!/^\d+$/.test(exp)||Number(exp)<Date.now())return null;let expected=await sign(`${purpose}.${id}.${exp}`,secret);return signature===expected?id:null}
async function newCookie(id,purpose,secret,request){let exp=Date.now()+7*86400000,value=`${id}.${exp}.${await sign(`${purpose}.${id}.${exp}`,secret)}`;let secure=new URL(request.url).protocol==='https:'?'; Secure':'';return `${purpose}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`}
const getRaffle=(env,id)=>env.DB.prepare('SELECT * FROM raffle WHERE id=?').bind(id).first();
const participantPath=raffle=>raffle.slug==='angie'?'/r/angie':'/';
const used=raffle=>Object.keys(JSON.parse(raffle.board_json||'{}')).map(Number);
const settings=r=>({slug:r.slug,title:r.title,total:r.spots_total,price:r.price,max:r.max_per_person,charities:r.charities,prize:r.prize,instructions:r.payment_instructions,drawingDate:r.drawing_date,venmoUrl:r.venmo_url,paypalUrl:r.paypal_url,organizerEmail:r.organizer_email,closed:!!r.closed,winner:r.winner,claimed:used(r).length,drawAt:r.winner?null:r.draw_reveal_at,drawStartedAt:r.winner?null:r.draw_started_at,serverNow:Date.now()});
async function revealIfReady(env,raffle){
  if(!raffle.pending_winner||!raffle.draw_reveal_at||Date.now()<raffle.draw_reveal_at)return raffle;
  await env.DB.prepare('UPDATE raffle SET winner=pending_winner,pending_winner=NULL,version=version+1 WHERE id=? AND version=? AND winner IS NULL AND pending_winner IS NOT NULL').bind(raffle.id,raffle.version).run();
  return getRaffle(env,raffle.id);
}
const clean=(value,n=100)=>String(value??'').trim().slice(0,n);
const adminId=async(req,env)=>await validCookie(cookies(req).admin,'admin',env.SESSION_SECRET);
async function participant(req,env,raffleId){let id=await validCookie(cookies(req).entry,'entry',env.SESSION_SECRET);return id?env.DB.prepare('SELECT * FROM requests WHERE id=? AND raffle_id=?').bind(id,raffleId).first():null}
async function body(req){if(!req.headers.get('content-type')?.includes('application/json'))throw Error('Send JSON.');return req.json()}
const randomId=()=>crypto.randomUUID();
const randomCode=()=>{let a=new Uint32Array(1);crypto.getRandomValues(a);return String(a[0]%1000000).padStart(6,'0')};
async function deliverCode(env,r,code,origin,raffle){
  if(!env.BREVO_API_KEY||!env.BREVO_SENDER_EMAIL)return 'manual';
  let link=`${origin}${participantPath(raffle)}#${new URLSearchParams({email:r.email,code})}`;
  try{let res=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'content-type':'application/json','api-key':env.BREVO_API_KEY},body:JSON.stringify({sender:{email:env.BREVO_SENDER_EMAIL,name:'The Giving Board'},to:[{email:r.email,name:r.name}],subject:'Your raffle spots are ready',htmlContent:`<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#17332f"><div style="background:#103b39;color:#d8f26b;padding:24px;font-weight:bold;font-size:20px">♥ The Giving Board</div><div style="padding:30px"><h1>Your spots are ready.</h1><p>Hi ${r.name.replace(/[&<>"']/g,'')}, your payment was approved for <b>${r.approved} raffle spot${r.approved===1?'':'s'}</b>.</p><p><a href="${link.replace(/&/g,'&amp;')}" style="display:inline-block;background:#103b39;color:white;padding:15px 24px;text-decoration:none;border-radius:9px">Choose my numbers</a></p><p>This link works once and expires in 24 hours. If it does not open, visit ${origin}${participantPath(raffle)} and enter your email with backup code <b>${code}</b>.</p></div></div>`})});return res.ok?'sent':'manual'}catch{return 'manual'}
}
export default {async fetch(request,env){
  try{
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(method==='GET'&&(path==='/'||path==='/r/angie'))return html(USER_HTML);
    if(method==='GET'&&path==='/organizer')return html(ADMIN_HTML);
    if(!path.startsWith('/api/'))return new Response('Not found',{status:404});
    let route=path,raffleId=1;
    if(path.startsWith('/api/r/')){if(!path.startsWith('/api/r/angie/'))return fail('Not found.',404);route='/api/'+path.slice('/api/r/angie/'.length);raffleId=2}
    if(route.startsWith('/api/admin/')&&route!=='/api/admin/login'&&route!=='/api/admin/logout'){let admin=await adminId(request,env);if(!['1','2'].includes(admin))return fail('Organizer sign in required.',401);raffleId=Number(admin)}
    if(!env.DB)return fail('Database unavailable.',503);
    if(method==='POST'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return fail('Invalid origin.',403);
    let raffle=await getRaffle(env,raffleId);if(!raffle)return fail('Raffle unavailable.',503);raffle=await revealIfReady(env,raffle);
    if(method==='GET'&&route==='/api/config')return json(settings(raffle));
    if(method==='POST'&&route==='/api/requests'){
      if(raffle.closed)return fail('This raffle is closed.');let b=await body(request),name=clean(b.name,60),email=clean(b.email,120).toLowerCase(),tag=clean(b.tag,120),requested=Number(b.requested),payment=clean(b.method,15);
      let tagValid=payment==='Venmo'?/^@?[a-zA-Z0-9._-]{2,50}$/.test(tag):payment==='PayPal'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag);
      if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!tagValid||!Number.isInteger(requested)||requested<1||requested>raffle.max_per_person||!['Venmo','PayPal'].includes(payment)||b.paid!==true)return fail('Check your name, email, payment identifier, amount, and payment confirmation.');
      let existing=await env.DB.prepare("SELECT id FROM requests WHERE raffle_id=? AND lower(email)=? AND status!='declined' LIMIT 1").bind(raffleId,email).first();if(existing)return fail('This email already has an entry. Contact the organizer if you need help.',409);
      let id=randomId();await env.DB.prepare('INSERT INTO requests (id,name,email,method,tag,requested,amount,created_at,raffle_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,name,email,payment,tag,requested,requested*raffle.price,new Date().toISOString(),raffleId).run();return json({ok:true,status:'pending'},201)
    }
    if(method==='POST'&&route==='/api/verify'){
      let b=await body(request),email=clean(b.email,120).toLowerCase(),code=clean(b.code,6);if(!/^[0-9]{6}$/.test(code))return fail('Enter the six-digit code.');
      let rows=await env.DB.prepare("SELECT * FROM requests WHERE raffle_id=? AND lower(email)=? AND status='approved' AND code_hash IS NOT NULL ORDER BY created_at DESC LIMIT 1").bind(raffleId,email).first();
      if(!rows||!rows.code_expires||rows.code_expires<Date.now()||rows.failed_attempts>=5)return fail('Code not found or expired. Ask the organizer to resend it.',401);
      if(await hash(`${rows.id}.${code}.${env.SESSION_SECRET}`)!==rows.code_hash){await env.DB.prepare('UPDATE requests SET failed_attempts=failed_attempts+1 WHERE id=?').bind(rows.id).run();return fail('Code not found or expired. Ask the organizer to resend it.',401)}
      await env.DB.prepare('UPDATE requests SET code_hash=NULL, code_expires=NULL, failed_attempts=0 WHERE id=?').bind(rows.id).run();return json({ok:true},200,{'set-cookie':await newCookie(rows.id,'entry',env.SESSION_SECRET,request)})
    }
    if(method==='GET'&&route==='/api/me'){
      let r=await participant(request,env,raffleId);if(!r)return fail('Sign in with your emailed code.',401);let board=JSON.parse(raffle.board_json||'{}');let mine=Object.keys(board).filter(n=>board[n]===r.id).map(Number);return json({name:r.name,status:r.status,approved:r.approved,requested:r.requested,spots:mine,used:used(raffle),...settings(raffle)})
    }
    if(method==='POST'&&route==='/api/claim'){
      let r=await participant(request,env,raffleId);if(!r||r.status!=='approved')return fail('Your entry is not approved.',403);let b=await body(request),numbers=b.numbers;if(!Array.isArray(numbers)||numbers.length!==r.approved||new Set(numbers).size!==numbers.length||numbers.some(n=>!Number.isInteger(n)||n<1||n>raffle.spots_total))return fail(`Choose exactly ${r.approved} valid spots.`);
      for(let attempt=0;attempt<3;attempt++){
        raffle=await getRaffle(env,raffleId);if(raffle.closed||raffle.winner)return fail('The board is closed.');let board=JSON.parse(raffle.board_json||'{}');if(Object.values(board).includes(r.id))return fail('You have already chosen your spots.',409);if(numbers.some(n=>board[n]))return fail('One of those spots was just claimed. Choose again.',409);
        for(let n of numbers)board[n]=r.id;let update=await env.DB.prepare('UPDATE raffle SET board_json=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(board),raffleId,raffle.version).run();if(update.meta?.changes===1)return json({ok:true,spots:numbers})
      }return fail('Board changed. Try again.',409)
    }
    if(method==='POST'&&route==='/api/logout'){return json({ok:true},200,{'set-cookie':'entry=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'})}
    if(method==='POST'&&route==='/api/admin/login'){
      let b=await body(request);if(!env.ORGANIZER_PASSCODE||!env.ANGIE_ORGANIZER_PASSCODE||!env.SESSION_SECRET)return fail('Organizer access is not configured.',503);let candidate=await hash(clean(b.passcode,200)),id=candidate===await hash(env.ORGANIZER_PASSCODE)?'1':candidate===await hash(env.ANGIE_ORGANIZER_PASSCODE)?'2':null;if(!id)return fail('Incorrect passcode.',401);return json({ok:true},200,{'set-cookie':await newCookie(id,'admin',env.SESSION_SECRET,request)})
    }
    if(method==='POST'&&route==='/api/admin/logout')return json({ok:true},200,{'set-cookie':'admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});
    if(!route.startsWith('/api/admin/'))return fail('Not found.',404);
    if(method==='GET'&&route==='/api/admin/state'){
      let rows=(await env.DB.prepare('SELECT id,name,email,method,tag,requested,amount,approved,status,created_at,code_expires FROM requests WHERE raffle_id=? ORDER BY created_at DESC').bind(raffleId).all()).results||[],board=JSON.parse(raffle.board_json||'{}'),archives=(await env.DB.prepare('SELECT title,winner,winner_name,winner_email,drawn_at,outcome,snapshot_json FROM raffle_history WHERE raffle_id=? ORDER BY drawn_at DESC LIMIT 5').bind(raffleId).all()).results||[];
      let history=archives.map(h=>{let prior=JSON.parse(h.snapshot_json).settings;return {slug:raffle.slug,title:h.title,winner:h.winner,winner_name:h.winner_name,winner_email:h.winner_email,drawn_at:h.drawn_at,outcome:h.outcome,prize:prior.prize,charities:prior.charities}});
      return json({settings:settings(raffle),history,requests:rows.map(r=>({...r,spots:Object.keys(board).filter(n=>board[n]===r.id).map(Number)}))})
    }
    if(method==='POST'&&route==='/api/admin/settings'){
      if(raffle.pending_winner||raffle.winner)return fail('Start a new raffle before changing details.');
      let b=await body(request),title=clean(b.title,70),total=Number(b.total),price=Number(b.price),max=Number(b.max),charities=clean(b.charities,120),prize=clean(b.prize,120),instructions=clean(b.instructions,250),date=clean(b.drawingDate,40),venmoUrl=clean(b.venmoUrl,250),paypalUrl=clean(b.paypalUrl,250),organizerEmail=clean(b.organizerEmail,120).toLowerCase();
      if(!title||!charities||!prize||!instructions||!Number.isInteger(total)||total<1||total>200||!Number.isInteger(price)||price<1||price>1000||!Number.isInteger(max)||max<1||max>10||max>total)return fail('Check raffle settings and limits.');
      let allowedUrl=(value,hosts)=>{try{let u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.includes(u.hostname)}catch{return false}};
      if(!allowedUrl(venmoUrl,['venmo.com','www.venmo.com'])||!allowedUrl(paypalUrl,['paypal.com','www.paypal.com','paypal.me','www.paypal.me'])||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizerEmail))return fail('Check the Venmo link, PayPal link, and organizer email.');
      let highest=Math.max(0,...used(raffle));let commitments=(await env.DB.prepare("SELECT COALESCE(SUM(approved),0) total FROM requests WHERE status='approved' AND raffle_id=?").bind(raffleId).first()).total;if(total<highest||total<commitments)return fail(`Keep at least ${Math.max(highest,commitments)} spots for existing claims and approvals.`);
      await env.DB.prepare('UPDATE raffle SET title=?,spots_total=?,price=?,max_per_person=?,charities=?,prize=?,payment_instructions=?,drawing_date=?,venmo_url=?,paypal_url=?,organizer_email=?,version=version+1 WHERE id=?').bind(title,total,price,max,charities,prize,instructions,date,venmoUrl,paypalUrl,organizerEmail,raffleId).run();return json({ok:true})
    }
    if(method==='POST'&&route==='/api/admin/approve'){
      let b=await body(request),count=Number(b.count),r=await env.DB.prepare('SELECT * FROM requests WHERE id=? AND raffle_id=?').bind(clean(b.id,50),raffleId).first();if(!r||r.status!=='pending'||raffle.closed)return fail('This request cannot be approved.');if(!Number.isInteger(count)||count<1||count>r.requested)return fail('Choose a number within this request.');
      let commitments=(await env.DB.prepare("SELECT COALESCE(SUM(approved),0) total FROM requests WHERE status='approved' AND raffle_id=?").bind(raffleId).first()).total;if(commitments+count>raffle.spots_total)return fail('Not enough unallocated spots remain.');
      let code=randomCode(),expiry=Date.now()+86400000,codeHash=await hash(`${r.id}.${code}.${env.SESSION_SECRET}`);await env.DB.prepare("UPDATE requests SET approved=?,status='approved',code_hash=?,code_expires=?,failed_attempts=0 WHERE id=? AND status='pending'").bind(count,codeHash,expiry,r.id).run();r.approved=count;let delivery=await deliverCode(env,r,code,url.origin,raffle);return json({ok:true,delivery,code:delivery==='manual'?code:undefined})
    }
    if(method==='POST'&&route==='/api/admin/resend'){
      let b=await body(request),r=await env.DB.prepare('SELECT * FROM requests WHERE id=? AND raffle_id=?').bind(clean(b.id,50),raffleId).first();if(!r||r.status!=='approved')return fail('Only approved requests can receive a code.');let code=randomCode(),expiry=Date.now()+86400000;await env.DB.prepare('UPDATE requests SET code_hash=?,code_expires=?,failed_attempts=0 WHERE id=?').bind(await hash(`${r.id}.${code}.${env.SESSION_SECRET}`),expiry,r.id).run();let delivery=await deliverCode(env,r,code,url.origin,raffle);return json({ok:true,delivery,code:delivery==='manual'?code:undefined})
    }
    if(method==='POST'&&route==='/api/admin/decline'){
      let b=await body(request),r=await env.DB.prepare('SELECT * FROM requests WHERE id=? AND raffle_id=?').bind(clean(b.id,50),raffleId).first();if(!r||r.status!=='pending')return fail('Only pending requests can be declined.');await env.DB.prepare("UPDATE requests SET status='declined' WHERE id=?").bind(r.id).run();return json({ok:true})
    }
    if(method==='POST'&&route==='/api/admin/close'){
      if(raffle.winner||raffle.pending_winner)return fail('The draw has started or a winner was selected.');await env.DB.prepare('UPDATE raffle SET closed=?,version=version+1 WHERE id=?').bind(raffle.closed?0:1,raffleId).run();return json({ok:true})
    }
    if(method==='POST'&&route==='/api/admin/start-draw'){
      if(!raffle.closed||raffle.winner||raffle.pending_winner)return fail('Close the board before starting a new draw.');let numbers=used(raffle);if(!numbers.length)return fail('No claimed spots to draw from.');let bytes=new Uint32Array(1),limit=Math.floor(4294967296/numbers.length)*numbers.length;do{crypto.getRandomValues(bytes)}while(bytes[0]>=limit);let winner=numbers[bytes[0]%numbers.length],started=Date.now(),result=await env.DB.prepare('UPDATE raffle SET pending_winner=?,draw_started_at=?,draw_reveal_at=?,version=version+1 WHERE id=? AND winner IS NULL AND pending_winner IS NULL AND closed=1 AND version=?').bind(winner,started,started+15000,raffleId,raffle.version).run();if(result.meta?.changes!==1)return fail('Draw state changed. Refresh.',409);return json({ok:true,drawAt:started+15000})
    }
    if(method==='POST'&&route==='/api/admin/reset'){
      if(raffle.pending_winner)return fail('Wait for the countdown to finish before restarting.');
      let requests=(await env.DB.prepare('SELECT id,name,email,method,tag,requested,amount,approved,status,created_at FROM requests WHERE raffle_id=? ORDER BY created_at').bind(raffleId).all()).results||[];
      let winnerId=JSON.parse(raffle.board_json||'{}')[raffle.winner],owner=requests.find(r=>r.id===winnerId);
      let statements=[];
      if(raffle.winner||requests.length||used(raffle).length)statements.push(env.DB.prepare('INSERT INTO raffle_history (id,raffle_id,title,winner,winner_name,winner_email,drawn_at,snapshot_json,outcome) SELECT ?,?,?,?,?,?,?,?,? FROM raffle WHERE id=? AND version=?').bind(randomId(),raffleId,raffle.title,raffle.winner||0,owner?.name||'',owner?.email||'',new Date().toISOString(),JSON.stringify({settings:settings(raffle),board:JSON.parse(raffle.board_json),requests}),raffle.winner?'winner':'restarted',raffleId,raffle.version));
      statements.push(env.DB.prepare("UPDATE raffle SET board_json='{}',closed=1,winner=NULL,pending_winner=NULL,draw_started_at=NULL,draw_reveal_at=NULL,version=version+1 WHERE id=? AND version=?").bind(raffleId,raffle.version));
      statements.push(env.DB.prepare('DELETE FROM requests WHERE raffle_id=?').bind(raffleId));
      let result=await env.DB.batch(statements);if(result[statements.length-2].meta?.changes!==1)return fail('Board changed. Refresh and try again.',409);
      return json({ok:true})
    }
    return fail('Not found.',404)
  }catch(error){return fail(error?.message||'Something went wrong.',500)}
}};
