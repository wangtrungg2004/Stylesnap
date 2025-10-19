// server/routes/order.js
import { Router } from 'express';
import { sendMail } from '../utils/mailer.js';

const router = Router();

function genOrderCode() {
  return 'SS-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

router.post('/', async (req, res) => {
  try {
    const {
      name, phone, email, address,
      method,
      previewFrontUrl, previewBackUrl, userAssetUrl,
      colorHex, designId
    } = req.body || {};

    // Kiểm tra đầu vào tối thiểu
    if (!name || !phone || !address) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    const orderNo = genOrderCode();
    
    // ===== Soạn mail (làm trước) =====
    const ts = Date.now();
    const atts = [];

    if (previewFrontUrl) {
      atts.push({
        cid: `${orderNo}-front`,
        filename: `${orderNo}-front-${ts}.jpg`,
        path: previewFrontUrl // nodemailer sẽ tự động fetch URL
      });
    }
    if (previewBackUrl) {
      atts.push({
        cid: `${orderNo}-back`,
        filename: `${orderNo}-back-${ts}.jpg`,
        path: previewBackUrl
      });
    }
    if (userAssetUrl) {
      const ext = (userAssetUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
      atts.push({
        cid: `${orderNo}-upload`,
        filename: `${orderNo}-upload-${ts}.${ext}`,
        path: userAssetUrl
      });
    }

    const html = `
      <div style="font-family: sans-serif; font-size: 14px;">
        <h1>Đơn hàng mới: ${orderNo}</h1>
        <p>Từ: ${name} (${phone})</p>
        <p>Địa chỉ: ${address}</p>
        <p>Email khách: ${email || '(không có)'}</p>
        <p>Phương thức: ${method === 'cod' ? 'COD' : 'Quét QR'}</p>
        <hr />
        <h3>Chi tiết thiết kế</h3>
        <table border="1" cellpadding="5" cellspacing="0">
          <tr> <td>Màu vải</td> <td>${colorHex || '(chưa chọn)'}</td> </tr>
          <tr> <td>Design ID</td> <td>${designId || '(chưa lưu)'}</td> </tr>
          <tr>
            <td>Front</td>
            <td>${atts.find(a=>a.cid?.endsWith('front')) ? `<img src="cid:${orderNo}-front" width="320" />` : '(không có)'}</td>
          </tr>
          <tr>
            <td>Back</td>
            <td>${atts.find(a=>a.cid?.endsWith('back')) ? `<img src="cid:${orderNo}-back" width="320" />` : '(không có)'}</td>
          </tr>
          <tr>
            <td>Upload</td>
            <td>${atts.find(a=>a.cid?.endsWith('upload')) ? `<img src="cid:${orderNo}-upload" width="320" />` : '(không có)'}</td>
          </tr>
        </table>
        <hr />
        <p>Ảnh được đính kèm ngay trong email. Nguồn ảnh là Supabase Storage.</p>
      </div>
    `;

    const factoryTo = process.env.FACTORY_EMAIL;
    if (!factoryTo) {
      console.error('[ORDER FAILED] FACTORY_EMAIL is not configured');
      return res.status(500).json({ ok: false, error: 'Server configuration error' });
    }

    // === 1. GỬI MAIL CHO XƯỞNG (BẮT BUỘC) ===
    // (await sẽ chờ gửi xong, nếu lỗi sẽ nhảy xuống catch)
    await sendMail({
      to: factoryTo,
      subject: `[XƯỞNG] Đơn mới - ${orderNo}`,
      html,
      attachments: atts
    });

    // === 2. GỬI MAIL CHO KHÁCH (NẾU CÓ) ===
    // (Không cần await, gửi ngầm, nếu lỗi thì chỉ log)
    if (email) {
      sendMail({ to: email, subject: `Xác nhận đơn hàng Stylesnap - ${orderNo}`, html, attachments: atts })
        .catch(err => console.error('[mail buyer failed]', err?.message));
    }

    // === 3. GỬI THÀNH CÔNG CHO XƯỞNG -> TRẢ VỀ OK ===
    res.json({ ok: true, orderNo });

  } catch (err) {
    // === 4. NẾU BẤT CỨ ĐÂU Ở TRÊN LỖI -> TRẢ VỀ LỖI THẬT ===
    console.error('[ORDER FAILED]', err?.message || err);
    res.status(500).json({ ok: false, error: 'Failed to create order' });
  }
});

export default router;
