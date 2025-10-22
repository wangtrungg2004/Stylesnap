// src/pages/CheckoutPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import state from "../store";

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

/** ===== Pricing config (có thể chỉnh) ===== */
const PRICING = {
  retailUnit: 159000,        // VND/chiếc (lẻ)
  wholesaleUnit: 129000,     // VND/chiếc (sỉ)
  wholesaleThreshold: 10,    // Sỉ từ số lượng này trở lên
  materials: [
    { value: "cotton100",  label: "Cotton 100%" },
    { value: "cottonBlend", label: "Cotton pha" },
  ],
};

const vnd = (n) => (Number(n) || 0).toLocaleString("vi-VN", { style: "currency", currency: "VND" });

/** ====== Stepper Input cho Số lượng ======
 * - Cho phép xoá trắng và gõ tay (input type="text")
 * - Nút – / + để giảm/tăng
 * - Chuẩn hoá về >=1 khi blur hay khi bấm nút
 */
function QtyStepper({ value, min = 1, onChangeNumber }) {
  const [raw, setRaw] = useState(String(value ?? min));

  useEffect(() => {
    setRaw(String(value ?? ""));
  }, [value]);

  const clampToMin = (n) => Math.max(min, n || min);

  const applyFromRaw = () => {
    const parsed = parseInt(raw.replace(/[^\d]/g, ""), 10);
    const next = isNaN(parsed) ? min : clampToMin(parsed);
    onChangeNumber(next);
  };

  const dec = () => onChangeNumber(clampToMin((Number(value) || min) - 1));
  const inc = () => onChangeNumber(clampToMin((Number(value) || min) + 1));

  return (
    <div className="inline-flex items-stretch rounded-lg ring-1 ring-gray-300 overflow-hidden">
      <button
        type="button"
        onClick={dec}
        aria-label="Giảm số lượng"
        className="px-3 select-none hover:bg-gray-100 active:bg-gray-200"
      >
        –
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Số lượng áo"
        placeholder="1"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={applyFromRaw}
        className="w-24 text-center outline-none px-2"
      />
      <button
        type="button"
        onClick={inc}
        aria-label="Tăng số lượng"
        className="px-3 select-none hover:bg-gray-100 active:bg-gray-200"
      >
        +
      </button>
    </div>
  );
}

export default function CheckoutPage() {
  const [method, setMethod] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [product, setProduct] = useState({ material: PRICING.materials[0].value, qty: 1 });
  const [payNotice, setPayNotice] = useState({ visible:false, kind:"pending", title:"", message:"" });
  const nav = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const setQty = (n) => setProduct((p) => ({ ...p, qty: n }));

  const priceCalc = useMemo(() => {
    const qty = product.qty || 1;
    const useWholesale = qty >= PRICING.wholesaleThreshold;
    const unitPrice = useWholesale ? PRICING.wholesaleUnit : PRICING.retailUnit;
    const totalRetail = qty * PRICING.retailUnit;
    const totalWholesale = qty * PRICING.wholesaleUnit;
    const chargeTotal = useWholesale ? totalWholesale : totalRetail;
    const applied = useWholesale ? "wholesale" : "retail";
    return { qty, useWholesale, unitPrice, totalRetail, totalWholesale, chargeTotal, applied };
  }, [product.qty]);

  async function createOrder(payload) {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    try { return await res.json(); } catch { return { ok:true }; }
  }

  const validateRequired = () => {
    const nameOk = !!form.name?.trim();
    const phoneOk = !!form.phone?.trim();
    const addrOk = !!form.address?.trim();
    const qtyOk = Number(product.qty) >= 1;

    if (!nameOk || !phoneOk || !addrOk || !qtyOk) {
      let miss = [];
      if (!nameOk) miss.push("Họ tên");
      if (!phoneOk) miss.push("Số điện thoại");
      if (!addrOk) miss.push("Địa chỉ");
      if (!qtyOk) miss.push("Số lượng áo");
      setPayNotice({
        visible: true,
        kind: "error",
        title: "Thiếu thông tin bắt buộc",
        message: `Vui lòng nhập: ${miss.join(", ")}.`,
      });
      return false;
    }
    return true;
  };

  const handleConfirm = async () => {
    if (!validateRequired()) return;

    if (!method) {
      return setPayNotice({
        visible:true, kind:"error",
        title:"Chưa chọn phương thức", message:"Chọn COD hoặc QR."
      });
    }

    setPayNotice({
      visible:true, kind:"pending",
      title:"Đang tạo đơn…",
      message: method==="qr" ? "Sẽ hiển thị hướng dẫn thanh toán." : ""
    });

    // Lấy thông tin thiết kế đã lưu gần nhất (nếu có)
    const sd = state.lastSavedDesign || {};

    // Payload gửi order (thêm product + pricing breakdown)
    const payload = {
      ...form,
      method,
      // design context
      previewFrontUrl: sd.previewFrontUrl || null,
      previewBackUrl:  sd.previewBackUrl  || null,
      userAssetUrl:    Array.isArray(sd.assets) && sd.assets[0]?.url ? sd.assets[0].url : null,
      colorHex: state.color || null,
      designId: sd.designId || null,
      // product
      material: product.material,
      quantity: priceCalc.qty,
      pricing: {
        retailUnit: PRICING.retailUnit,
        wholesaleUnit: PRICING.wholesaleUnit,
        wholesaleThreshold: PRICING.wholesaleThreshold,
        unitPrice: priceCalc.unitPrice,
        totalRetail: priceCalc.totalRetail,
        totalWholesale: priceCalc.totalWholesale,
        applied: priceCalc.applied,          // "retail" | "wholesale"
        chargeTotal: priceCalc.chargeTotal,  // số tiền nên thu theo ngưỡng
      },
    };

    // Nếu chọn QR → lưu context để PaymentReturn gửi kèm sau thanh toán
    if (method === "qr") {
      try {
        localStorage.setItem("stylesnap_checkout_email", form.email || "");
        localStorage.setItem(
          "stylesnap_checkout_ctx",
          JSON.stringify({
            email: form.email || "",
            colorHex: payload.colorHex || null,
            previewFrontUrl: payload.previewFrontUrl || null,
            previewBackUrl: payload.previewBackUrl || null,
            userAssetUrl: payload.userAssetUrl || null,
            designId: payload.designId || null,
            // product context
            productMaterial: payload.material,
            quantity: payload.quantity,
            unitPrice: payload.pricing.unitPrice,
            totalRetail: payload.pricing.totalRetail,
            totalWholesale: payload.pricing.totalWholesale,
            appliedPricing: payload.pricing.applied,
            chargeTotal: payload.pricing.chargeTotal,
          })
        );
      } catch {}
    }

    try {
      const resp = await createOrder(payload);

      setPayNotice({
        visible:true,
        kind:"success",
        title: method === "cod" ? "Đặt hàng COD thành công" : "Tạo yêu cầu thanh toán thành công",
        message: resp?.orderNo ? `Mã đơn ${resp.orderNo}` : (method === "qr" ? "Vui lòng quét mã QR để hoàn tất" : "")
      });

      // (tuỳ ý) dọn dẹp
      // state.lastSavedDesign = null;

      setTimeout(() => nav("/home"), 1200);
    } catch (e) {
      console.error(e);
      setPayNotice({ visible:true, kind:"error", title:"Tạo đơn thất bại", message:"Thử lại hoặc đổi phương thức." });
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col items-center py-10 bg-gray-50">
      <div className="fixed top-4 left-4 z-50 space-y-2">
        {payNotice.visible && <Notice kind={payNotice.kind} title={payNotice.title} message={payNotice.message} />}
      </div>

      <h1 className="text-2xl font-bold mb-6">Thanh toán đơn hàng</h1>

      {/* Thông tin giao hàng (bắt buộc) */}
      <div className="w-full max-w-md bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Thông tin giao hàng</h2>
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium">
            Họ và tên <span className="text-red-600">*</span>
            <input
              required
              type="text"
              name="name"
              placeholder="VD: Nguyễn Văn A"
              value={form.name}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium">
            Số điện thoại <span className="text-red-600">*</span>
            <input
              required
              type="tel"
              name="phone"
              placeholder="VD: 09xxxxxxxx"
              value={form.phone}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium">
            Email (nhận xác nhận thanh toán)
            <input
              type="email"
              name="email"
              placeholder="(không bắt buộc)"
              value={form.email}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium">
            Địa chỉ giao hàng <span className="text-red-600">*</span>
            <textarea
              required
              name="address"
              placeholder="Số nhà/đường, phường/xã, quận/huyện, tỉnh/thành phố"
              value={form.address}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
            />
          </label>
        </div>
      </div>

      {/* Sản phẩm */}
      <div className="w-full max-w-md bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Sản phẩm</h2>

        {/* Chất liệu */}
        <label className="block text-sm font-medium mb-1">Chất liệu áo</label>
        <select
          className="w-full border rounded px-3 py-2 mb-4"
          value={product.material}
          onChange={(e) => setProduct((p) => ({ ...p, material: e.target.value }))}
        >
          {PRICING.materials.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        {/* Số lượng (bắt buộc) */}
        <label className="block text-sm font-medium mb-1">
          Số lượng áo <span className="text-red-600">*</span>
        </label>
        <QtyStepper value={product.qty} min={1} onChangeNumber={setQty} />

        {/* Bảng giá */}
        <div className="mt-5 p-4 rounded-lg border bg-gray-50">
          <div className="text-sm text-gray-700">
            <div className="flex justify-between">
              <span>Đơn giá lẻ</span>
              <strong>{vnd(PRICING.retailUnit)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Đơn giá sỉ (≥ {PRICING.wholesaleThreshold})</span>
              <strong>{vnd(PRICING.wholesaleUnit)}</strong>
            </div>
            <hr className="my-3" />
            <div className="flex justify-between">
              <span>Tổng tiền lẻ (x{priceCalc.qty})</span>
              <strong>{vnd(priceCalc.totalRetail)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Tổng tiền sỉ (x{priceCalc.qty})</span>
              <strong>{vnd(priceCalc.totalWholesale)}</strong>
            </div>
            <div className="mt-3 px-3 py-2 rounded-md bg-white ring-1 ring-gray-200">
              <div className="text-xs text-gray-600 mb-1">Áp dụng</div>
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {priceCalc.useWholesale ? `Sỉ (≥ ${PRICING.wholesaleThreshold})` : "Lẻ"}
                </span>
                <span className="text-gray-600">Số tiền tạm tính</span>
              </div>
              <div className="text-right text-lg font-semibold">{vnd(priceCalc.chargeTotal)}</div>
            </div>
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

        {method === "qr" && (
          <div className="mt-4 p-4 border rounded bg-gray-50">
            <p className="mb-2">Quét mã QR sau để thanh toán:</p>
            {/* Placeholder QR, thay bằng ảnh QR thực tế */}
            <img src="/qrcode.jpg" alt="QR Code" className="w-48 h-48 mx-auto" />
          </div>
        )}
      </div>

      <button onClick={handleConfirm} className="px-6 py-3 bg-black text-white rounded-lg font-semibold">
        Xác nhận đơn hàng
      </button>
    </div>
  );
}
