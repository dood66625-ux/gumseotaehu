/** Offline encrypted Resend key handoff. Saving never enables mail or provider requests. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
function validateResendKey(value) {
  if (typeof value !== "string" || !/^re_[A-Za-z0-9_-]{8,256}$/.test(value))
    throw Error("RESEND_KEY_FORMAT_REQUIRED");
  return "resend";
}
function location(workspace) {
  const root = path.resolve(workspace);
  if (fs.realpathSync(root) !== root) throw Error("UNSAFE_WORKSPACE");
  const target = path.join(root, ".env.local");
  if (
    spawnSync("git", ["check-ignore", "-q", ".env.local"], { cwd: root })
      .status !== 0 ||
    spawnSync("git", ["ls-files", "--error-unmatch", ".env.local"], {
      cwd: root,
      stdio: "ignore",
    }).status === 0
  )
    throw Error("ENV_MUST_BE_IGNORED_AND_UNTRACKED");
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error("UNSAFE_ENV_TARGET");
  return { root, target };
}
function privateDir(root) {
  for (const part of ["var", "var/resend-key-import"]) {
    const dir = path.join(root, part);
    if (
      fs.existsSync(dir) &&
      (!fs.lstatSync(dir).isDirectory() || fs.lstatSync(dir).isSymbolicLink())
    )
      throw Error("UNSAFE_PRIVATE_DIRECTORY");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (fs.realpathSync(dir) !== dir) throw Error("UNSAFE_PRIVATE_DIRECTORY");
    fs.chmodSync(dir, 0o700);
  }
  return path.join(root, "var/resend-key-import");
}
export function prepareResendKeyForm(workspace, output) {
  const { root } = location(workspace),
    dir = privateDir(root),
    destination = path.resolve(output);
  if (fs.existsSync(destination)) throw Error("FORM_ALREADY_EXISTS");
  const id = crypto.randomUUID(),
    aad = "gumseo-resend-send-only:" + id;
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 4096,
  });
  const { kty, n, e } = publicKey.export({ format: "jwk" });
  const script = `const jwk=${JSON.stringify({ kty, n, e })};const setupId=${JSON.stringify(id)};const aad=${JSON.stringify(aad)};const status=document.querySelector('#status');const button=document.querySelector('button');const secret=document.querySelector('#secret');const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a)));button.onclick=async()=>{button.disabled=true;let bytes,rawKey;try{if(!document.querySelector('#consent').checked){status.textContent='비공개 설정 저장 동의에 체크해주세요.';return;}if(!/^re_[A-Za-z0-9_-]{8,256}$/.test(secret.value.trim())){status.textContent='re_로 시작하는 Resend 키 전체를 넣어주세요. 키 값은 채팅에 보내지 마세요.';return;}bytes=new TextEncoder().encode(JSON.stringify({apiKey:secret.value.trim(),allowWriteEnvLocal:true}));const rsa=await crypto.subtle.importKey('jwk',jwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);rawKey=new Uint8Array(await crypto.subtle.exportKey('raw',aes));const wrappedKey=await crypto.subtle.encrypt({name:'RSA-OAEP'},rsa,rawKey);const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad),tagLength:128},aes,bytes);secret.value='';const envelope={version:1,setupId,algorithm:'RSA-OAEP-256+A256GCM',wrappedKey:b64(wrappedKey),iv:b64(iv),ciphertext:b64(ciphertext)};const url=URL.createObjectURL(new Blob([JSON.stringify(envelope)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gumseo-resend-key.encrypted.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status.textContent='저장한 gumseo-resend-key.encrypted.json 파일만 원래 대화에 첨부해주세요.';}catch{status.textContent='암호화하지 못했습니다. Chrome 또는 Edge에서 다운로드한 파일을 직접 열어주세요. 키 값은 채팅에 보내지 마세요.';}finally{bytes?.fill(0);rawKey?.fill(0);button.disabled=false;}};`;
  const hash = crypto.createHash("sha256").update(script).digest("base64");
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>금서태후 · 이메일 키</title><style>body{max-width:560px;margin:7vh auto;padding:24px;background:#171511;color:#f5ead3;font:17px/1.7 system-ui}h1{font-size:25px}input[type=password],button{display:block;box-sizing:border-box;width:100%;padding:14px;margin:12px 0 20px;border-radius:8px;font-size:16px}input[type=password]{background:#24201a;color:white;border:1px solid #bfa77a}button{background:#e2c38a;border:0;font-weight:bold}small{color:#c9c0ae}label{display:block}</style><h1>금서태후 · Resend 키 연결</h1><p>mail.gumseo.kr용 <strong>Sending access</strong> 키를 복사해주세요. 이 파일은 인터넷으로 키를 보내지 않고 컴퓨터 안에서 암호화합니다.</p><label for="secret">Resend API 키 · re_</label><input type="password" id="secret" maxlength="512" autocomplete="off" spellcheck="false"><label><input id="consent" type="checkbox"> 이 Resend 키를 금서태후 프로젝트의 Git 제외 비공개 .env.local 설정에 저장하는 데 동의합니다.</label><p><small>실제 메일 발송은 활성화하지 않습니다. 키 형식 확인만으로 권한·도메인·실제 수신 성공을 검증할 수는 없습니다.</small></p><button type="button">암호화 파일 저장</button><p id="status" role="status" aria-live="polite"></p><small>내려받은 JSON 파일만 원래 대화에 첨부하세요. 키 원문이나 입력 화면 캡처는 보내지 마세요.</small><script>${script}</script></html>`;
  fs.writeFileSync(
    path.join(dir, id + ".pem"),
    privateKey.export({ type: "pkcs8", format: "pem" }),
    { mode: 0o600, flag: "wx" },
  );
  fs.writeFileSync(
    path.join(dir, id + ".json"),
    JSON.stringify({
      id,
      aad,
      created: Date.now(),
      target: ".env.local",
      purpose: "resend-send-only",
    }),
    { mode: 0o600, flag: "wx" },
  );
  fs.writeFileSync(destination, html, { mode: 0o600, flag: "wx" });
  return { created: true, path: destination, setupId: id };
}
function bytes(value, expected, max = 8192) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw Error("INVALID_ENVELOPE");
  const b = Buffer.from(value, "base64");
  if (
    b.toString("base64") !== value ||
    (expected !== null && b.length !== expected)
  )
    throw Error("INVALID_ENVELOPE");
  return b;
}
export function importResendKeyFile(workspace, encryptedFile) {
  const { root, target } = location(workspace),
    dir = privateDir(root);
  let temp, rawKey, plaintext;
  try {
    if (fs.statSync(encryptedFile).size > 16384)
      throw Error("ENVELOPE_TOO_LARGE");
    const e = JSON.parse(fs.readFileSync(encryptedFile, "utf8"));
    if (
      e.version !== 1 ||
      e.algorithm !== "RSA-OAEP-256+A256GCM" ||
      typeof e.setupId !== "string" ||
      !/^[-a-f0-9]{36}$/.test(e.setupId)
    )
      throw Error("INVALID_ENVELOPE");
    const metaPath = path.join(dir, e.setupId + ".json"),
      pemPath = path.join(dir, e.setupId + ".pem");
    for (const f of [metaPath, pemPath])
      if (!fs.lstatSync(f).isFile() || fs.lstatSync(f).isSymbolicLink())
        throw Error("UNSAFE_SETUP_FILE");
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    if (
      meta.id !== e.setupId ||
      meta.purpose !== "resend-send-only" ||
      meta.target !== ".env.local" ||
      meta.aad !== "gumseo-resend-send-only:" + e.setupId
    )
      throw Error("SETUP_MISMATCH");
    rawKey = crypto.privateDecrypt(
      {
        key: fs.readFileSync(pemPath),
        oaepHash: "sha256",
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      bytes(e.wrappedKey, 512),
    );
    if (rawKey.length !== 32) throw Error("INVALID_ENVELOPE");
    const cipher = bytes(e.ciphertext, null);
    if (cipher.length < 17 || cipher.length > 4096)
      throw Error("INVALID_ENVELOPE");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      rawKey,
      bytes(e.iv, 12),
    );
    decipher.setAAD(Buffer.from(meta.aad));
    decipher.setAuthTag(cipher.subarray(-16));
    plaintext = Buffer.concat([
      decipher.update(cipher.subarray(0, -16)),
      decipher.final(),
    ]);
    const data = JSON.parse(plaintext.toString("utf8"));
    if (
      !data ||
      Array.isArray(data) ||
      Object.keys(data).sort().join(",") !== "allowWriteEnvLocal,apiKey" ||
      data.allowWriteEnvLocal !== true ||
      validateResendKey(data.apiKey) !== "resend"
    )
      throw Error("RESEND_KEY_AND_CONSENT_REQUIRED");
    // Recheck paths after decryption; preserve every unrelated setting, especially encryption/auth keys.
    location(root);
    const before = fs.lstatSync(target),
      original = fs.readFileSync(target, "utf8");
    if (
      !/^APP_MODE=local\s*$/m.test(original) ||
      !/^EXTERNAL_EFFECTS=disabled\s*$/m.test(original)
    )
      throw Error("LOCAL_DISABLED_MODE_REQUIRED");
    const values = {
      RESEND_API_KEY: data.apiKey,
    };
    const seen = new Set();
    const lines = original
      .split(/\r?\n/)
      .filter((line) => {
        const name = line.match(/^\s*(?:export\s+)?(RESEND_API_KEY)\s*=/)?.[1];
        if (!name) return true;
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .map((line) => {
        const name = line.match(/^\s*(?:export\s+)?(RESEND_API_KEY)\s*=/)?.[1];
        return name ? name + "=" + values[name] : line;
      });
    for (const name of Object.keys(values))
      if (!seen.has(name)) lines.push(name + "=" + values[name]);
    temp = target + ".resend-key-" + crypto.randomUUID();
    const fd = fs.openSync(temp, "wx", 0o600);
    try {
      fs.writeFileSync(fd, lines.join("\n").replace(/\n*$/, "\n"));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    const current = fs.lstatSync(target);
    if (
      current.isSymbolicLink() ||
      current.ino !== before.ino ||
      current.mtimeMs !== before.mtimeMs ||
      current.size !== before.size
    )
      throw Error("ENV_CHANGED_DURING_IMPORT");
    fs.renameSync(temp, target);
    temp = undefined;
    fs.chmodSync(target, 0o600);
    for (const f of [metaPath, pemPath]) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
    return {
      saved: true,
      target: ".env.local",
      kind: "resend",
      externalEffectsEnabled: false,
      credentialValidityVerified: false,
    };
  } finally {
    rawKey?.fill(0);
    plaintext?.fill(0);
    if (temp)
      try {
        fs.unlinkSync(temp);
      } catch {}
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    const [command, file] = process.argv.slice(2);
    if (!file || !["prepare", "import"].includes(command)) throw Error("USAGE");
    console.log(
      JSON.stringify(
        command === "prepare"
          ? prepareResendKeyForm(process.cwd(), file)
          : importResendKeyFile(process.cwd(), file),
      ),
    );
  } catch {
    console.error(
      "RESEND_KEY_SETUP_FAILED: secret values suppressed; no provider request made.",
    );
    process.exitCode = 1;
  }
}
