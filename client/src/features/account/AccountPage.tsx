import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../lib/apiClient";
import { formatVnd } from "../../config/brand";
import { orderApi } from "../cart/orderApi";
import { useCustomDesign } from "../custom-design/useCustomDesign";
import { AccountSettings } from "./AccountSettings";

type AccountOrder = { id: number; orderCode: string; status: string; totalAmount: string; createdAt: string;
  customOrder: { title: string } | null; payments: { status: string; method: string }[];
  orderItems: { productName: string; shape: string; length: string; quantity: number; price: string }[] };

export const AccountPage: React.FC = () => {
  const { user, customRequests, respond, designError } = useCustomDesign();
  const [history, setHistory] = useState<AccountOrder[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const { data } = await apiClient.get<AccountOrder[]>("/orders", { signal });
    if (!signal?.aborted) setHistory(data);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setHistory([]); setError("");
    if (user) void load(c.signal).catch(e => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, [user?.id, load]);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Không thực hiện được yêu cầu."); }
    finally { setBusy(false); }
  };
  const orders = history.map(o => ({
    id: o.id, orderNumber: o.orderCode, totalAmount: Number(o.totalAmount), orderStatus: o.status,
    createdAt: new Date(o.createdAt).toLocaleDateString("vi-VN"), title: o.customOrder?.title,
    paymentStatus: o.payments[0]?.status, paymentMethod: o.payments[0]?.method,
    items: o.orderItems.map(i => ({ name: i.productName, variant: `${i.shape} / ${i.length}`, quantity: i.quantity, unitPrice: Number(i.price) })),
  }));

  const activeEmail = user?.email || "—";
  const activeName = user?.fullName || "bạn";

  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
      {(error || designError) && <p role="alert">{error || designError}</p>}
      {/* Header Hồ sơ khách hàng */}
      <div className="bg-[#FFFCF8] rounded-3xl p-6 sm:p-10 border border-[#342A2A]/10 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B98C68]">
           
          </span>
          <h1 className="font-serif-editorial text-3xl sm:text-5xl text-[#342A2A] mt-1">
            Xin Chào, {activeName}
          </h1>
          <p className="text-xs sm:text-sm text-[#342A2A]/75 mt-1">
            Email: <strong>{activeEmail}</strong>
            {user ? (
              <>
                {" "}&bull; Số điện thoại: <strong>{user.phone || "Chưa cập nhật"}</strong>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Link
            to="/custom-design"
            className="px-5 py-2.5 rounded-full bg-[#342A2A] text-[#FFFCF8] text-xs font-semibold uppercase tracking-wider hover:bg-[#B98C68] transition"
          >
            + Gửi Yêu Cầu Thiết Kế Mới
          </Link>
        </div>
      </div>

      {user ? (
        <AccountSettings />
      ) : (
        <div className="bg-[#FFFCF8] rounded-3xl p-6 sm:p-8 border border-[#342A2A]/10 text-center space-y-3">
          <h2 className="font-serif-editorial text-2xl text-[#342A2A]">
            Đăng nhập để quản lý hồ sơ
          </h2>
          <p className="text-sm text-[#342A2A]/70">
            Đăng nhập để cập nhật thông tin cá nhân và lưu các địa chỉ nhận hàng.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/login" className="px-5 py-2.5 rounded-full bg-[#342A2A] text-[#FFFCF8] text-xs font-semibold uppercase tracking-wider hover:bg-[#B98C68] transition">
              Đăng nhập
            </Link>
            <Link to="/register" className="px-5 py-2.5 rounded-full border border-[#B98C68]/50 text-xs font-semibold uppercase tracking-wider hover:bg-[#E8D4C9] transition">
              Tạo tài khoản
            </Link>
          </div>
        </div>
      )}

      {/* Lịch sử Đơn hàng & Yêu cầu Thiết kế */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Orders */}
        <div className="bg-[#FFFCF8] rounded-3xl p-6 sm:p-8 border border-[#342A2A]/10 space-y-5">
          <h2 className="font-serif-editorial text-2xl sm:text-3xl text-[#342A2A]">
            Lịch Sử Đơn Hàng ({orders.length})
          </h2>

          <div className="space-y-4">
            {orders.map((ord) => (
              <div
                key={ord.id}
                className="p-4 rounded-2xl bg-[#F7F1EA] border border-[#342A2A]/10 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-[#342A2A]">
                      #{ord.orderNumber}
                    </span>
                    <span className="text-xs text-[#342A2A]/60 ml-2">
                      {ord.createdAt}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#342A2A] text-[#FFFCF8] text-[10px] font-semibold uppercase">
                      {ord.orderStatus}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#B98C68]/25 text-[#342A2A] text-[10px] font-semibold uppercase">
                      {ord.paymentStatus}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {ord.title && <p>Thiết kế riêng: {ord.title}</p>}
                  {ord.items.map((item, idx) => (
                    <div
                      key={`${ord.id}-${idx}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <span>
                        <strong>{item.name}</strong> ({item.variant}) &times;{" "}
                        {item.quantity}
                      </span>
                      <span className="font-semibold">
                        {formatVnd(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
                {ord.paymentMethod === "MOMO" && ord.paymentStatus === "PENDING" && ord.orderStatus === "PENDING" &&
                  <button type="button" disabled={busy} className="border rounded px-2 py-1"
                    onClick={() => void action(() => orderApi.openMomo(ord.id))}>Mở MoMo Sandbox</button>}
                {ord.paymentMethod === "BANK_TRANSFER" && ord.orderStatus === "PENDING" &&
                  ["PENDING", "FAILED", "AWAITING_VERIFICATION"].includes(ord.paymentStatus ?? "") && (
                  <form className="space-y-2 text-xs" onSubmit={e => {
                    e.preventDefault(); const fields = new FormData(e.currentTarget); const file = fields.get("receipt");
                    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) { setError("Chọn ảnh tối đa 5 MB."); return; }
                    void action(() => orderApi.uploadReceipt(ord.id, file, String(fields.get("reference"))));
                  }}>
                    <label className="block">Mã tham chiếu <input className="border" name="reference" maxLength={100} required /></label>
                    <label className="block">Ảnh biên lai <input name="receipt" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
                    <button className="border rounded px-2 py-1" disabled={busy}>Gửi biên lai</button>
                  </form>
                )}

                <div className="pt-2 border-t border-[#342A2A]/10 flex items-center justify-between text-xs">
                  <span className="text-[#342A2A]/70">
                    Phương thức: {ord.paymentMethod}
                  </span>
                  <span className="text-sm font-bold text-[#B98C68]">
                    Tổng: {formatVnd(ord.totalAmount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Design Requests */}
        <div className="bg-[#FFFCF8] rounded-3xl p-6 sm:p-8 border border-[#342A2A]/10 space-y-5">
          <h2 className="font-serif-editorial text-2xl sm:text-3xl text-[#342A2A]">
            Yêu Cầu Thiết Kế Riêng ({customRequests.length})
          </h2>

          <div className="space-y-4">
            {customRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-2xl bg-[#F7F1EA] border border-[#342A2A]/10 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#342A2A] text-[#FFFCF8] text-[10px] font-bold uppercase">
                    {req.status}
                  </span>
                  <span className="text-xs text-[#342A2A]/60">
                    {req.submittedAt}
                  </span>
                </div>

                <div className="font-serif-editorial text-2xl font-semibold text-[#342A2A]">
                  {req.title}
                </div>
                <div className="text-xs text-[#342A2A]/75">
                  Form: <strong>{req.nailShape}</strong> &bull; Độ dài:{" "}
                  <strong>{req.nailLength}</strong> &bull; Ngân sách dự kiến:{" "}
                  <strong>{formatVnd(req.budget)}</strong>
                </div>

                {req.adminResponse ? (
                  <div className="p-3 rounded-xl bg-[#FFFCF8] border border-[#B98C68]/40 text-xs">
                    <strong className="text-[#B98C68]">
                      Báo giá từ Atelier:
                    </strong>{" "}
                    {req.adminResponse}
                  </div>
                ) : null}

                {req.quotedPrice ? (
                  <div className="flex items-center justify-between pt-2 border-t border-[#342A2A]/10">
                    <span className="text-sm font-bold text-[#B98C68]">
                      Báo giá: {formatVnd(req.quotedPrice)}
                    </span>
                    {req.status === "QUOTED" ? (<>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void action(() => respond(req.id, true))}
                        className="px-4 py-1.5 rounded-full bg-[#3E6B52] text-[#FFFCF8] text-xs font-semibold uppercase tracking-wider"
                      >
                        Chấp Nhận Báo Giá
                      </button>
                      <button type="button" disabled={busy} onClick={() => void action(() => respond(req.id, false))}>Từ chối</button>
                    </>) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
