import express from "express";
import crypto from "crypto";
import moment from "moment";
import sql from "mssql";
import { getPool } from "../db.js";
import { sendMail } from "../utils/mailer.js"; // <-- NEW

const router = express.Router();

// helper: lấy IP client chuẩn (qua proxy)
function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "127.0.0.1"
  );
}

// ========== 1) Tạo thanh toán (VNPay) ==========
router.get("/create", async (req, res) => {
  try {
    const { designId, userId } = req.query;

    if (!designId || !userId) {
      return res.status(400).json({ error: "Missing designId/userId" });
    }

    // ENV bắt buộc
    const tmnCode   = process.env.VNP_TMNCODE;
    const secretKey = process.env.VNP_HASHSECRET;
    const returnUrl = process.env.VNP_RETURN_URL;
    const vnpUrl    = process.env.VNP_PAYMENT_URL;
    if (!tmnCode || !secretKey || !returnUrl || !vnpUrl) {
      return res.status(500).json({ error: "VNPay config missing" });
    }

    // amount (VND). VNPay yêu cầu vnp_Amount = VND * 100
    const amountVnd = 100000; // 100,000 VND cho test
    const amountVnp = amountVnd * 100; // 10,000,000

    // 1. Ghi Payment pending vào DB
    const pool = await getPool();
    const ins = await pool
      .request()
      .input("user_id", sql.Int, Number(userId))
      .input("design_id", sql.Int, Number(designId))
      .input("amount", sql.Int, amountVnd) // lưu VND bình thường (không *100) cho dễ đọc
      .input("method", sql.NVarChar(20), "VNPay")
      .query(`
        INSERT INTO Payments (user_id, design_id, amount, payment_method, status, created_at)
        OUTPUT INSERTED.id
        VALUES (@user_id, @design_id, @amount, @method, 'pending', SYSUTCDATETIME())
      `);

    const paymentId = ins.recordset[0].id;

    // 2. Tạo tham số VNPay
    const date = moment().format("YYYYMMDDHHmmss");
    const orderId = moment().format("HHmmss"); // mã đơn nội bộ (unique theo thời điểm)

    let vnp_Params = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: tmnCode,
      vnp_SecureHashType: "HmacSHA512",
      vnp_Locale: "vn",
      vnp_CurrCode: "VND",
      vnp_TxnRef: orderId,
      vnp_OrderInfo: `Thanh toan design ${designId}`,
      vnp_OrderType: "other",
      vnp_Amount: String(amountVnp), // phải là số nguyên dạng string
      vnp_ReturnUrl: `${returnUrl}?designId=${designId}&paymentId=${paymentId}&userId=${userId}`,
      vnp_IpAddr: getClientIp(req),
      vnp_CreateDate: date,
    };

    // Ký hash theo thứ tự key sort tăng dần
    const signData = Object.keys(vnp_Params)
      .sort()
      .map((k) => `${k}=${vnp_Params[k]}`)
      .join("&");

    const signed = crypto
      .createHmac("sha512", secretKey)
      .update(Buffer.from(signData, "utf-8"))
      .digest("hex");

    vnp_Params.vnp_SecureHash = signed;

    const url = vnpUrl + "?" + new URLSearchParams(vnp_Params).toString();
    return res.json({ url, paymentId });
  } catch (err) {
    console.error("Payment create error:", err?.message || err);
    return res.status(500).json({ error: "Payment create error" });
  }
});

// ========== 2) Xác nhận thanh toán (VNPay return -> FE -> /confirm) ==========
router.post("/confirm", async (req, res) => {
  try {
    const { paymentId, vnp_ResponseCode, transactionId, designId, userId, email } = req.body || {};
    if (!paymentId) return res.status(400).json({ error: "Missing paymentId" });

    const status = vnp_ResponseCode === "00" ? "success" : "failed";

    const pool = await getPool();
    await pool
      .request()
      .input("payment_id", sql.Int, Number(paymentId))
      .input("status", sql.NVarChar(20), status)
      .input("txn", sql.NVarChar(64), transactionId || null)
      .query(`
        UPDATE Payments
          SET status = @status,
              transaction_id = @txn,
              updated_at = SYSUTCDATETIME()
        WHERE id = @payment_id
      `);

    // NEW: Nếu thanh toán thành công, gửi email cho xưởng + khách
    if (status === "success") {
      const factoryTo = process.env.FACTORY_EMAIL;
      const subjectFactory = `[PAID] Payment #${paymentId} thành công`;
      const subjectBuyer = `Xác nhận thanh toán thành công – Stylesnap (#${paymentId})`;
      const html = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.6">
          <h2>Thanh toán thành công</h2>
          <p><b>Payment ID:</b> ${paymentId}</p>
          <p><b>Mã giao dịch (cổng):</b> ${transactionId || "-"}</p>
          <p><b>Design ID:</b> ${designId || "-"}</p>
          <p><b>Trạng thái:</b> ${status}</p>
        </div>
      `;

      // gửi cho xưởng (bắt buộc)
      if (factoryTo) {
        try {
          await sendMail({ to: factoryTo, subject: subjectFactory, html });
        } catch (e) {
          console.error("[payment confirm] mail to factory failed:", e?.message || e);
        }
      } else {
        console.error("[payment confirm] FACTORY_EMAIL is not configured");
      }

      // gửi cho khách (nếu có email từ FE)
      if (email) {
        // không await để tránh chậm phản hồi
        sendMail({ to: email, subject: subjectBuyer, html })
          .catch(e => console.error("[payment confirm] mail to buyer failed:", e?.message || e));
      }
    }

    return res.json({ status });
  } catch (err) {
    console.error("Payment confirm error:", err?.message || err);
    return res.status(500).json({ error: "Payment confirm error" });
  }
});

// ========== 3) Kiểm tra đã thanh toán chưa ==========
router.get("/check", async (req, res) => {
  const { designId, userId } = req.query;

  if (!designId || !userId) {
    // Thiếu tham số: coi như chưa thanh toán để FE còn đi /create
    return res.json({ status: "not_paid" });
  }

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("design_id", sql.Int, Number(designId))
      .input("user_id", sql.Int, Number(userId))
      .query(`
        SELECT TOP 1 status
        FROM Payments
        WHERE user_id = @user_id AND design_id = @design_id
        ORDER BY created_at DESC
      `);

    if (!result.recordset.length) {
      return res.json({ status: "not_paid" });
    }
    const status = result.recordset[0].status || "not_paid";
    // Chỉ coi là đã thanh toán khi status = 'success'
    return res.json({ status: status === "success" ? "success" : "not_paid" });
  } catch (err) {
    console.error("Payment check error:", err?.message || err);
    // QUAN TRỌNG: không ném 500 nữa → trả not_paid để FE tiếp tục /create
    return res.json({ status: "not_paid" });
  }
});

export default router;
