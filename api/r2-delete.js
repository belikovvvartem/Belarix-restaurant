/**
 * /api/r2-delete
 * Server-side proxy for deleting files from Cloudflare R2.
 * R2 credentials stay in Vercel env vars and never reach the browser.
 *
 * Request body (JSON):
 *   { url: "https://pub-xxx.r2.dev/dishes/filename.jpg" }
 *
 * Response:
 *   { ok: true }
 *
 * Required env vars:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_PUBLIC
 */

const crypto = require("crypto");

function hmac(key, data) {
  const k = Buffer.isBuffer(key) ? key : Buffer.from(key, "utf8");
  return crypto.createHmac("sha256", k).update(data).digest();
}

function sha256hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const R2_ACC = process.env.R2_ACCOUNT_ID;
  const R2_KEY = process.env.R2_ACCESS_KEY;
  const R2_SEC = process.env.R2_SECRET_KEY;
  const R2_PUB = process.env.R2_PUBLIC;

  if (!R2_ACC || !R2_KEY || !R2_SEC || !R2_PUB) {
    return res.status(500).json({ error: "R2 not configured on server" });
  }

  const { url } = req.body || {};
  if (!url || !String(url).startsWith(R2_PUB)) {
    return res.status(400).json({ error: "Invalid or missing URL" });
  }

  const key  = String(url).slice(R2_PUB.length).replace(/^\//, "");
  const host = `${R2_ACC}.r2.cloudflarestorage.com`;

  // AWS Signature Version 4
  const now   = new Date();
  const ds    = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amz   = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  // SHA-256 of empty body
  const ph    = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const sh    = "host;x-amz-content-sha256;x-amz-date";
  const ch    = `host:${host}\nx-amz-content-sha256:${ph}\nx-amz-date:${amz}\n`;
  const cr    = `DELETE\n/panorama/${key}\n\n${ch}\n${sh}\n${ph}`;
  const scope = `${ds}/auto/s3/aws4_request`;
  const crh   = sha256hex(cr);
  const sts   = `AWS4-HMAC-SHA256\n${amz}\n${scope}\n${crh}`;

  const kd  = hmac("AWS4" + R2_SEC, ds);
  const kr  = hmac(kd,  "auto");
  const ks  = hmac(kr,  "s3");
  const kx  = hmac(ks,  "aws4_request");
  const sig = crypto.createHmac("sha256", kx).update(sts).digest("hex");
  const authH = `AWS4-HMAC-SHA256 Credential=${R2_KEY}/${scope},SignedHeaders=${sh},Signature=${sig}`;

  try {
    const r2Res = await fetch(`https://${host}/panorama/${key}`, {
      method: "DELETE",
      headers: {
        "x-amz-content-sha256": ph,
        "x-amz-date":           amz,
        "Authorization":        authH,
      },
    });

    // 204 = deleted, 404 = already gone — both are fine
    if (r2Res.ok || r2Res.status === 204 || r2Res.status === 404) {
      return res.status(200).json({ ok: true });
    }

    const text = await r2Res.text().catch(() => "");
    return res.status(500).json({ error: `R2 ${r2Res.status}: ${text.slice(0, 200)}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};