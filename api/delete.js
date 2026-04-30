import { createHmac, createHash } from "crypto";

function hmacSha256(key, data) {
  return createHmac("sha256", key).update(data).digest();
}
function sha256hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const R2_ACC    = process.env.R2_ACCOUNT_ID;
  const R2_KEY    = process.env.R2_ACCESS_KEY;
  const R2_SEC    = process.env.R2_SECRET_KEY;
  const R2_PUBLIC = process.env.R2_PUBLIC;
  if (!R2_ACC || !R2_KEY || !R2_SEC) return res.status(500).json({ error: "R2 not configured" });

  let body;
  try { body = req.body; } catch { return res.status(400).json({ error: "Bad body" }); }
  const { url } = body || {};
  if (!url || !url.startsWith(R2_PUBLIC)) return res.status(400).json({ error: "Invalid URL" });

  const key = url.slice(R2_PUBLIC.length + 1);
  const host = `${R2_ACC}.r2.cloudflarestorage.com`;
  const endpoint = `https://${host}/panorama/${key}`;

  const now = new Date();
  const ds  = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amz = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const payloadHash   = sha256hex("");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders =
    `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amz}\n`;
  const canonicalRequest =
    `DELETE\n/panorama/${key}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${ds}/auto/s3/aws4_request`;
  const stringToSign =
    `AWS4-HMAC-SHA256\n${amz}\n${scope}\n${sha256hex(canonicalRequest)}`;

  const kDate    = hmacSha256("AWS4" + R2_SEC, ds);
  const kRegion  = hmacSha256(kDate, "auto");
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const sig = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${R2_KEY}/${scope},SignedHeaders=${signedHeaders},Signature=${sig}`;

  const r2res = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amz,
      "Authorization": authHeader,
    },
  });

  if (r2res.ok || r2res.status === 204 || r2res.status === 404) {
    return res.status(200).json({ ok: true });
  }
  return res.status(502).json({ error: "R2 DELETE failed: " + r2res.status });
}