import { createHmac, createHash } from "crypto";

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function hmacSha256(key, data) {
  return createHmac("sha256", key).update(data).digest();
}
function sha256hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const R2_ACC = process.env.R2_ACCOUNT_ID;
  const R2_KEY = process.env.R2_ACCESS_KEY;
  const R2_SEC = process.env.R2_SECRET_KEY;
  const R2_PUBLIC = process.env.R2_PUBLIC;
  if (!R2_ACC || !R2_KEY || !R2_SEC) return res.status(500).json({ error: "R2 not configured" });

  // Parse multipart form manually (find file boundary)
  const raw = await getRawBody(req);
  const ct = req.headers["content-type"] || "";
  const boundaryMatch = ct.match(/boundary=(.+)/);
  if (!boundaryMatch) return res.status(400).json({ error: "No boundary" });

  const boundary = "--" + boundaryMatch[1];
  const parts = raw.toString("binary").split(boundary).slice(1, -1);

  let fileBuffer = null, fileName = "upload.jpg", fileMime = "image/jpeg", folder = "dishes";

  for (const part of parts) {
    const [headerRaw, ...bodyParts] = part.split("\r\n\r\n");
    const body = bodyParts.join("\r\n\r\n").replace(/\r\n$/, "");
    const headers = headerRaw.toLowerCase();
    if (headers.includes('name="folder"')) {
      folder = body.trim();
    } else if (headers.includes('name="file"')) {
      const mimeMatch = headerRaw.match(/Content-Type:\s*([^\r\n]+)/i);
      if (mimeMatch) fileMime = mimeMatch[1].trim();
      const nameMatch = headerRaw.match(/filename="([^"]+)"/i);
      if (nameMatch) fileName = nameMatch[1];
      fileBuffer = Buffer.from(body, "binary");
    }
  }

  if (!fileBuffer) return res.status(400).json({ error: "No file found" });

  const ext = (fileName.split(".").pop() || "jpg").toLowerCase();
  const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const host = `${R2_ACC}.r2.cloudflarestorage.com`;
  const endpoint = `https://${host}/panorama/${key}`;

  const now = new Date();
  const ds = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amz = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const payloadHash = sha256hex(fileBuffer);
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders =
    `content-type:${fileMime}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amz}\n`;
  const canonicalRequest =
    `PUT\n/panorama/${key}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
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
    method: "PUT",
    headers: {
      "Content-Type": fileMime,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amz,
      "Authorization": authHeader,
    },
    body: fileBuffer,
  });

  if (!r2res.ok) {
    const t = await r2res.text().catch(() => "");
    return res.status(502).json({ error: `R2 ${r2res.status}: ${t.slice(0, 200)}` });
  }

  return res.status(200).json({ url: `${R2_PUBLIC}/${key}` });
}