import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

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
  return bytes;
}

export function createContractPdfSignHandler(deps: { createClient?: any; PDFDocument?: any; env?: (name: string) => string | undefined } = {}) {
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
    const contractId = Number(body.contract_id);
    if (!Number.isInteger(contractId) || contractId < 1) throw new Error("invalid contract id");
    const { data: preflight, error: preflightError } = await userClient.from("contracts").select("*").eq("id", contractId).maybeSingle();
    if (preflightError || !preflight || preflight.user_id !== user.id) throw new Error(preflightError?.message || "contract access denied");
    if (preflight.status === "서명완료" && preflight.signed_pdf_path && preflight.signed_pdf_sha256) return json({ contract_id: contractId, signed_pdf_path: preflight.signed_pdf_path, signed_pdf_sha256: preflight.signed_pdf_sha256, idempotent: true });
    if (preflight.status !== "대기" || preflight.signed_at || preflight.signed_pdf_path || !preflight.source_pdf_path || !preflight.source_pdf_sha256) throw new Error("contract is not signable");
    if (!preflight.source_pdf_confirmed_at || !preflight.sent_at || !preflight.source_pdf_version || !preflight.due_at || new Date(preflight.due_at).getTime() < Date.now()) throw new Error("employee must confirm the source PDF and final send first");
    const integrated = preflight.integrated_signature_required === true || ["employment", "medical", "privacy"].every((part) => String(preflight.merged_html || "").includes(`data-sign-slot="${part}"`));
    const parts = ["employment", "medical", "privacy"];
    if (integrated && (!Array.isArray(body.signatures) || body.signatures.length !== 3 || !Array.isArray(body.coordinates) || body.coordinates.length !== 3)) throw new Error("three independent signatures and coordinates required");
    const entries = integrated ? parts.map((part) => {
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
      const signature = await pdf.embedPng(entry.bytes);
      page.drawImage(signature, { x: entry.x, y: entry.y, width: entry.width, height: entry.height });
    }
    const signedBytes = await pdf.save();
    if (signedBytes.length > 30 * 1024 * 1024) throw new Error("signed PDF is too large");
    const signedHash = await sha256(signedBytes);
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
