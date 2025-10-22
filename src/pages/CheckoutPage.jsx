// src/pages/CheckoutPage.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import state from "../store";

function Notice({ kind = "pending", title, message }) {
  const color =
    kind === "success" ? "bg-green-50 text-green-700 ring-green-600/20" :
    kind === "error"   ? "bg-red-50 text-red-700 ring-red-600/20" :
                         "bg-amber-50 text-amber-800 ring-amber-600/20";
  const icon = kind === "success" ? "✔" : kind === "error" ? "✖" : "…";
  return (
    <div className={["w-[300px] rounded-xl ring-1 px-3 py-2 shadow-sm", "backdrop-blur-sm", color].join(" ")}>
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

export default function CheckoutPage() {
  const [method, setMethod] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [payNotice, setPayNotice] = useState({ visible:false, kind:"pending", title:"", message:"" });
  const nav = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function createOrder(payload) {
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    try { return await res.json(); } catch { return { ok:true }; }
  }

  const handleConfirm = async () => {
    if (!form.name || !form.phone || !form.address)
      return setPayNotice({ visible:true, kind:"error", title:"Thiếu thông tin giao hàng", message:"Nhập đủ họ tên, điện thoại, địa chỉ." });
    if (!method)
      return setPayNotice({ visible:true, kind:"error", title:"Chưa chọn phương thức", message:"Chọn COD hoặc QR." });

    setPayNotice({ visible:true, kind:"pending", title:"Đang tạo đơn…", message: method==="qr" ? "Sẽ hiển thị hướng dẫn thanh toán." : "" });

    // Lấy thông tin thiết kế đã lưu gần nhất (nếu có)
    const sd = state.lastSavedDesign || {};
    const payload = {
      ...form,
      method,
      // các URL phục vụ email/đính kèm
      previewFrontUrl: sd.previewFrontUrl || null,
      previewBackUrl:  sd.previewBackUrl  || null,
      userAssetUrl:    Array.isArray(sd.assets) && sd.assets[0]?.url ? sd.assets[0].url : null,
      colorHex: state.color || null,
      designId: sd.designId || null,
    };

    // Nếu chọn QR -> lưu context vào localStorage để /return gửi mail khách đủ thông tin
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

      <div className="w-full max-w-md bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Thông tin giao hàng</h2>
        <div className="flex flex-col gap-3">
          <input type="text" name="name" placeholder="Họ và tên" value={form.name} onChange={handleChange} className="border rounded px-3 py-2" />
          <input type="text" name="phone" placeholder="Số điện thoại" value={form.phone} onChange={handleChange} className="border rounded px-3 py-2" />
          <input type="email" name="email" placeholder="Email (để nhận xác nhận thanh toán)" value={form.email} onChange={handleChange} className="border rounded px-3 py-2" />
          <textarea name="address" placeholder="Địa chỉ giao hàng" value={form.address} onChange={handleChange} className="border rounded px-3 py-2" />
        </div>
      </div>

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
            {/* tuỳ bạn render QR thực tế */}
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
