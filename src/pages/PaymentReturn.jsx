import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";

export default function PaymentReturn() {
  const [params] = useSearchParams();

  useEffect(() => {
    const paymentId = params.get("paymentId");
    const designId = params.get("designId");
    const code = params.get("vnp_ResponseCode");
    const txn = params.get("vnp_TransactionNo");

    // Đọc toàn bộ context checkout đã lưu tạm
    let buyerEmail = null;
    let ctx = null;
    try {
      buyerEmail = localStorage.getItem("stylesnap_checkout_email");
      const raw = localStorage.getItem("stylesnap_checkout_ctx");
      if (raw) ctx = JSON.parse(raw);
    } catch {}

    axios.post("/api/payment/confirm", {
      paymentId,
      designId,
      vnp_ResponseCode: code,
      transactionId: txn,
      email: (ctx?.email || buyerEmail) || undefined,
      // ---- kèm thông tin thiết kế cho email KH
      colorHex: ctx?.colorHex || null,
      previewFrontUrl: ctx?.previewFrontUrl || null,
      previewBackUrl: ctx?.previewBackUrl || null,
      userAssetUrl: ctx?.userAssetUrl || null,
      // ---- mới: kèm thông tin sản phẩm & giá
      quantity: ctx?.quantity ?? null,
      productMaterial: ctx?.productMaterial ?? null,
      appliedPricing: ctx?.appliedPricing ?? null, // "retail" | "wholesale"
      unitPrice: ctx?.unitPrice ?? null,
      totalRetail: ctx?.totalRetail ?? null,
      totalWholesale: ctx?.totalWholesale ?? null,
      chargeTotal: ctx?.chargeTotal ?? null,
    }).then(res => {
      if (res.data.status === "success") {
        alert("Thanh toán thành công! Email xác nhận đã được gửi.");
        try {
          localStorage.removeItem("stylesnap_checkout_email");
          localStorage.removeItem("stylesnap_checkout_ctx");
        } catch {}
      } else {
        alert("Thanh toán thất bại!");
      }
    }).catch(() => {
      alert("Có lỗi khi xác nhận thanh toán.");
    });
  }, []);

  return <h2>Đang xử lý thanh toán...</h2>;
}
