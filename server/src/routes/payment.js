import express from "express";
import crypto from "crypto";
import moment from "moment";
import sql from "mssql";
import { getPool } from "../db.js";
import { sendMail } from "../utils/mailer.js";

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

// ---- Format tiền VND an toàn trên server
const vnd = (n) => {
  const num = Number(n) || 0;
  try {
    return num.toLocaleString("vi-VN", { style: "currency", currency: "VND" });
  } catch {
    // fallback khi thiếu ICU
    return `${num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`;
  }
};

// Map chất liệu từ mã → nhãn hiển thị
const MATERIAL_LABELS = {
  cotton100: "Cotton 100%",
  cottonBlend: "Cotton pha",
};

// (1) Tạo thanh toán (VNPay) – giữ nguyên
router.get("/create", async (req, res) => {
  try {
    const { designId, userId } = req.query;

    if (!designId || !userId) {
      return res.status(400).json({ error: "Missing designId/userId" });
    }

    const tmnCode   = process.env.VNP_TMNCODE;
    const secretKey = process.env.VNP_HASHSECRET;
    const returnUrl = process.env.VNP_RETURN_URL;
    const vnpUrl    = process.env.VNP_PAYMENT_URL;
    if (!tmnCode || !secretKey || !returnUrl || !vnpUrl) {
      return res.status(500).json({ error: "VNPay config missing" });
    }

    const amountVnd = 100000; // demo
    const amountVnp = amountVnd * 100;

    const pool = await getPool();
    const ins = await pool
      .request()
      .input("user_id", sql.Int, Number(userId))
      .input("design_id", sql.Int, Number(designId))
      .input("amount", sql.Int, amountVnd)
      .input("method", sql.NVarChar(20), "VNPay")
      .query(`
        INSERT INTO Payments (user_id, design_id, amount, payment_method, status, created_at)
        OUTPUT INSERTED.id
        VALUES (@user_id, @design_id, @amount, @method, 'pending', SYSUTCDATETIME())
      `);

    const paymentId = ins.recordset[0].id;

    const date = moment().format("YYYYMMDDHHmmss");
    const orderId = moment().format("HHmmss");

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
      vnp_Amount: String(amountVnp),
      vnp_ReturnUrl: `${returnUrl}?designId=${designId}&paymentId=${paymentId}&userId=${userId}`,
      vnp_IpAddr: getClientIp(req),
      vnp_CreateDate: date,
    };

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

// ---- HTML email cho KH: thêm Số lượng / Chất liệu / Tổng tiền
function buildCustomerHtml({
  paymentId, transactionId, designId, status,
  colorHex, previewFrontUrl, previewBackUrl, userAssetUrl,
  // mới thêm
  quantity, productMaterial, appliedPricing, unitPrice, totalRetail, totalWholesale, chargeTotal,
}) {
  const safe = (v, fb = "(không có)") => (v === 0 ? "0" : (v ? String(v) : fb));
  const imgBox = (url, label) => {
    if (!url) return `<div style="font-size:13px;color:#666">${label}: (không có)</div>`;
    const esc = String(url);
    return `
      <div style="display:inline-block;margin-right:12px;margin-bottom:12px;">
        <div style="font-weight:600;margin-bottom:6px">${label}</div>
        <a href="${esc}" target="_blank" rel="noopener">
          <img src="${esc}" alt="${label}" style="width:200px;max-width:200px;height:auto;border:1px solid #eee;border-radius:8px;display:block" />
        </a>
      </div>
    `;
  };
  const colorCell = colorHex
    ? `<span style="display:inline-block;width:12px;height:12px;border:1px solid #ccc;border-radius:2px;background:${colorHex};vertical-align:middle;margin-right:6px"></span> ${colorHex}`
    : "(không có)";
  const matLabel = MATERIAL_LABELS[productMaterial] || safe(productMaterial);
  const appliedLabel = appliedPricing === "wholesale" ? "Sỉ" : "Lẻ";

  return `
  <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">
    <h2 style="margin:0 0 12px">Xác nhận thanh toán thành công</h2>
    <p style="margin:0 0 4px"><b>Payment ID:</b> ${safe(paymentId, "-")}</p>
    <p style="margin:0 0 4px"><b>Mã giao dịch (cổng):</b> ${safe(transactionId, "-")}</p>
    <p style="margin:0 0 12px"><b>Trạng thái:</b> ${safe(status, "-")}</p>

    <h3 style="margin:16px 0 8px">Thông tin thiết kế</h3>
    <table style="border-collapse:collapse;border-spacing:0">
      <tr>
        <td style="padding:6px 12px 6px 0;color:#555">Màu vải</td>
        <td style="padding:6px 0">${colorCell}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px 6px 0;color:#555">Design ID</td>
        <td style="padding:6px 0">${safe(designId, "chưa lưu")}</td>
      </tr>
    </table>

    <div style="margin-top:12px">
      ${imgBox(previewFrontUrl, "Front")}
      ${imgBox(previewBackUrl, "Back")}
      ${imgBox(userAssetUrl, "Upload")}
    </div>

    <h3 style="margin:16px 0 8px">Sản phẩm</h3>
    <table style="border-collapse:collapse;border-spacing:0">
      <tr>
        <td style="padding:6px 12px 6px 0;color:#555">Chất liệu</td>
        <td style="padding:6px 0">${safe(matLabel)}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px 6px 0;color:#555">Số lượng</td>
        <td style="padding:6px 0">${safe(quantity)}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px 6px 0;color:#555">Loại giá áp dụng</td>
        <td style="padding:6px 0">${appliedLabel}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px 6px 0;color:#555">Đơn giá áp dụng</td>
        <td style="padding:6px 0">${vnd(unitPrice)}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px 6px 0;color:#555">Tổng tiền lẻ</td>
        <td style="padding:6px 0">${vnd(totalRetail)}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px 6px 0;color:#555">Tổng tiền sỉ</td>
        <td style="padding:6px 0">${vnd(totalWholesale)}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px 6px 0;color:#555"><b>Tổng tiền phải trả</b></td>
        <td style="padding:6px 0"><b>${vnd(chargeTotal)}</b></td>
      </tr>
    </table>

    <p style="margin-top:16px;color:#444">Nếu ảnh không hiển thị, hãy bấm vào từng mục để mở trong trình duyệt.</p>
  </div>`;
}

// (2) Xác nhận thanh toán & gửi mail
router.post("/confirm", async (req, res) => {
  try {
    const {
      paymentId, vnp_ResponseCode, transactionId, designId, userId, email,
      // context email khách (đã lưu bên FE/Checkout → PaymentReturn gửi kèm)
      colorHex, previewFrontUrl, previewBackUrl, userAssetUrl,
      // ---- mới thêm cho sản phẩm & giá
      quantity, productMaterial, appliedPricing, unitPrice, totalRetail, totalWholesale, chargeTotal,
    } = req.body || {};
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

    if (status === "success") {
      // ---- Gửi cho xưởng (thêm Số lượng/Chất liệu/Tổng tiền)
      const factoryTo = process.env.FACTORY_EMAIL;
      if (factoryTo) {
        const matLabel = MATERIAL_LABELS[productMaterial] || productMaterial || "(không có)";
        const factoryHtml = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.6">
            <h2>Thanh toán thành công</h2>
            <p><b>Payment ID:</b> ${paymentId}</p>
            <p><b>Mã giao dịch (cổng):</b> ${transactionId || "-"}</p>
            <p><b>Design ID:</b> ${designId || "-"}</p>
            <p><b>Trạng thái:</b> ${status}</p>

            <h3 style="margin:16px 0 8px">Sản phẩm</h3>
            <table style="border-collapse:collapse;border-spacing:0">
              <tr>
                <td style="padding:6px 12px 6px 0;color:#555">Chất liệu</td>
                <td style="padding:6px 0">${matLabel}</td>
              </tr>
              <tr>
                <td style="padding:6px 12px 6px 0;color:#555">Số lượng</td>
                <td style="padding:6px 0">${quantity ?? "(không có)"}</td>
              </tr>
              <tr>
                <td style="padding:6px 12px 6px 0;color:#555"><b>Tổng tiền phải trả</b></td>
                <td style="padding:6px 0"><b>${vnd(chargeTotal)}</b></td>
              </tr>
            </table>
          </div>`;
        try {
          await sendMail({ to: factoryTo, subject: `[PAID] Payment #${paymentId} thành công`, html: factoryHtml });
        } catch (e) {
          console.error("[payment confirm] mail to factory failed:", e?.message || e);
        }
      } else {
        console.error("[payment confirm] FACTORY_EMAIL is not configured");
      }

      // ---- Gửi cho khách (đủ ảnh/chi tiết + sản phẩm/giá)
      if (email) {
        const html = buildCustomerHtml({
          paymentId, transactionId, designId, status,
          colorHex: colorHex || null,
          previewFrontUrl: previewFrontUrl || null,
          previewBackUrl: previewBackUrl || null,
          userAssetUrl: userAssetUrl || null,
          // sản phẩm & giá
          quantity: Number(quantity) || null,
          productMaterial: productMaterial || null,
          appliedPricing: appliedPricing || null,
          unitPrice: Number(unitPrice) || null,
          totalRetail: Number(totalRetail) || null,
          totalWholesale: Number(totalWholesale) || null,
          chargeTotal: Number(chargeTotal) || null,
        });
        // không await để phản hồi nhanh
        sendMail({
          to: email,
          subject: `Xác nhận thanh toán thành công – Stylesnap (#${paymentId})`,
          html,
        }).catch(e => console.error("[payment confirm] mail to buyer failed:", e?.message || e));
      }
    }

    return res.json({ status });
  } catch (err) {
    console.error("Payment confirm error:", err?.message || err);
    return res.status(500).json({ error: "Payment confirm error" });
  }
});

// (3) Kiểm tra trạng thái – giữ nguyên
router.get("/check", async (req, res) => {
  const { designId, userId } = req.query;

  if (!designId || !userId) {
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
    const s = result.recordset[0].status || "not_paid";
    return res.json({ status: s === "success" ? "success" : "not_paid" });
  } catch (err) {
    console.error("Payment check error:", err?.message || err);
    return res.json({ status: "not_paid" });
  }
});

export default router;
