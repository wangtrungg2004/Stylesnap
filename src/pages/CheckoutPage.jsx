// src/pages/CheckoutPage.jsx
import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import state from "../store";

/** ===== Thông tin tài khoản nhận khi chuyển khoản QR ===== */
const BANK = {
  accountName: "CTY TNHH ABC",
  accountNumber: "0123456789",
  bankName: "Vietcombank - CN HCM",
  qrImage: "/qrcode.jpg", // ảnh QR hiển thị trên trang
};

/** ===== YÊU CẦU 2: Cập nhật giá ===== */
const PRICING = {
  wholesaleThreshold: 10,    // Sỉ từ số lượng này trở lên
  materials: {
    // Đổi thành object để chứa giá riêng
    "cotton100": {
      label: "Cotton 100%",
      retailUnit: 299000,     // <-- GIÁ MỚI
      wholesaleUnit: 299000,  // <-- GIÁ MỚI
    },
    "cottonBlend": {
      label: "Cotton pha",
      retailUnit: 159000,     // <-- Giữ nguyên giá cũ
      wholesaleUnit: 129000,  // <-- Giữ nguyên giá cũ
    }
  },
};

/** ===== YÊU CẦU 1: Thêm size áo ===== */
const T_SHIRT_SIZES = ["S", "M", "L", "XL", "XXL"];

const vnd = (n) => (Number(n) || 0).toLocaleString("vi-VN", { style: "currency", currency: "VND" });

function Notice({ kind = "pending", title, message }) {
  const color =
    kind === "success" ? "bg-green-50 text-green-700 ring-green-600/20" :
    kind === "error"   ? "bg-red-50 text-red-700 ring-red-600/20" :
                         "bg-amber-50 text-amber-800 ring-amber-600/20";
  const icon = kind === "success" ? "✔" : kind === "error" ? "✖" : "…";
  return (
    <div className={["w-[320px] rounded-xl ring-1 px-3 py-2 shadow-sm", "backdrop-blur-sm", color].join(" ")}>
      <div className="flex items-start gap-2">
        <div className="text-base leading-none">{icon}</div>
        <div className="min-w-0">
          <div className="font-semibold truncate">{title}</div>
          {message ? <div className="text-xs mt-0.5 leading-snug break-words">{message}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** ===== Stepper số lượng (Thêm vào từ file cũ) ===== */
function QtyStepper({ value, min = 1, onChangeNumber }) {
  const [raw, setRaw] = useState(String(value ?? min));
  useEffect(() => { setRaw(String(value ?? "")); }, [value]);

  const clamp = (n) => Math.max(min, n || min);
  const applyFromRaw = () => {
    const parsed = parseInt(raw.replace(/[^\d]/g, ""), 10);
    onChangeNumber(isNaN(parsed) ? min : clamp(parsed));
  };
  return (
    <div className="inline-flex items-stretch rounded-lg ring-1 ring-gray-300 overflow-hidden">
      <button type="button" onClick={() => onChangeNumber(clamp((Number(value)||min)-1))}
        className="px-3 select-none hover:bg-gray-100 active:bg-gray-200" aria-label="Giảm">–</button>
      <input type="text" inputMode="numeric" value={raw} placeholder="1" onChange={(e)=>setRaw(e.target.value)}
        onBlur={applyFromRaw} aria-label="Số lượng" className="w-24 text-center outline-none px-2" />
      <button type="button" onClick={() => onChangeNumber(clamp((Number(value)||min)+1))}
        className="px-3 select-none hover:bg-gray-100 active:bg-gray-200" aria-label="Tăng">+</button>
    </div>
  );
}

export default function CheckoutPage() {
  const [method, setMethod] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  
  // Thêm state cho sản phẩm: material, qty, size
  const [product, setProduct] = useState({ 
    material: Object.keys(PRICING.materials)[0], // "cotton100"
    qty: 1,
    size: T_SHIRT_SIZES[1], // Default 'M'
  });

  // State cho thông báo
  const [notice, setNotice] = useState({ visible: false, kind: "pending", title: "", message: "" });
  const [loading, setLoading] = useState(false);

  /** ===== YÊU CẦU 3: State cho file upload ===== */
  const [qrProofFile, setQrProofFile] = useState(null);
  const [qrProofPreview, setQrProofPreview] = useState("");

  const nav = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  
  // Helper mới để cập nhật state 'product'
  const setProductField = (field, value) => {
    setProduct(p => ({ ...p, [field]: value }));
  };
  const setQty = (n) => setProductField('qty', n);

  // Sửa logic tính giá (priceCalc) để phụ thuộc vào 'product.material'
  const priceCalc = useMemo(() => {
    const qty = product.qty || 1;
    // Lấy thông tin giá dựa trên chất liệu đã chọn
    const materialInfo = PRICING.materials[product.material] || PRICING.materials["cotton100"];

    const useWholesale = qty >= PRICING.wholesaleThreshold;
    
    // Lấy giá sỉ/lẻ từ 'materialInfo'
    const unitPrice = useWholesale ? materialInfo.wholesaleUnit : materialInfo.retailUnit;
    const chargeTotal = unitPrice * qty;

    // Tính toán giá để hiển thị (dựa trên chất liệu đã chọn)
    const totalRetail = qty * materialInfo.retailUnit;
    const totalWholesale = qty * materialInfo.wholesaleUnit;

    return { 
      qty, 
      useWholesale, 
      unitPrice, 
      totalRetail,
      totalWholesale,
      chargeTotal, 
      applied: useWholesale ? "wholesale" : "retail"
    };
  }, [product.qty, product.material]); // <-- Thêm product.material vào dependency

  // Kiểm tra form (thêm size và qrProofFile)
  const validateForm = () => {
    if (!form.name || !form.phone || !form.address) return "Vui lòng nhập Tên, SĐT, Địa chỉ";
    if (!product.size) return "Vui lòng chọn size áo";
    if (!method) return "Vui lòng chọn phương thức thanh toán";
    if (method === 'qr' && !qrProofFile) return "Vui lòng tải ảnh xác nhận chuyển khoản";
    return "";
  };
  
  // Lấy thông tin thiết kế đã lưu
  const design = useMemo(() => state.lastSavedDesign, []);

  // Redirect nếu không có design
  useEffect(() => {
    if (!design) {
      // Dùng notify thay vì alert
      setNotice({ visible: true, kind: "error", title: "Lỗi", message: "Không tìm thấy thiết kế. Đang quay về trang chủ." });
      setTimeout(() => nav('/home'), 2000);
    }
  }, [design, nav]);


  /** ===== YÊU CẦU 3: Sửa đổi HandleConfirm để gửi FormData ===== */
  const handleConfirm = async () => {
    const errMsg = validateForm();
    if (errMsg) {
      setNotice({ visible: true, kind: "error", title: "Thiếu thông tin", message: errMsg });
      return;
    }

    setLoading(true);
    setNotice({ visible: true, kind: "pending", title: "Đang tạo đơn hàng..." });

    try {
      // 1. Tạo FormData
      const body = new FormData();
      
      // 2. Thêm thông tin form
      body.append('name', form.name);
      body.append('phone', form.phone);
      body.append('email', form.email);
      body.append('address', form.address);
      body.append('method', method);

      // 3. Thêm thông tin sản phẩm
      const materialLabel = PRICING.materials[product.material]?.label || 'Không rõ';
      body.append('material', materialLabel);
      body.append('size', product.size);
      body.append('quantity', product.qty);
      body.append('totalAmount', priceCalc.chargeTotal); // Gửi tổng tiền

      // 4. Thêm thông tin thiết kế (lấy từ state)
      body.append('previewFrontUrl', design.previewFrontUrl || '');
      body.append('previewBackUrl', design.previewBackUrl || '');
      // Lấy ảnh asset đầu tiên (nếu có)
      const userAssetUrl = Array.isArray(design.assets) && design.assets[0]?.url ? design.assets[0].url : '';
      body.append('userAssetUrl', userAssetUrl);
      body.append('colorHex', state.color || '#ffffff');
      body.append('designId', design.designId || '');
      
      // 5. Thêm file bằng chứng (nếu có)
      if (qrProofFile) {
        body.append('qrProofFile', qrProofFile);
      }

      // 6. Gửi request
      const res = await fetch("/api/order", {
        method: "POST",
        body: body, // Gửi FormData (không cần set header 'Content-Type')
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Tạo đơn thất bại");
      }

      setNotice({ visible: true, kind: "success", title: "Đặt hàng thành công!", message: `Mã đơn: ${json.orderNo}` });
      state.lastSavedDesign = null; // Xóa thiết kế đã lưu
      
      setTimeout(() => nav("/home"), 2000);

    } catch (err) {
      console.error(err);
      setNotice({ visible: true, kind: "error", title: "Tạo đơn thất bại", message: err.message || "Thử lại hoặc đổi phương thức." });
      setLoading(false);
    }
  };

  const selectedMaterialInfo = PRICING.materials[product.material];

  return (
    <div className="w-full min-h-screen flex flex-col items-center py-10 bg-gray-50">
      {notice.visible && (
        <div className="fixed top-4 left-4 z-50">
          <Notice kind={notice.kind} title={notice.title} message={notice.message} />
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6">Thanh toán đơn hàng</h1>
      
      {/* Thông tin giao hàng */}
      <div className="w-full max-w-md bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Thông tin giao hàng</h2>
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium">Họ và tên <span className="text-red-600">*</span></label>
          <input type="text" name="name" placeholder="Họ và tên" value={form.name} onChange={handleChange} className="border rounded px-3 py-2" />
          
          <label className="text-sm font-medium">Số điện thoại <span className="text-red-600">*</span></label>
          <input type="tel" name="phone" placeholder="Số điện thoại" value={form.phone} onChange={handleChange} className="border rounded px-3 py-2" />
          
          <label className="text-sm font-medium">Email (không bắt buộc)</label>
          <input type="email" name="email" placeholder="Email (nhận xác nhận thanh toán)" value={form.email} onChange={handleChange} className="border rounded px-3 py-2" />
          
          <label className="text-sm font-medium">Địa chỉ giao hàng <span className="text-red-600">*</span></label>
          <textarea name="address" placeholder="Địa chỉ giao hàng" value={form.address} onChange={handleChange} className="border rounded px-3 py-2" />
        </div>
      </div>

      {/* Thông tin sản phẩm */}
      <div className="w-full max-w-md bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Sản phẩm</h2>
        
        {/* Ảnh preview */}
        {design && (
          <div className="flex gap-3 justify-center mb-4">
            <img src={design.previewFrontUrl} alt="Front" className="w-32 h-32 border rounded" />
            <img src={design.previewBackUrl} alt="Back" className="w-32 h-32 border rounded" />
          </div>
        )}

        {/* Chọn chất liệu */}
        <label className="block text-sm font-medium mb-1">Chất liệu áo</label>
        <select 
          className="w-full border rounded px-3 py-2 mb-4"
          value={product.material} 
          onChange={(e) => setProductField('material', e.target.value)}
        >
          {/* Sửa lại cách lặp (iterate) qua object materials */}
          {Object.entries(PRICING.materials).map(([value, { label }]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        
        {/* YÊU CẦU 1: Thêm chọn size */}
        <label className="block text-sm font-medium mb-1">Size áo <span className="text-red-600">*</span></label>
        <select 
          className="w-full border rounded px-3 py-2 mb-4"
          value={product.size} 
          onChange={(e) => setProductField('size', e.target.value)}
        >
          {T_SHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        
        {/* Chọn số lượng */}
        <label className="block text-sm font-medium mb-1">Số lượng áo <span className="text-red-600">*</span></label>
        <QtyStepper value={product.qty} min={1} onChangeNumber={setQty} />

        {/* Tính tiền */}
        <div className="mt-5 p-4 rounded-lg border bg-gray-50 text-sm text-gray-700">
          <div className="flex justify-between">
            <span>Đơn giá ({priceCalc.qty >= PRICING.wholesaleThreshold ? 'Giá sỉ' : 'Giá lẻ'})</span>
            <strong>{vnd(priceCalc.unitPrice)}</strong>
          </div>
          <hr className="my-3" />
          <div className="flex justify-between text-lg font-semibold">
            <span>Tổng cộng:</span>
            <span className="text-blue-600">{vnd(priceCalc.chargeTotal)}</span>
          </div>
        </div>
      </div>

      {/* Phương thức thanh toán */}
      <div className="w-full max-w-md bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Phương thức thanh toán</h2>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2">
            <input type="radio" name="method" value="cod" checked={method === "cod"} onChange={() => setMethod("cod")} /> COD
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="method" value="qr" checked={method === "qr"} onChange={() => setMethod("qr")} /> Quét QR Code
          </label>
        </div>

        {/* YÊU CẦU 3: Thêm input upload file */}
        {method === "qr" && (
          <div className="mt-4 p-4 border rounded bg-gray-50">
            <p className="mb-2">Quét mã QR sau để thanh toán:</p>
            <img src={BANK.qrImage} alt="QR Code" className="w-48 h-48 mx-auto mb-3" />
            <div className="text-sm text-gray-700 mb-3">
              <div><b>Chủ TK:</b> {BANK.accountName}</div>
              <div><b>Số TK:</b> {BANK.accountNumber}</div>
              <div><b>Ngân hàng:</b> {BANK.bankName}</div>
            </div>

            <label className="block text-sm font-medium mb-1">
              Ảnh xác nhận đã chuyển khoản <span className="text-red-600">*</span>
            </label>
            <input type="file" accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setQrProofFile(f || null);
                setQrProofPreview(f ? URL.createObjectURL(f) : "");
              }}
              className="block w-full text-sm border rounded file:mr-2 file:py-2 file:px-3 file:border-0 file:font-semibold file:bg-gray-100 hover:file:bg-gray-200"
            />
            {qrProofPreview && (
              <img src={qrProofPreview} alt="Preview proof" className="mt-3 max-h-56 rounded border" />
            )}
          </div>
        )}
      </div>

      <button 
        onClick={handleConfirm} 
        disabled={loading}
        className="px-6 py-3 bg-black text-white rounded-lg font-semibold w-full max-w-md disabled:bg-gray-400"
      >
        {loading ? 'Đang xử lý...' : 'Xác nhận đơn hàng'}
      </button>
    </div>
  );
}