// server/src/routes/uploads.js
import { Router } from "express";
import multer from "multer";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "../utils/supabase.js";

const router = Router();

// Dùng memoryStorage để có req.file.buffer (ổn định với Supabase SDK)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // ≤25MB
});

// ───────────────────────────────────────────────────────────────
// Helpers
function ymdPathUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}
function sanitizeDir(s = "") {
  return s
    .toString()
    .replace(/[^a-zA-Z0-9/_-]/g, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "") || "uploads";
}
function safeName(name = "image.jpg") {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
// ───────────────────────────────────────────────────────────────

/**
 * POST /api/uploads/sb   (multipart field "file")
 * Query:
 *   - ?dir=proofs  → tự động chọn bucket chứng từ (SUPABASE_PROOFS_BUCKET)
 *   - mặc định     → bucket thiết kế (SUPABASE_BUCKET)
 *
 * Key format:  <dir>/<uid>/<YYYY>/<MM>/<DD>/<rand>-<ts>-<filename>
 * Response:    { ok, key, publicUrl?, signedUrl? }
 */
router.post("/sb", upload.single("file"), async (req, res) => {
  try {
    // (tùy) xác thực người dùng
    // if (!req.user?.id) return res.status(401).json({ error: "UNAUTHORIZED" });

    if (!req.file) return res.status(400).json({ error: "MISSING_FILE" });

    // Chọn bucket theo dir:
    // - nếu dir bắt đầu bằng "proofs" → dùng SUPABASE_PROOFS_BUCKET (ví dụ stylesnap-proofs)
    // - ngược lại dùng SUPABASE_BUCKET (ví dụ designs)
    const baseBucket = process.env.SUPABASE_BUCKET || "designs";
    const proofsBucket = process.env.SUPABASE_PROOFS_BUCKET || baseBucket;

    const dir = sanitizeDir(req.query.dir || "designs");
    const bucket = dir.startsWith("proofs") ? proofsBucket : baseBucket;

    const userId = req.user?.id || "anon";

    const rand = randomBytes(6).toString("hex");
    const stamp = Date.now();
    const original = safeName(req.file.originalname || "image.jpg");

    const key = `${dir}/${userId}/${ymdPathUTC()}/${rand}-${stamp}-${original}`;

    // Upload lên Supabase Storage
    const { error: upErr } = await supabaseAdmin.storage
      .from(bucket)
      .upload(key, req.file.buffer, {
        contentType: req.file.mimetype || "application/octet-stream",
        upsert: false,
      });
    if (upErr) return res.status(500).json({ error: upErr.message });

    // Xác định bucket public/private
    let isPublic = false;
    try {
      const { data: info } = await supabaseAdmin.storage.getBucket(bucket);
      isPublic = !!info?.public;
    } catch {
      // fallback: giữ private
      isPublic = false;
    }

    let publicUrl = null;
    let signedUrl = null;

    if (isPublic) {
      // Bucket public → trả publicUrl
      const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(key);
      publicUrl = pub?.publicUrl || null;
    } else {
      // Bucket private → tạo signed URL (mặc định 30 ngày)
      const { data: s, error: sErr } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(key, 60 * 60 * 24 * 30);
      if (sErr) return res.status(500).json({ error: sErr.message });
      signedUrl = s?.signedUrl || null;
    }

    return res.json({ ok: true, key, publicUrl, signedUrl });
  } catch (e) {
    console.error("[uploads/sb]", e);
    return res.status(500).json({ error: "UPLOAD_FAILED" });
  }
});

export default router;
