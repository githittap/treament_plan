const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync('supabase/functions/contract-pdf-sign/index.ts', 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^if \(import\.meta\.main\).*;\r?\n?/m, '')
  .replace('export function createContractPdfSignHandler', 'function createContractPdfSignHandler');
const context = { crypto: webcrypto, TextEncoder, TextDecoder, Request, Response, atob, Uint8Array, DataView, Date, Blob, Error };
vm.runInNewContext(`${stripTypeScriptTypes(source)}\nthis.createHandler=createContractPdfSignHandler;`, context);

async function edgeSigningAttempt(confirmed = [true, true, true], integrated = true, options = {}) {
  const userId = '11111111-1111-1111-1111-111111111111';
  let sourceBytes = new TextEncoder().encode('%PDF-1.4\nsource');
  if(options.PDFDocument){const doc=await options.PDFDocument.create();doc.addPage([600,800]);sourceBytes=await doc.save();}
  const sha256 = async bytes => Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const sourceHash = await sha256(sourceBytes);
  const png = Buffer.alloc(40);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.write('IHDR', 12);
  png.writeUInt32BE(40, 16);
  png.writeUInt32BE(20, 20);
  const signaturePng = options.signaturePng || `data:image/png;base64,${png.toString('base64')}`;
  const parts = ['employment', 'medical', 'privacy'];
  const body = integrated || options.pledgeRequired ? {
    contract_id: 3,
    signatures: (integrated ? parts : ['employment']).map((part, i) => ({ part, signature_png: signaturePng, signature_id: null, ...(confirmed[i] === undefined ? {} : { confirmed: confirmed[i] }) })),
    coordinates: (integrated ? parts : ['employment']).map(part => ({ part, page_no: 1, x: 72, y: 72, width: 150, height: 50 })),
  } : { contract_id: 3, signature_png: signaturePng, signature_id: null, page_no: 1, x: 72, y: 72, width: 150, height: 50 };
  const mergedHtml = integrated ? parts.map(part => `<span data-sign-slot="${part}"></span>`).join('') : '<span data-sign-slot="employee"></span>';
  const rpcCalls = [];
  const preflight = {
    id: 3, user_id: userId, status: '대기', merged_html: mergedHtml,
    integrated_signature_required: integrated,
    source_pdf_path: 'contracts/3/source.pdf', source_pdf_sha256: sourceHash,
    source_pdf_confirmed_at: '2026-09-25', sent_at: '2026-09-25',
    source_pdf_version: 'v1', due_at: '2099-01-01',
    ...(options.pledgeRequired ? {pledge_required:true} : {}),
  };
  const pledge=options.pledge===null?null:{contract_id:3,user_id:userId,document:options.document||{},version:'fixture-v1',staged_at:'2026-10-03',signed_at:'2026-10-03',read_confirmed:true,rules_confirmed:true,signature_png:signaturePng,contract_signatures:JSON.parse(JSON.stringify(body.signatures||[])),pdf_coordinates:JSON.parse(JSON.stringify(body.coordinates||[])),...(options.pledge||{})};
  Object.assign(body,options.body||{});
  if(options.validate)Object.assign(body,{action:'validate_pledge',pledge_signature_png:signaturePng});
  if(options.tamperSignature)body.signatures[0].signature_png='data:image/png;base64,invalid';
  let uploadedBytes=null;
  const userClient = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: preflight, error: null }) }) }) }),
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      return { data: { ...preflight, pdf_signing_attempt_id: '00000000-0000-0000-0000-000000000003', pdf_signing_signature_sha256: params.p_signature_sha256, pdf_signing_page_no: params.p_page_no, pdf_signing_x: params.p_x, pdf_signing_y: params.p_y, pdf_signing_width: params.p_width, pdf_signing_height: params.p_height }, error: null };
    },
  };
  const admin = {
    from: () => ({select:()=>({eq:()=>({maybeSingle:async()=>({data:pledge,error:null})})})}),
    storage: { from: () => ({ download: async () => ({ data: new Blob([sourceBytes]), error: null }), upload: async (_path,bytes) => {uploadedBytes=bytes;return {error:null};} }) },
    rpc: async (name, params) => { rpcCalls.push({ name, params }); return { error: null }; },
  };
  let appendedPages=0;
  const page = { getRotation: () => ({ angle: 0 }), getWidth: () => 600, getHeight: () => 800, drawImage: () => {},setSize:()=>{},drawText:()=>{} };
  const pdf = { getPageCount: () => 1, getPage: () => page, embedPng: async () => {if(options.invalidImage)throw Error('PNG cannot be decoded');return {};},save: async () => sourceBytes,registerFontkit:()=>{},embedFont:async()=>({widthOfTextAtSize:s=>String(s).length*5}),addPage:()=>{appendedPages++;return page;} };
  const handler = context.createHandler({ createClient: (_url, key) => key === 'service' ? admin : userClient, PDFDocument: options.PDFDocument||{ load: async () => pdf }, fontkit:options.fontkit||{},pledgeFont:options.pledgeFont||'AA==',env: name => ({ SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon' })[name] });
  const response = await handler(new Request('https://example.invalid/sign', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(body) }));
  return { response: await response.json(), status: response.status, rpcCalls: JSON.parse(JSON.stringify(rpcCalls)), body,uploadedBytes,appendedPages };
}

module.exports = { edgeSigningAttempt };
