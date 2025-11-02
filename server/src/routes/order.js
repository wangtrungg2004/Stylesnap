// server/routes/order.js
import { Router } from 'express';
import multer from 'multer';
import { sendMail } from '../utils/mailer.js';
import { supabaseAdmin } from '../utils/supabase.js'; // <-- THÊM: Import Supabase admin

const router = Router();

// Cấu hình Multer để nhận FormData (lưu file trong bộ nhớ)
// 'qrProofFile' phải khớp với key trong FormData của frontend
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

function genOrderCode() {
  return 'SS-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** ===== YÊU CẦU 3: Hàm upload ảnh bằng chứng ===== */
async function uploadProofToSupabase(file) {
  if (!file) return null;

  try {
    // Lấy bucket PROOFS từ .env
    const bucket = process.env.SUPABASE_PROOFS_BUCKET || 'stylesnap-proofs'; 
    
    const stamp = Date.now();
    const safeName = (file.originalname || 'proof.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `proofs/${stamp}-${safeName}`;

    // Upload buffer lên Supabase Storage
    const { error: upErr } = await supabaseAdmin.storage
      .from(bucket)
      .upload(key, file.buffer, { contentType: file.mimetype || 'application/octet-stream' });

    if (upErr) throw upErr;

    // Lấy Public URL (giả định bucket `stylesnap-proofs` là public)
    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(key);
    
    return data?.publicUrl || null;

  } catch (err) {
    console.error('Supabase proof upload failed:', err.message);
    return null; // Trả về null nếu upload lỗi
  }
}

// Sửa route để nhận `FormData`
router.post('/', upload.single('qrProofFile'), async (req, res) => {
  try {
    // Dữ liệu text giờ nằm trong req.body
    const {
      name, phone, email, address,
      method,
      previewFrontUrl, previewBackUrl, userAssetUrl,
      colorHex, designId,
      material, // <-- YÊU CẦU 1 (mới)
      size,     // <-- YÊU CẦU 1 (mới)
      totalAmount // <-- YÊU CẦU 2 (mới)
    } = req.body || {};

    // File ảnh bằng chứng (nếu có) nằm trong req.file
    const proofFile = req.file;

    const orderNo = genOrderCode();
    
    let qrProofUrl = null; // Biến chứa URL ảnh bằng chứng

    // ===== YÊU CẦU 3: Upload ảnh bằng chứng =====
    if (method === 'qr' && proofFile) {
      qrProofUrl = await uploadProofToSupabase(proofFile);
      if (!qrProofUrl) {
        // Nếu upload lỗi, báo cho người dùng
        return res.status(500).json({ ok: false, error: 'Upload ảnh bằng chứng thất bại.' });
      }
    }

    // Trả về response cho frontend ngay
    res.json({ ok: true, orderNo });

    // ===== Soạn mail (chạy ngầm sau khi đã response) =====
    const ts = Date.now();
    const atts = []; // Mảng đính kèm

    // Đính kèm ảnh thiết kế
    if (previewFrontUrl) {
      atts.push({
        cid: `${orderNo}-front`,
        filename: `${orderNo}-front-${ts}.jpg`,
        path: previewFrontUrl
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

    // YÊU CẦU 3: Đính kèm ảnh bằng chứng
    if (qrProofUrl) {
      atts.push({
        cid: `${orderNo}-proof`,
        filename: `${orderNo}-proof-${ts}.jpg`,
        path: qrProofUrl // Dùng URL đã upload
      });
    }

    // Sửa đổi HTML Email
    const html = `
      <div style="font-family: sans-serif; font-size: 14px; max-width: 600px;">
        <h1>Đơn hàng mới: ${orderNo}</h1>
        <p><b>Khách hàng:</b> ${name}</p>
        <p><b>Số điện thoại:</b> ${phone}</p>
        <p><b>Địa chỉ:</b> ${address}</p>
        ${email ? `<p><b>Email:</b> ${email}</p>` : ''}
        
        <hr style="border:0; border-top:1px solid #ccc" />
        
        <h3>Chi tiết sản phẩm</h3>
        <table cellpadding="6" style="border-collapse: collapse; width: 100%;">
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="width: 120px;"><b>Chất liệu:</b></td>
            <td>${material || 'Không rõ'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td><b>Size áo:</b></td>
            <td>${size || 'Không rõ'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td><b>Màu vải:</b></td>
            <td><div style="width: 20px; height: 20px; background-color:${colorHex || '#fff'}; border: 1px solid #888;"></div></td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td><b>Tổng tiền:</b></td>
            <td><b>${Number(totalAmount || 0).toLocaleString('vi-VN')} đ</b></td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td><b>Thanh toán:</b></td>
            <td>${method === 'qr' ? 'Quét QR (Đã gửi bằng chứng)' : 'COD'}</td>
          </tr>
        </table>
        
        <hr style="border:0; border-top:1px solid #ccc" />

        <h3>Thiết kế</h3>
        <table cellpadding="6" style="width: 100%;">
          <tr>
            <td style="width: 120px;">Mặt trước</td>
            <td>${atts.find(a=>a.cid?.endsWith('front')) ? `<img src="cid:${orderNo}-front" width="320" />` : '(không có)'}</td>
          </tr>
          <tr>
            <td>Mặt sau</td>
            <td>${atts.find(a=>a.cid?.endsWith('back')) ? `<img src="cid:${orderNo}-back" width="320" />` : '(không có)'}</td>
          </tr>
          <tr>
            <td>Ảnh Upload</td>
            <td>${atts.find(a=>a.cid?.endsWith('upload')) ? `<img src="cid:${orderNo}-upload" width="320" />` : '(không có)'}</td>
          </tr>
        </table>
        
        ${qrProofUrl ? `
          <hr style="border:0; border-top:1px solid #ccc" />
          <h3>Bằng chứng chuyển khoản (QR)</h3>
          <img src="cid:${orderNo}-proof" width="320" />
        ` : ''}

        <hr style="border:0; border-top:1px solid #ccc; margin-top: 20px" />
        <p style="font-size: 12px; color: #777;">Design ID: ${designId || 'N/A'}</p>
      </div>
    `;

    const factoryTo = process.env.FACTORY_EMAIL;
    const shopFrom  = process.env.SMTP_USER;

    // Gửi cho khách (nếu có email)
    if (email) {
      sendMail({ to: email, subject: `Xác nhận đơn hàng - ${orderNo}`, html, attachments: atts })
        .catch(err => console.error('[mail buyer]', err));
    }
    // Gửi cho xưởng
    if (factoryTo) {
      sendMail({ to: factoryTo, subject: `[XƯỞNG] Đơn mới - ${orderNo}`, html, attachments: atts })
        .catch(err => console.error('[mail factory]', err));
    }

  } catch (err) {
    console.error('[ORDER FAILED]', err);
    // Nếu lỗi trước khi res.json(), gửi response lỗi
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err.message || 'Server error' });
    }
  }
});

export default router;