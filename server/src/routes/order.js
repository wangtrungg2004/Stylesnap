// server/src/routes/order.js
import express from "express";
import { sendMail } from "../utils/mailer.js";

const router = express.Router();

// Format VND an toàn
const vnd = (n) => {
  const num = Number(n) || 0;
  try {
    return num.toLocaleString("vi-VN", { style: "currency", currency: "VND" });
  } catch {
    return `${num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`;
  }
};

// Nhãn chất liệu
const MATERIAL_LABELS = {
  cotton100: "Cotton 100%",
  cottonBlend: "Cotton pha",
};

// Mã đơn
function makeOrderNo() {
  const s = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SS-${s}`;
}

function imgRow(url, label) {
  if (!url)
    return `<tr><td style="padding:8px 10px;border-top:1px solid #ccc;width:120px">${label}</td><td style="padding:8px 10px;border-top:1px solid #ccc;color:#666">(không có)</td></tr>`;
  const esc = String(url);
  return `
  <tr>
    <td style="padding:8px 10px;border-top:1px solid #ccc;width:120px">${label}</td>
    <td style="padding:8px 10px;border-top:1px solid #ccc">
      <a href="${esc}" target="_blank" rel="noopener">
        <img src="${esc}" alt="${label}" style="width:260px;max-width:100%;height:auto;border:1px solid #eee;border-radius:8px;display:block" />
      </a>
    </td>
  </tr>`;
}

function buildDesignSection({
  colorHex,
  designId,
  previewFrontUrl,
  previewBackUrl,
  userAssetUrl,
}) {
  const colorCell = colorHex
    ? `<span style="display:inline-block;width:12px;height:12px;border:1px solid #ccc;border-radius:2px;background:${colorHex};vertical-align:middle;margin-right:6px"></span> ${colorHex}`
    : "(không có)";
  return `
  <h3 style="margin:20px 0 8px">Chi tiết thiết kế</h3>
  <table style="border-collapse:collapse;border:1px solid #ccc;min-width:520px">
    <tr><td style="padding:8px 10px;width:120px">Màu vải</td><td style="padding:8px 10px">${colorCell}</td></tr>
    <tr><td style="padding:8px 10px;border-top:1px solid #ccc">Design ID</td><td style="padding:8px 10px;border-top:1px solid #ccc">${designId || "chưa lưu"}</td></tr>
    ${imgRow(previewFrontUrl, "Front")}
    ${imgRow(previewBackUrl, "Back")}
    ${imgRow(userAssetUrl, "Upload")}
  </table>`;
}

function buildProductSection({ material, size, quantity, pricing }) {
  const matLabel = MATERIAL_LABELS[material] || material || "(không có)";
  const appliedLabel =
    pricing?.applied === "wholesale"
      ? "Sỉ"
      : pricing?.applied === "retail"
      ? "Lẻ"
      : "Giá cố định";
  const unitPrice = pricing?.unitPrice ?? null;
  const totalRetail = pricing?.totalRetail ?? null;
  const totalWholesale = pricing?.totalWholesale ?? null;
  const chargeTotal = pricing?.chargeTotal ?? null;

  return `
  <h3 style="margin:20px 0 8px">Sản phẩm</h3>
  <table style="border-collapse:collapse;border:1px solid #ccc;min-width:520px">
    <tr><td style="padding:8px 10px;width:160px">Chất liệu áo</td><td style="padding:8px 10px">${matLabel}</td></tr>
    <tr><td style="padding:8px 10px;border-top:1px solid #ccc">Size</td><td style="padding:8px 10px;border-top:1px solid #ccc">${size || "(không có)"}</td></tr>
    <tr><td style="padding:8px 10px;border-top:1px solid #ccc">Số lượng</td><td style="padding:8px 10px;border-top:1px solid #ccc">${Number(quantity) || 0}</td></tr>
    <tr><td style="padding:8px 10px;border-top:1px solid #ccc">Loại giá áp dụng</td><td style="padding:8px 10px;border-top:1px solid #ccc">${appliedLabel}</td></tr>
    <tr><td style="padding:8px 10px;border-top:1px solid #ccc">Đơn giá áp dụng</td><td style="padding:8px 10px;border-top:1px solid #ccc">${unitPrice != null ? vnd(unitPrice) : "(không có)"}</td></tr>
    <tr><td style="padding:8px 10px;border-top:1px solid #ccc">Tổng tiền lẻ</td><td style="padding:8px 10px;border-top:1px solid #ccc">${totalRetail != null ? vnd(totalRetail) : "(không có)"}</td></tr>
    <tr><td style="padding:8px 10px;border-top:1px solid #ccc">Tổng tiền sỉ</td><td style="padding:8px 10px;border-top:1px solid #ccc">${totalWholesale != null ? vnd(totalWholesale) : "(không có)"}</td></tr>
    <tr><td style="padding:8px 10px;border-top:1px solid #ccc"><b>Tổng tiền phải trả</b></td><td style="padding:8px 10px;border-top:1px solid #ccc"><b>${chargeTotal != null ? vnd(chargeTotal) : "(không có)"}</b></td></tr>
  </table>`;
}

function buildPaymentSection({ method, bank, qrProofUrl }) {
  const isQR = String(method).toLowerCase() === "qr";
  if (!isQR) {
    return `
      <h3 style="margin:20px 0 8px">Thanh toán</h3>
      <p>Phương thức: <b>${(method || "").toUpperCase()}</b></p>
    `;
  }
  const bankHtml = bank
    ? `
    <div class="text-sm" style="margin-bottom:8px">
      <div><b>Chủ TK:</b> ${bank.accountName || "-"}</div>
      <div><b>Số TK:</b> ${bank.accountNumber || "-"}</div>
      <div><b>Ngân hàng:</b> ${bank.bankName || "-"}</div>
    </div>`
    : "";

  const proofHtml = qrProofUrl
    ? `
    <div style="margin-top:8px">
      <div style="font-weight:600;margin-bottom:6px">Ảnh xác nhận chuyển khoản</div>
      <a href="${qrProofUrl}" target="_blank" rel="noopener">
        <img src="${qrProofUrl}" alt="QR payment proof"
             style="max-width:320px;height:auto;border:1px solid #eee;border-radius:8px" />
      </a>
    </div>`
    : `<div style="color:#666">(Chưa kèm ảnh xác nhận)</div>`;

  return `
    <h3 style="margin:20px 0 8px">Thanh toán</h3>
    <p>Phương thức: <b>QR chuyển khoản</b></p>
    ${bankHtml}
    ${proofHtml}
  `;
}

router.post("/", async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      address,
      method,
      // thiết kế
      colorHex,
      designId,
      previewFrontUrl,
      previewBackUrl,
      userAssetUrl,
      // sản phẩm & giá
      material,
      size,
      quantity,
      pricing,
      // QR thủ công
      qrProofUrl,
      bank,
    } = req.body || {};

    if (!name || !phone || !address || !method) {
      return res
        .status(400)
        .json({ error: "Thiếu thông tin bắt buộc (name/phone/address/method)" });
    }

    const isQR = String(method).toLowerCase() === "qr";
    const safeProofUrl = isQR ? qrProofUrl || null : null;
    const safeBank = isQR ? bank || null : null;

    const orderNo = makeOrderNo();

    const headerHtml = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#111;line-height:1.6">
        <h2 style="margin:0 0 10px">Đơn hàng mới: ${orderNo}</h2>
        <p><b>Từ:</b> ${name} (${phone})</p>
        <p><b>Địa chỉ:</b> ${address}</p>
        ${email ? `<p><b>Email khách:</b> ${email}</p>` : ""}
        <p><b>Phương thức:</b> ${method?.toUpperCase()}</p>
      </div>
    `;

    const designBlock = buildDesignSection({
      colorHex,
      designId,
      previewFrontUrl,
      previewBackUrl,
      userAssetUrl,
    });
    const productBlock = buildProductSection({
      material,
      size,
      quantity,
      pricing,
    });
    const paymentBlock = buildPaymentSection({
      method,
      bank: safeBank,
      qrProofUrl: safeProofUrl,
    });

    const attachments = [];
    if (safeProofUrl) {
      attachments.push({
        filename: "qr-proof.jpg",
        path: safeProofUrl,
        cid: "qrproof@stylesnap",
      });
    }

    // Xưởng
    const factoryTo = process.env.FACTORY_EMAIL;
    if (factoryTo) {
      const htmlFactory = `${headerHtml}${designBlock}${productBlock}${paymentBlock}`;
      await sendMail({
        to: factoryTo,
        subject: `Đơn hàng mới: ${orderNo}`,
        html: htmlFactory,
        attachments, // chỉ có khi QR
      });
    }

    // Khách
    if (email) {
      const htmlCustomer = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#111;line-height:1.6">
          <h2 style="margin:0 0 10px">Xác nhận đơn hàng: ${orderNo}</h2>
          <p>Cảm ơn bạn đã đặt hàng tại Stylesnap.</p>
        </div>
        ${designBlock}
        ${productBlock}
        ${paymentBlock}
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;color:#444;margin-top:12px">
          <p>Nếu có sai sót thông tin, vui lòng phản hồi email này để được hỗ trợ.</p>
        </div>
      `;
      await sendMail({
        to: email,
        subject: `Xác nhận đơn hàng – ${orderNo}`,
        html: htmlCustomer,
        attachments, // chỉ có khi QR
      });
    }

    return res.json({ ok: true, orderNo });
  } catch (err) {
    console.error("order error:", err?.message || err);
    return res.status(500).json({ error: "Order error" });
  }
});

export default router;
