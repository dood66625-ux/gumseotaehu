/** Synthetic checks run inside the dedicated Compose project; no exposed port is required. */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const compose = [
  "compose",
  "--env-file",
  "var/runtime/synthetic.env",
  "-f",
  "compose.local.yml",
  "-p",
  "gumseo-runtime-smoke",
];
function docker(args: string[], input?: string) {
  return execFileSync("docker", [...compose, ...args], {
    input,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30000,
  }).toString();
}
const journey = String.raw`
import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const file='/data/runtime-smoke-check.json',phase=process.argv[2];let cookie='';
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function call(path,body){const r=await fetch('http://127.0.0.1:3000/api/'+path,{headers:{origin:'http://localhost:3100',...(cookie?{cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000)});const set=r.headers.getSetCookie().find(c=>c.startsWith('gs_session='));if(set)cookie=set.split(';')[0];assert.ok(r.ok,'Synthetic API request failed');return r;}
const json=async(path,body)=>(await call(path,body)).json();
if(phase==='before'){
 await json('session',{});const auth=await json('auth/request',{email:'runtime-smoke@example.invalid'});const mail=await json('local-mail/'+auth.challengeId);await json('auth/verify',{challengeId:auth.challengeId,code:mail.code});
 const reading=await json('readings',{name:'가상검증',date:'1995-05-15',calendar:'solar',leap:false,time:'10:30',sex:'female',place:'KR',age:'19+',self:true,consent:true});
 const order=await json('orders',{readingId:reading.id,consent:{terms:true,privacy:true,withdrawal:true,confirmedBirth:true,buyerAdult:true}});const p=await json('payments/authenticate',{orderId:order.id});await json('payments/confirm',{orderId:order.id,paymentKey:p.paymentKey,amount:22000});
 let ready=false;for(let i=0;i<80;i++){if((await json('orders/'+order.id)).fulfillment==='ready'){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Worker did not publish synthetic report');
 const report=await json('reports/'+order.id);const pdf=Buffer.from(await(await call('reports/'+order.id+'/pdf')).arrayBuffer());assert.equal(pdf.subarray(0,4).toString(),'%PDF');assert.ok(pdf.length>2000);
 fs.writeFileSync(file,JSON.stringify({cookie,order:order.id,hash:digest(report)}),{mode:0o600});
}else if(phase==='after'){
 const old=JSON.parse(fs.readFileSync(file,'utf8'));cookie=old.cookie;assert.equal((await json('orders/'+old.order)).payment,'paid');assert.equal(digest(await json('reports/'+old.order)),old.hash);fs.unlinkSync(file);
}else throw Error('Invalid phase');
console.log('synthetic-runtime-verified');
`;
async function healthy() {
  for (let i = 0; i < 20; i++) {
    try {
      docker(["exec", "-T", "web", "node", "dist/runtime-health.js", "web"]);
      docker([
        "exec",
        "-T",
        "worker",
        "node",
        "dist/runtime-health.js",
        "worker",
      ]);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw Error("RUNTIME_NOT_HEALTHY");
}
try {
  await healthy();
  docker(
    ["exec", "-T", "web", "node", "--input-type=module", "-", "before"],
    journey,
  );
  for (const service of ["web", "worker"]) {
    docker([
      "exec",
      "-T",
      service,
      "node",
      "-e",
      `const f=require('node:fs');if(process.getuid()===0)process.exit(1);for(const k of ['OPENAI_API_KEY','TOSS_TEST_SECRET_KEY','TOSS_TEST_CLIENT_KEY'])if(process.env[k])process.exit(2);try{f.writeFileSync('/app/write-probe','x');process.exit(3)}catch(e){if(e.code!=='EROFS'&&e.code!=='EACCES')process.exit(4)}console.log('restricted-runtime-ok')`,
    ]);
  }
  docker(["restart", "web", "worker"]);
  await healthy();
  docker(
    ["exec", "-T", "web", "node", "--input-type=module", "-", "after"],
    journey,
  );
  const result = {
    syntheticOnly: true,
    mode: "local-mock",
    orderPrice: 22000,
    pdfValid: true,
    reportUnchangedAfterRestart: true,
    persistentDatabase: true,
    nonRoot: true,
    readOnly: true,
    noProviderCredentials: true,
    webProbe: true,
    workerProbe: true,
    verification: "inside-container-api",
    hostLoopbackHttp: true,
  };
  writeFileSync(
    "docs/local-runtime-test.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} catch {
  console.error(
    "LOCAL_RUNTIME_TEST_FAILED (details and synthetic credentials suppressed)",
  );
  process.exitCode = 1;
}
