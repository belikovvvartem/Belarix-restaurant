export default function handler(req, res) {
    if (req.method !== "GET") return res.status(405).end();
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
      // R2_SECRET_KEY intentionally NOT exposed to client
    });
  }