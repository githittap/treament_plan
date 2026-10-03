import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import pledgeFont from "./pledge-font.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(bytes: Uint8Array) {
  const owned = new Uint8Array(bytes.byteLength); owned.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer);
  return Array.from(new Uint8Array(digest)).map((v) => v.toString(16).padStart(2, "0")).join("");
}

function dataUrlBytes(value: string) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ""));
  if (!match) throw new Error("signature_png must be a PNG data URL");
  const raw = atob(match[1]);
  if (raw.length < 33 || raw.length > 512 * 1024) throw new Error("signature PNG size is invalid");
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const png = [137,80,78,71,13,10,26,10];
  if (!png.every((v, i) => bytes[i] === v) || new TextDecoder().decode(bytes.slice(12, 16)) !== "IHDR") throw new Error("invalid signature PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const imageWidth = view.getUint32(16), imageHeight = view.getUint32(20);
  if (!imageWidth || !imageHeight || imageWidth > 2048 || imageHeight > 2048) throw new Error("signature PNG dimensions are invalid");
  let offset = 8, hasIdat = false, hasEnd = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('invalid signature PNG chunks');
    const length = view.getUint32(offset), end = offset + 12 + length;
    if (end > bytes.length) throw new Error('invalid signature PNG chunk length');
    const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    if ((offset === 8 && (type !== 'IHDR' || length !== 13)) || (offset > 8 && type === 'IHDR')) throw new Error('invalid signature PNG IHDR');
    let crc = 0xffffffff;
    for (let i = offset + 4; i < offset + 8 + length; i++) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(offset + 8 + length)) throw new Error('invalid signature PNG CRC');
    if (type === 'IDAT' && length > 0) hasIdat = true;
    if (type === 'IEND') {
      if (length !== 0 || end !== bytes.length || !hasIdat) throw new Error('invalid signature PNG IEND');
      hasEnd = true;
    }
    offset = end;
  }
  if (!hasEnd) throw new Error('invalid signature PNG: missing IEND');
  return bytes;
}

async function validatePngCompression(bytes: Uint8Array) {
  // Reject broken zlib before entering pdf-lib's synchronous PNG decoder.
  // Bound expanded data even when a tiny, valid IDAT is highly compressed.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), chunks: Uint8Array[] = [];
  let offset = 8, total = 0;
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    if (new TextDecoder().decode(bytes.slice(offset + 4, offset + 8)) === 'IDAT') {
      const chunk = bytes.slice(offset + 8, offset + 8 + length); chunks.push(chunk); total += length;
    }
    offset += length + 12;
  }
  const compressed = new Uint8Array(total); offset = 0;
  for (const chunk of chunks) { compressed.set(chunk, offset); offset += chunk.length; }
  const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let expanded = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      expanded += value.length;
      if (expanded > 40 * 1024 * 1024) throw new Error('signature PNG expanded size is invalid');
    }
    if (expanded === 0) throw new Error('signature PNG has no pixels');
  } finally { await reader.cancel(); }
}

async function appendSecurityPledge(pdf: any, pledge: any, kit: any, fontData: string) {
  const contractPages = pdf.getPages().slice();
  pdf.registerFontkit(kit);
  const font = await pdf.embedFont(Uint8Array.from(atob(fontData), c => c.charCodeAt(0)), { subset: true });
  const size = 10, lineHeight = 16, margin = 42, maxWidth = 511;
  const newPage = () => { const p = pdf.addPage(); p.setSize(595, 842); return p; };
  let page = newPage(), y = 800;
  const line = (value: string) => {
    if (y < 65) { page = newPage(); y = 800; }
    page.drawText(value, { x: margin, y, size, font }); y -= lineHeight;
  };
  const paragraph = (text: string) => {
    for (const raw of String(text).split(/\r?\n/)) {
      let current = "";
      for (const c of raw) {
        if (font.widthOfTextAtSize(current + c, size) > maxWidth) { line(current); current = ""; }
        current += c;
      }
      line(current);
    }
    y -= 8;
  };
  paragraph(pledge.document["pledge.body.title"]);
  for (let i = 1; i <= 14; i++) paragraph(`${i}. ${pledge.document[`pledge.body.clause.${i}`]}`);
  paragraph(pledge.document["pledge.body.rules"]);
  paragraph(String(pledge.document['pledge.signed_meta'] || '{date} · {version}').replace('{date}',pledge.signed_at||'').replace('{version}',pledge.version));
  if (y < 130) { page = newPage(); y = 800; }
  const pledgeBytes = dataUrlBytes(pledge.signature_png);
  await validatePngCompression(pledgeBytes);
  const image = await pdf.embedPng(pledgeBytes);
  page.drawImage(image, { x: margin, y: y - 60, width: 240, height: 60 });
  const pledgePages = pdf.getPages().slice(contractPages.length);
  for (let i = pdf.getPageCount() - 1; i >= 0; i--) pdf.removePage(i);
  for (const item of [...pledgePages, ...contractPages]) pdf.addPage(item);
}

export function createContractPdfSignHandler(deps: { createClient?: any; PDFDocument?: any; fontkit?: any; pledgeFont?: string; env?: (name: string) => string | undefined } = {}) {
  const supabaseCreateClient = deps.createClient ?? createClient;
  const PdfDocument = deps.PDFDocument ?? PDFDocument;
  const readEnv = deps.env ?? ((name: string) => Deno.env.get(name));
  return async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const authHeader = req.headers.get("Authorization");
  const url = readEnv("SUPABASE_URL");
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = readEnv("SUPABASE_ANON_KEY");
  if (!authHeader || !url || !serviceKey || !anonKey) return json({ error: "server configuration unavailable" }, 500);
  const userClient = supabaseCreateClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const admin = supabaseCreateClient(url, serviceKey);
  try {
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("authenticated employee required");
    const body = await req.json();
    const validatePledge = body.action === 'validate_pledge';
    const validatePledgeSignature = body.action === 'validate_pledge_signature';
    if (body.action && !validatePledge && !validatePledgeSignature) throw new Error('unknown signing action');
    const contractId = Number(body.contract_id);
    if (!Number.isInteger(contractId) || contractId < 1) throw new Error("invalid contract id");
    if (validatePledgeSignature) {
      // Legacy completed contracts may be outside the contracts SELECT time window.
      // The own pledge record and the service RPC enforce identity without exposing a body.
      const { data: pledge, error } = await admin.from('contract_security_pledges').select('*').eq('contract_id', contractId).maybeSingle();
      if (error || !pledge || pledge.user_id !== user.id || pledge.version !== body.version) throw new Error('own pledge version required');
      const image = dataUrlBytes(body.signature_png), proofPdf = await PdfDocument.create();
      await validatePngCompression(image);
      await proofPdf.embedPng(image);
      await proofPdf.save();
      let previousInvalid = false;
      if (body.recover === true) {
        if (!pledge.signed_at) throw new Error('signed pledge required for recovery');
        try { const previous = dataUrlBytes(pledge.signature_png); await validatePngCompression(previous); await proofPdf.embedPng(previous); }
        catch { previousInvalid = true; }
        if (!previousInvalid) throw new Error('signed pledge image is valid and immutable');
      }
      const { error: validationError } = await admin.rpc('validate_contract_security_pledge_signature', {
        p_contract_id: contractId, p_user_id: user.id, p_signature_png: body.signature_png, p_version: body.version,
        p_previous_signature_png: previousInvalid ? pledge.signature_png : null, p_previous_invalid: previousInvalid,
      });
      if (validationError) throw new Error(validationError.message);
      return json({ contract_id: contractId, validated: true, previous_invalid: previousInvalid });
    }
    const { data: preflight, error: preflightError } = await userClient.from("contracts").select("*").eq("id", contractId).maybeSingle();
    if (preflightError || !preflight || preflight.user_id !== user.id) throw new Error(preflightError?.message || "contract access denied");
    if (preflight.status === "서명완료" && preflight.signed_pdf_path && preflight.signed_pdf_sha256) return json({ contract_id: contractId, signed_pdf_path: preflight.signed_pdf_path, signed_pdf_sha256: preflight.signed_pdf_sha256, idempotent: true });
    if (preflight.status !== "대기" || preflight.signed_at || preflight.signed_pdf_path || !preflight.source_pdf_path || !preflight.source_pdf_sha256) throw new Error("contract is not signable");
    if (!preflight.source_pdf_confirmed_at || !preflight.sent_at || !preflight.source_pdf_version || !preflight.due_at || new Date(preflight.due_at).getTime() < Date.now()) throw new Error("employee must confirm the source PDF and final send first");
    const integrated = preflight.integrated_signature_required === true || ["employment", "medical", "privacy"].every((part) => String(preflight.merged_html || "").includes(`data-sign-slot="${part}"`));
    const parts = integrated ? ["employment", "medical", "privacy"] : ["employment"];
    const structured = integrated || preflight.pledge_required === true;
    if (validatePledge && preflight.pledge_required !== true) throw new Error('pledge is not required');
    let securityPledge: any = null;
    if (preflight.pledge_required === true) {
      const { data: pledge, error: pledgeError } = await admin.from("contract_security_pledges").select("*").eq("contract_id", contractId).maybeSingle();
      if (pledgeError || !pledge || pledge.user_id !== user.id || !pledge.staged_at || !pledge.signed_at || new Date(pledge.staged_at).getTime() < new Date(pledge.signed_at).getTime() || pledge.read_confirmed !== true || pledge.rules_confirmed !== true) throw new Error("signed security pledge and confirmations required");
      if (!Array.isArray(pledge.contract_signatures) || pledge.contract_signatures.length !== parts.length) throw new Error('staged contract signatures differ');
      for (const part of parts) {
        const stored = pledge.contract_signatures?.find((s: any) => s.part === part), supplied = body.signatures?.find((s: any) => s.part === part);
        const coord = pledge.pdf_coordinates?.find((c: any) => c.part === part), suppliedCoord = body.coordinates?.find((c: any) => c.part === part);
        if (!stored || !supplied || stored.signature_png !== supplied.signature_png || (stored.signature_id ?? null) !== (supplied.signature_id ?? null) || stored.confirmed !== supplied.confirmed || !suppliedCoord || (!validatePledge && (!coord || ["page_no", "x", "y", "width", "height"].some(k => coord[k] !== suppliedCoord[k])))) throw new Error("staged contract signatures differ");
      }
      if (validatePledge && pledge.signed_at && body.pledge_signature_png !== pledge.signature_png) throw new Error('signed pledge evidence is immutable');
      securityPledge = pledge;
    }
    if (structured && (!Array.isArray(body.signatures) || body.signatures.length !== parts.length || !Array.isArray(body.coordinates) || body.coordinates.length !== parts.length)) throw new Error("one or three independent signatures and coordinates required");
    const entries = structured ? parts.map((part) => {
      const s = Array.isArray(body.signatures) ? body.signatures.find((item: any) => item?.part === part) : null;
      const c = Array.isArray(body.coordinates) ? body.coordinates.find((item: any) => item?.part === part) : null;
      if (!s || !c || body.signatures.filter((item: any) => item?.part === part).length !== 1 || body.coordinates.filter((item: any) => item?.part === part).length !== 1) throw new Error("three independent signatures and coordinates required");
      if (s.confirmed !== true) throw new Error("each contract part must be confirmed");
      return { part, signatureId: s.signature_id == null ? null : Number(s.signature_id), confirmed: true, bytes: dataUrlBytes(s.signature_png), pageNo: Number(c.page_no), x: Number(c.x), y: Number(c.y), width: Number(c.width), height: Number(c.height) };
    }) : [{ part: "employment", signatureId: body.signature_id == null ? null : Number(body.signature_id), bytes: dataUrlBytes(body.signature_png), pageNo: Number(body.page_no), x: Number(body.x), y: Number(body.y), width: Number(body.width), height: Number(body.height) }];
    if (entries.some((e) => (e.signatureId !== null && (!Number.isInteger(e.signatureId) || e.signatureId < 1)) || !Number.isInteger(e.pageNo) || e.pageNo < 1 || [e.x, e.y, e.width, e.height].some((v) => !Number.isFinite(v) || v < 0) || e.width <= 0 || e.height <= 0 || e.width > 1200 || e.height > 800)) throw new Error("invalid PDF signature coordinates");
    const partHashes = await Promise.all(entries.map(async (e) => ({ part: e.part, signature_id: e.signatureId, signature_hash: await sha256(e.bytes), ...(integrated ? { confirmed: true } : {}) })));
    const signatureHash = integrated ? await sha256(new TextEncoder().encode(JSON.stringify({ partHashes, coordinates: entries.map(({ part, pageNo, x, y, width, height }) => ({ part, pageNo, x, y, width, height })) }))) : partHashes[0].signature_hash;
    const signatureId = entries[0].signatureId;
    const { pageNo, x, y, width, height } = entries[0];
    const sourcePath = `contracts/${contractId}/source.pdf`, signedPath = `contracts/${contractId}/signed.pdf`;
    if (preflight.source_pdf_path !== sourcePath) throw new Error("invalid source PDF path");
    const { data: source, error: downloadError } = await admin.storage.from("hr-docs").download(sourcePath);
    if (downloadError || !source) throw new Error("source PDF download failed");
    const sourceBytes = new Uint8Array(await source.arrayBuffer());
    if (sourceBytes.length === 0 || sourceBytes.length > 25 * 1024 * 1024 || new TextDecoder().decode(sourceBytes.slice(0, 5)) !== "%PDF-") throw new Error("source PDF size or header is invalid");
    const sourceHash = await sha256(sourceBytes);
    if (sourceHash !== preflight.source_pdf_sha256) throw new Error("source PDF hash mismatch");
    const pdf = await PdfDocument.load(sourceBytes, { updateMetadata: false });
    if (pdf.getPageCount() > 100) throw new Error("PDF page count is out of range");
    for (const entry of entries) {
      if (entry.pageNo > pdf.getPageCount()) throw new Error("PDF page number is out of range");
      const page = pdf.getPage(entry.pageNo - 1);
      if (page.getRotation().angle !== 0) throw new Error("rotated PDF pages require manual review");
      const pageWidth = page.getWidth(), pageHeight = page.getHeight();
      if (![pageWidth, pageHeight].every((v) => Number.isFinite(v) && v > 0) || entry.x + entry.width > pageWidth || entry.y + entry.height > pageHeight || entry.width > pageWidth * 0.8 || entry.height > pageHeight * 0.5) throw new Error("signature rectangle is outside the PDF page");
      await validatePngCompression(entry.bytes);
      const signature = await pdf.embedPng(entry.bytes);
      page.drawImage(signature, { x: entry.x, y: entry.y, width: entry.width, height: entry.height });
    }
    if (securityPledge) await appendSecurityPledge(pdf, securityPledge, deps.fontkit ?? fontkit, deps.pledgeFont ?? pledgeFont);
    const signedBytes = await pdf.save();
    if (signedBytes.length > 30 * 1024 * 1024) throw new Error("signed PDF is too large");
    const signedHash = await sha256(signedBytes);
    if (validatePledge) {
      const {error: validationError} = await admin.rpc('validate_contract_pledge_pdf', {
        p_contract_id:contractId,p_user_id:user.id,p_signatures:body.signatures,p_coordinates:body.coordinates,
        p_source_sha256:sourceHash,p_pledge_signature_png:securityPledge.signature_png,
        p_signature_sha256:signatureHash,
      });
      if (validationError) throw new Error(validationError.message);
      return json({contract_id:contractId,validated:true});
    }
    const { data: started, error: startError } = await userClient.rpc("begin_contract_pdf_signing", { p_contract_id: contractId, p_signature_sha256: signatureHash, p_page_no: pageNo, p_x: x, p_y: y, p_width: width, p_height: height });
    if (startError || !started) throw new Error(startError?.message || "contract PDF is not ready for signing");
    const contract = Array.isArray(started) ? started[0] : started;
    if (contract.status === "서명완료" && contract.signed_pdf_path && contract.signed_pdf_sha256) return json({ contract_id: contractId, signed_pdf_path: contract.signed_pdf_path, signed_pdf_sha256: contract.signed_pdf_sha256, idempotent: true });
    if (!contract || contract.user_id !== user.id || contract.source_pdf_sha256 !== sourceHash || contract.source_pdf_path !== sourcePath || contract.pdf_signing_signature_sha256 !== signatureHash || contract.pdf_signing_page_no !== pageNo || contract.pdf_signing_x !== x || contract.pdf_signing_y !== y || contract.pdf_signing_width !== width || contract.pdf_signing_height !== height) throw new Error("contract signing state changed; retry with the same PDF and payload");
    const { error: uploadError } = await admin.storage.from("hr-docs").upload(signedPath, signedBytes, { contentType: "application/pdf", upsert: false });
    let finalSignedBytes = signedBytes;
    if (uploadError) {
      const { data: existing, error: existingError } = await admin.storage.from("hr-docs").download(signedPath);
      if (existingError || !existing) throw new Error(`signed PDF upload failed: ${uploadError.message}`);
      finalSignedBytes = new Uint8Array(await existing.arrayBuffer());
      if (await sha256(finalSignedBytes) !== signedHash) throw new Error("existing signed PDF differs from this attempt");
    }
    const finalSignedHash = await sha256(finalSignedBytes);
    const { error: recordError } = await admin.rpc(integrated ? "record_integrated_contract_pdf_signatures" : "record_contract_pdf_signature_with_use", {
      p_contract_id: contractId, p_user_id: user.id, p_attempt_id: contract.pdf_signing_attempt_id, p_source_sha256: sourceHash, p_signed_path: signedPath,
      p_signed_sha256: finalSignedHash, p_signature_sha256: signatureHash, p_page_no: pageNo,
      p_x: x, p_y: y, p_width: width, p_height: height, ...(integrated ? { p_signatures: partHashes } : { p_signature_id: signatureId }),
    });
    if (recordError) throw new Error(`contract signature record failed: ${recordError.message}`);
    return json({ contract_id: contractId, signed_pdf_path: signedPath, signed_pdf_sha256: finalSignedHash });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "contract PDF signing failed" }, 400);
  }
  };
}

if (import.meta.main) Deno.serve(createContractPdfSignHandler());
