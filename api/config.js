export default function handler(req, res) {
    // Only allow GET
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }
  
    // Only serve config to same-origin requests (basic check)
    const origin = req.headers.origin || "";
    const host   = req.headers.host   || "";
    const referer= req.headers.referer|| "";
  
    // Block requests from outside your domain
    // Replace "your-domain.vercel.app" with your real domain after deploy
    const allowed = process.env.ALLOWED_ORIGIN || "";
    if (allowed && origin && !origin.includes(allowed) && !referer.includes(allowed)) {
      return res.status(403).json({ error: "Forbidden" });
    }
  
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      FIREBASE_API_KEY:            process.env.FIREBASE_API_KEY,
      FIREBASE_AUTH_DOMAIN:        process.env.FIREBASE_AUTH_DOMAIN,
      FIREBASE_DATABASE_URL:       process.env.FIREBASE_DATABASE_URL,
      FIREBASE_PROJECT_ID:         process.env.FIREBASE_PROJECT_ID,
      FIREBASE_STORAGE_BUCKET:     process.env.FIREBASE_STORAGE_BUCKET,
      FIREBASE_MESSAGING_SENDER_ID:process.env.FIREBASE_MESSAGING_SENDER_ID,
      FIREBASE_APP_ID:             process.env.FIREBASE_APP_ID,
      R2_PUBLIC:                   process.env.R2_PUBLIC,
      R2_ACCOUNT_ID:               process.env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY:               process.env.R2_ACCESS_KEY,
      R2_SECRET_KEY:               process.env.R2_SECRET_KEY,
    });
  }