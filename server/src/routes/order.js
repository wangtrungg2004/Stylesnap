// server/src/routes/order.js
import express from "express";
import { sendMail } from "../utils/mailer.js";

const router = express.Router();

// Format VND an toàn (fallback nếu thiếu ICU)
const vnd = (n) => {
  const num = Number(n) || 0;
  try { return num.toLocaleString("vi-VN", { style: "currency", currency: "VND" }); }
  catch { return `${num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`; }
};

// Map nhãn chất liệu hiển thị
const MATERIAL_LABELS = {
  cotton100: "Cotton 100%",
  cottonBlend: "Cotton pha",
};

// Tạo mã đơn ngắn gọn kiểu SS-86YGGU
function makeOrderNo() {
  const s = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SS-${s}`;
}

function imgBox(url, label) {
  if (!url) return `<tr><td style="padding:8px 10px;border-top:1px solid #ccc;width:120px">${label}</td><td style="padding:8px 10px;border-top:1px solid #ccc;color:#666">(không có)</td></tr>`;
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

function buildDesignSection({ colorHex, designId, previewFrontUrl, previewBackUrl, userAssetUrl }) {
  const colorCell = colorHex
    ? `<span style="display:inline-block;width:12px;height:12px;border:1px solid #ccc;border-radius:2px;background:${colorHex};vertical-align:middle;margin-right:6px"></span> ${colorHex}`
    : "(không có)";

  return `
  <h3 style="margin:20px 0 8px">Chi tiết thiết kế</h3>
  <table style="border-collapse:collapse;border:1px solid #ccc;min-width:520px">
    <tr>
      <td style="padding:8px 10px;width:120px">Màu vải</td>
      <td style="padding:8px 10px">${colorCell}</td>
    </tr>
    <tr>
      <td style="padding:8px 10px;border-top:1px solid #ccc">Design ID</td>
      <td style="padding:8px 10px;border-top:1px solid #ccc">${designId || "chưa lưu"}</td>
    </tr>
    ${imgBox(previewFrontUrl, "Front")}
    ${imgBox(previewBackUrl, "Back")}
    ${imgBox(userAssetUrl, "Upload")}
  </table>`;
}

function buildProductSection({ material, quantity, pricing }) {
  const matLabel = MATERIAL_LABELS[material] || material || "(không có)";
  const appliedLabel = pricing?.applied === "wholesale" ? "Sỉ" : "Lẻ";
  const unitPrice = pricing?.unitPrice ?? null;
  const totalRetail = pricing?.totalRetail ?? null;
  const totalWholesale = pricing?.totalWholesale ?? null;
  const chargeTotal = pricing?.chargeTotal ?? null;

  return `
  <h3 style="margin:20px 0 8px">Sản phẩm</h3>
  <table style="border-collapse:collapse;border:1px solid #ccc;min-width:520px">
    <tr>
      <td style="padding:8px 10px;width:160px">Chất liệu áo</td>
      <td style="padding:8px 10px">${matLabel}</td>
    </tr>
    <tr>
      <td style="padding:8px 10px;border-top:1px solid #ccc">Số lượng</td>
      <td style="padding:8px 10px;border-top:1px solid #ccc">${Number(quantity) || 0}</td>
    </tr>
    <tr>
      <td style="padding:8px 10px;border-top:1px solid #ccc">Loại giá áp dụng</td>
      <td style="padding:8px 10px;border-top:1px solid #ccc">${appliedLabel}</td>
    </tr>
    <tr>
      <td style="padding:8px 10px;border-top:1px solid #ccc">Đơn giá áp dụng</td>
      <td style="padding:8px 10px;border-top:1px solid #ccc">${unitPrice != null ? vnd(unitPrice) : "(không có)"}</td>
    </tr>
    <tr>
      <td style="padding:8px 10px;border-top:1px solid #ccc">Tổng tiền lẻ</td>
      <td style="padding:8px 10px;border-top:1px solid #ccc">${totalRetail != null ? vnd(totalRetail) : "(không có)"}</td>
    </tr>
    <tr>
      <td style="padding:8px 10px;border-top:1px solid #ccc">Tổng tiền sỉ</td>
      <td style="padding:8px 10px;border-top:1px solid #ccc">${totalWholesale != null ? vnd(totalWholesale) : "(không có)"}</td>
    </tr>
    <tr>
      <td style="padding:8px 10px;border-top:1px solid #ccc"><b>Tổng tiền phải trả</b></td>
      <td style="padding:8px 10px;border-top:1px solid #ccc"><b>${chargeTotal != null ? vnd(chargeTotal) : "(không có)"}</b></td>
    </tr>
  </table>`;
}

router.post("/", async (req, res) => {
  try {
    const {
      name, phone, email, address, method, // bắt buộc
      // thiết kế
      colorHex, designId, previewFrontUrl, previewBackUrl, userAssetUrl,
      // sản phẩm & giá (đã được FE gửi trong CheckoutPage.jsx)
      material, quantity, pricing,
    } = req.body || {};

    if (!name || !phone || !address || !method) {
      return res.status(400).json({ error: "Thiếu thông tin bắt buộc (name/phone/address/method)" });
    }

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

    // block chi tiết thiết kế + sản phẩm
    const designBlock = buildDesignSection({ colorHex, designId, previewFrontUrl, previewBackUrl, userAssetUrl });
    const productBlock = buildProductSection({ material, quantity, pricing });

    // ==== Mail gửi XƯỞNG ====
    const factoryTo = process.env.FACTORY_EMAIL;
    if (factoryTo) {
      const htmlFactory = `
        ${headerHtml}
        ${designBlock}
        ${productBlock}
      `;
      await sendMail({
        to: factoryTo,
        subject: `Đơn hàng mới: ${orderNo}`,
        html: htmlFactory,
      });
    }

    // ==== Mail gửi KHÁCH (nếu có email) ====
    if (email) {
      const htmlCustomer = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;color:#111;line-height:1.6">
          <h2 style="margin:0 0 10px">Xác nhận đơn hàng: ${orderNo}</h2>
          <p>Cảm ơn bạn đã đặt hàng tại Stylesnap.</p>
        </div>
        ${designBlock}
        ${productBlock}
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;color:#444;margin-top:12px">
          <p>Nếu có sai sót thông tin, vui lòng phản hồi email này để được hỗ trợ.</p>
        </div>
      `;
      await sendMail({
        to: email,
        subject: `Xác nhận đơn hàng – ${orderNo}`,
        html: htmlCustomer,
      });
    }

    return res.json({ ok: true, orderNo });
  } catch (err) {
    console.error("order error:", err?.message || err);
    return res.status(500).json({ error: "Order error" });
  }
});

export default router;
