// src/pages/CheckoutPage.jsx
import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReactGA from "react-ga4";
import state from "../store";

/** ===== Thông tin tài khoản nhận khi chuyển khoản QR ===== */
const BANK = {
  accountName: "CTY TNHH ABC",
  accountNumber: "0123456789",
  bankName: "Vietcombank - CN HCM",
  qrImage: "/qrcode.jpg", // ảnh QR hiển thị trên trang
};

/** ===== Cấu hình giá =====
 * Cotton 100%: cố định 299.000 (không phân sỉ/lẻ)
 * Cotton pha: lẻ 159.000, sỉ 129.000 từ ngưỡng 10
 */
const PRICING = {
  BLEND_RETAIL: 159000,
  BLEND_WHOLESALE: 129000,
  WHOLESALE_THRESHOLD: 10,
  COTTON100_UNIT: 299000,
  materials: [
    { value: "cotton100", label: "Cotton 100%" },
    { value: "cottonBlend", label: "Cotton pha" },
  ],
};

/** ===== Size cơ bản ===== */
const SIZE_OPTIONS = ["S", "M", "L", "XL", "XXL"];

const vnd = (n) =>
  (Number(n) || 0).toLocaleString("vi-VN", { style: "currency", currency: "VND" });

function Notice({ kind = "pending", title, message }) {
  const color =
    kind === "success"
      ? "bg-green-50 text-green-700 ring-green-600/20"
      : kind === "error"
      ? "bg-red-50 text-red-700 ring-red-600/20"
      : "bg-amber-50 text-amber-800 ring-amber-600/20";
  const icon = kind === "success" ? "✔" : kind === "error" ? "✖" : "…";
  return (
    <div
      className={[
        "w-[320px] rounded-xl ring-1 px-3 py-2 shadow-sm",
        "backdrop-blur-sm",
        color,
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <div className="text-base leading-none">{icon}</div>
        <div className="min-w-0">
          <div className="font-semibold truncate">{title}</div>
          {message ? (
            <div className="text-xs mt-0.5 leading-snug break-words">{message}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** ===== Stepper số lượng ===== */
function QtyStepper({ value, min = 1, onChangeNumber }) {
  const [raw, setRaw] = useState(String(value ?? min));
  useEffect(() => {
    setRaw(String(value ?? ""));
  }, [value]);

  const clamp = (n) => Math.max(min, n || min);
  const applyFromRaw = () => {
    const parsed = parseInt(raw.replace(/[^\d]/g, ""), 10);
    onChangeNumber(isNaN(parsed) ? min : clamp(parsed));
  };
  return (
    <div className="inline-flex items-stretch rounded-lg ring-1 ring-gray-300 overflow-hidden">
      <button
        type="button"
        onClick={() => onChangeNumber(clamp((Number(value) || min) - 1))}
        className="px-3 select-none hover:bg-gray-100 active:bg-gray-200"
        aria-label="Giảm"
      >
        –
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={raw}
        placeholder="1"
        onChange={(e) => setRaw(e.target.value)}
        onBlur={applyFromRaw}
        aria-label="Số lượng"
        className="w-24 text-center outline-none px-2"
      />
      <button
        type="button"
        onClick={() => onChangeNumber(clamp((Number(value) || min) + 1))}
        className="px-3 select-none hover:bg-gray-100 active:bg-gray-200"
        aria-label="Tăng"
      >
        +
      </button>
    </div>
  );
}

export default function CheckoutPage() {
  const [method, setMethod] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [product, setProduct] = useState({
    material: PRICING.materials[0].value,
    qty: 1,
    size: "M",
  });
  const [payNotice, setPayNotice] = useState({
    visible: false,
    kind: "pending",
    title: "",
    message: "",
  });

  // QR proof
  const [qrProofFile, setQrProofFile] = useState(null);
  const [qrProofPreview, setQrProofPreview] = useState("");

  const nav = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const setQty = (n) => setProduct((p) => ({ ...p, qty: n }));

  /** Tính giá theo chất liệu đã chọn */
  const priceCalc = useMemo(() => {
    const qty = product.qty || 1;
    const mat = product.material;

    if (mat === "cotton100") {
      const unit = PRICING.COTTON100_UNIT;
      const total = qty * unit;
      return {
        qty,
        useWholesale: false,
        unitPrice: unit,
        totalRetail: total,
        totalWholesale: total,
        chargeTotal: total,
        applied: "fixed",
      };
    }

    // cottonBlend (giữ logic sỉ/lẻ)
    const useWholesale = qty >= PRICING.WHOLESALE_THRESHOLD;
    const unitPrice = useWholesale ? PRICING.BLEND_WHOLESALE : PRICING.BLEND_RETAIL;
    const totalRetail = qty * PRICING.BLEND_RETAIL;
    const totalWholesale = qty * PRICING.BLEND_WHOLESALE;
    const chargeTotal = useWholesale ? totalWholesale : totalRetail;

    return {
      qty,
      useWholesale,
      unitPrice,
      totalRetail,
      totalWholesale,
      chargeTotal,
      applied: useWholesale ? "wholesale" : "retail",
    };
  }, [product.qty, product.material]);

  async function createOrder(payload) {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    try {
      return await res.json();
    } catch {
      return { ok: true };
    }
  }

  // Upload ảnh xác nhận lên Supabase (prefix proofs)
  async function uploadProofToSupabase(file) {
    const fd = new FormData();
    fd.append("file", file, file.name || `qr-proof-${Date.now()}.jpg`);
    const res = await fetch("/api/uploads/sb?dir=proofs", {
      method: "POST",
      body: fd,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (!res.ok || !json) throw new Error("Upload proof failed");
    return json.publicUrl || json.signedUrl;
  }

  const validateRequired = () => {
    const nameOk = !!form.name?.trim();
    const phoneOk = !!form.phone?.trim();
    const addrOk = !!form.address?.trim();
    const qtyOk = Number(product.qty) >= 1;
    if (!nameOk || !phoneOk || !addrOk || !qtyOk) {
      const miss = [];
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
    if (!method)
      return setPayNotice({
        visible: true,
        kind: "error",
        title: "Chưa chọn phương thức",
        message: "Chọn COD hoặc QR.",
      });

    // Nếu chọn QR → bắt buộc ảnh xác nhận
    if (method === "qr" && !qrProofFile) {
      return setPayNotice({
        visible: true,
        kind: "error",
        title: "Thiếu ảnh xác nhận",
        message: "Vui lòng tải ảnh/bằng chứng chuyển khoản trước khi gửi đơn.",
      });
    }

    // GA event (tùy chọn)
    if (import.meta.env.MODE === "production") {
      try {
        ReactGA.event({
          category: "Checkout",
          action: "Confirm_Order",
          label: method,
          value: priceCalc.chargeTotal,
        });
      } catch {}
    }

    setPayNotice({
      visible: true,
      kind: "pending",
      title: "Đang tạo đơn…",
      message: method === "qr" ? "Đang xử lý ảnh xác nhận..." : "",
    });

    const sd = state.lastSavedDesign || {};

    // Payload
    const payload = {
      ...form,
      method,
      // design
      previewFrontUrl: sd.previewFrontUrl || null,
      previewBackUrl: sd.previewBackUrl || null,
      userAssetUrl:
        Array.isArray(sd.assets) && sd.assets[0]?.url ? sd.assets[0].url : null,
      colorHex: state.color || null,
      designId: sd.designId || null,
      // product
      material: product.material,
      size: product.size,
      quantity: priceCalc.qty,
      pricing: {
        retailUnit:
          product.material === "cotton100"
            ? PRICING.COTTON100_UNIT
            : PRICING.BLEND_RETAIL,
        wholesaleUnit:
          product.material === "cotton100"
            ? PRICING.COTTON100_UNIT
            : PRICING.BLEND_WHOLESALE,
        wholesaleThreshold: PRICING.WHOLESALE_THRESHOLD,
        unitPrice: priceCalc.unitPrice,
        totalRetail: priceCalc.totalRetail,
        totalWholesale: priceCalc.totalWholesale,
        applied: priceCalc.applied, // "fixed" | "retail" | "wholesale"
        chargeTotal: priceCalc.chargeTotal,
      },
    };

    // Nếu QR → upload ảnh proof
    if (method === "qr" && qrProofFile) {
      try {
        const proofUrl = await uploadProofToSupabase(qrProofFile);
        payload.qrProofUrl = proofUrl;
        payload.bank = BANK; // đưa info TK vào email
      } catch (e) {
        return setPayNotice({
          visible: true,
          kind: "error",
          title: "Upload ảnh xác nhận thất bại",
          message: "Thử lại hoặc gửi cách khác.",
        });
      }
    }

    // GUARD: nếu KH không chọn QR thì đảm bảo không gửi proof/bank
    if (method !== "qr") {
      delete payload.qrProofUrl;
      delete payload.bank;
    }

    try {
      const resp = await createOrder(payload);
      setPayNotice({
        visible: true,
        kind: "success",
        title: method === "cod" ? "Đặt hàng COD thành công" : "Gửi đơn (QR) thành công",
        message: resp?.orderNo ? `Mã đơn ${resp.orderNo}` : "",
      });
      setTimeout(() => nav("/home"), 1200);
    } catch (e) {
      console.error(e);
      setPayNotice({
        visible: true,
        kind: "error",
        title: "Tạo đơn thất bại",
        message: "Thử lại hoặc đổi phương thức.",
      });
    }
  };

  return (
    <div className="w-full min-h-screen flex flex-col items-center py-10 bg-gray-50">
      <div className="fixed top-4 left-4 z-50 space-y-2">
        {payNotice.visible && (
          <Notice
            kind={payNotice.kind}
            title={payNotice.title}
            message={payNotice.message}
          />
        )}
      </div>

      <h1 className="text-2xl font-bold mb-6">Thanh toán đơn hàng</h1>

      {/* Thông tin giao hàng */}
      <div className="w-full max-w-md bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Thông tin giao hàng</h2>
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium">
            Họ và tên <span className="text-red-600">*</span>
            <input
              required
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
              placeholder="VD: Nguyễn Văn A"
            />
          </label>

          <label className="text-sm font-medium">
            Số điện thoại <span className="text-red-600">*</span>
            <input
              required
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
              placeholder="VD: 09xxxxxxxx"
            />
          </label>

          <label className="text-sm font-medium">
            Email (nhận xác nhận thanh toán)
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
              placeholder="(không bắt buộc)"
            />
          </label>

          <label className="text-sm font-medium">
            Địa chỉ giao hàng <span className="text-red-600">*</span>
            <textarea
              required
              name="address"
              value={form.address}
              onChange={handleChange}
              className="mt-1 w-full border rounded px-3 py-2"
              placeholder="Số nhà/đường, phường/xã, quận/huyện, tỉnh/thành phố"
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
          onChange={(e) =>
            setProduct((p) => ({ ...p, material: e.target.value }))
          }
        >
          {PRICING.materials.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        {/* Size */}
        <label className="block text-sm font-medium mb-1">Chọn size</label>
        <select
          className="w-full border rounded px-3 py-2 mb-4"
          value={product.size}
          onChange={(e) => setProduct((p) => ({ ...p, size: e.target.value }))}
        >
          {["S", "M", "L", "XL", "XXL"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Số lượng */}
        <label className="block text-sm font-medium mb-1">
          Số lượng áo <span className="text-red-600">*</span>
        </label>
        <QtyStepper value={product.qty} min={1} onChangeNumber={setQty} />

        {/* Bảng giá hiển thị */}
        <div className="mt-5 p-4 rounded-lg border bg-gray-50 text-sm text-gray-700">
          <div className="flex justify-between">
            <span>Đơn giá lẻ</span>
            <strong>
              {product.material === "cotton100"
                ? vnd(PRICING.COTTON100_UNIT)
                : vnd(PRICING.BLEND_RETAIL)}
            </strong>
          </div>
          <div className="flex justify-between">
            <span>
              Đơn giá sỉ (≥ {PRICING.WHOLESALE_THRESHOLD})
            </span>
            <strong>
              {product.material === "cotton100"
                ? vnd(PRICING.COTTON100_UNIT)
                : vnd(PRICING.BLEND_WHOLESALE)}
            </strong>
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
                {product.material === "cotton100"
                  ? "Giá cố định"
                  : priceCalc.useWholesale
                  ? `Sỉ (≥ ${PRICING.WHOLESALE_THRESHOLD})`
                  : "Lẻ"}
              </span>
              <span className="text-gray-600">Số tiền tạm tính</span>
            </div>
            <div className="text-right text-lg font-semibold">
              {vnd(priceCalc.chargeTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* Phương thức thanh toán */}
      <div className="w-full max-w-md bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Phương thức thanh toán</h2>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="method"
              value="cod"
              checked={method === "cod"}
              onChange={() => setMethod("cod")}
            />{" "}
            COD
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="method"
              value="qr"
              checked={method === "qr"}
              onChange={() => setMethod("qr")}
            />{" "}
            QR chuyển khoản
          </label>
        </div>

        {method === "qr" && (
          <div className="mt-4 p-4 border rounded bg-gray-50">
            <p className="mb-2">Quét mã QR sau để thanh toán:</p>
            <img src={BANK.qrImage} alt="QR Code" className="w-48 h-48 mx-auto mb-3" />
            <div className="text-sm text-gray-700 mb-3">
              <div><b>Chủ TK:</b> {BANK.accountName}</div>
              <div><b>Số TK:</b> {BANK.accountNumber}</div>
              <div><b>Ngân hàng:</b> {BANK.bankName}</div>
            </div>

            {/* ===== Upload ảnh xác nhận (custom label + input sr-only) ===== */}
            <label className="block text-sm font-medium mb-1">
              Ảnh xác nhận đã chuyển khoản <span className="text-red-600">*</span>
            </label>

            <div className="mt-2">
              <input
                id="qr-proof"
                type="file"
                accept="image/*" /* MDN khuyến nghị dùng accept để giới hạn loại tệp */
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setQrProofFile(f || null);
                  setQrProofPreview(f ? URL.createObjectURL(f) : "");
                }}
              />
              <label
                htmlFor="qr-proof"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md ring-1 ring-gray-300 bg-white hover:bg-gray-100 cursor-pointer text-sm font-medium"
              >
                📎 Chọn ảnh
              </label>
              {qrProofFile && (
                <span className="ml-2 text-sm text-gray-700 align-middle">
                  {qrProofFile.name}
                </span>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Chấp nhận JPEG/PNG. Tối đa 10–25MB tuỳ cấu hình máy chủ.
              </p>

              {qrProofPreview && (
                <img
                  src={qrProofPreview}
                  alt="Preview proof"
                  className="mt-3 max-h-56 rounded border"
                />
              )}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleConfirm}
        className="px-6 py-3 bg-black text-white rounded-lg font-semibold"
      >
        Xác nhận đơn hàng
      </button>
    </div>
  );
}
