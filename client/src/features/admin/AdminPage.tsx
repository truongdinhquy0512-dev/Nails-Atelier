import React, { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatVnd } from "../../config/brand";
import { apiClient } from "../../lib/apiClient";
import { useAuth } from "../auth/AuthProvider";
import { catalogChanged, Collection, Product } from "../catalog/catalogApi";
import "./admin.css";

const guard = { headers: { "X-Atelier-Admin": "1" } };
const tabs = [["dashboard", "Tổng quan"], ["orders", "Đơn hàng"], ["payments", "Thanh toán"],
  ["custom-design-requests", "Thiết kế riêng"], ["products", "Sản phẩm"], ["promotions", "Khuyến mãi"],
  ["users", "Khách hàng"], ["email-logs", "Nhật ký email"]] as const;
type Tab = typeof tabs[number][0];
const shapes = ["ALMOND", "COFFIN", "SQUARE", "STILETTO", "ROUND", "OVAL", "SHORT_OVAL"];
const lengths = ["SHORT", "MEDIUM", "LONG", "EXTRA_LONG"];
const statuses: Record<string, string> = { ACTIVE: "Đang bán", DRAFT: "Nháp", HIDDEN: "Đã ẩn", ARCHIVED: "Lưu trữ",
  PENDING: "Đang chờ", CONFIRMED: "Đã xác nhận", PROCESSING: "Đang xử lý", SHIPPING: "Đang giao", COMPLETED: "Hoàn tất",
  PAID: "Đã thanh toán", FAILED: "Thất bại", AWAITING_VERIFICATION: "Chờ đối soát", CANCELLED: "Đã hủy",
  SUBMITTED: "Mới gửi", QUOTED: "Đã báo giá", NEED_INFO: "Cần bổ sung", REJECTED: "Từ chối",
  COD: "COD", BANK_TRANSFER: "Chuyển khoản", MOMO: "MoMo", SENT: "Đã gửi" };
const state = (key: string) => statuses[key] || key;
const nextStatus: Record<string, string> = { PENDING: "CONFIRMED", CONFIRMED: "PROCESSING", PROCESSING: "SHIPPING", SHIPPING: "COMPLETED" };
const table = (head: string[], rows: React.ReactNode[][]) => <div className="na-table"><table>
  <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
  <tbody>{rows.length ? rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v ?? "—"}</td>)}</tr>) :
    <tr><td colSpan={head.length}>Chưa có dữ liệu.</td></tr>}</tbody>
</table></div>;
type ImageChoice = { id: number; src: string } | { file: File; src: string };
const empty = () => ({ name: "", description: "", price: "", stock: "0", status: "DRAFT", collectionId: "",
  isFeatured: false, shapeOptions: ["ALMOND"], lengthOptions: ["MEDIUM"] });
type Row = {
  id: number; status: string; orderCode: string; user?: { fullName: string; email: string }; order?: { orderCode: string };
  payments?: { method: string; status: string }[]; totalAmount: string; amount: string; method: string;
  transferReference?: string; hasReceipt?: boolean; customerName: string; title: string; quotedPrice?: string;
  images?: { id: number }[];
  code: string; discountValue: string; discountType: string; usedCount: number; usageLimit: number;
  fullName: string; email: string; role: string; isActive: boolean; lockedReason: string;
  toEmail: string; subject: string; attempts: number; lastError: string;
};
type Metrics = { orders: number; pending: number; revenue: number; receipts: number; custom: number };

export const AdminPage: React.FC = () => {
  const { status, isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [images, setImages] = useState<ImageChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, reload] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!isAdmin) return;
    const c = new AbortController();
    const opts = { signal: c.signal };
    setLoading(true);
    setError("");
    const load = async () => {
      if (tab === "products") {
        const [p, co] = await Promise.all([apiClient.get<Product[]>("/admin/products", opts), apiClient.get<Collection[]>("/admin/collections", opts)]);
        if (!c.signal.aborted) { setProducts(p.data); setCollections(co.data); }
      } else if (tab === "dashboard") {
        const result = await apiClient.get<Metrics>("/admin/dashboard", opts);
        if (!c.signal.aborted) setMetrics(result.data);
      } else {
        const result = await apiClient.get<Row[]>(`/admin/${tab}`, opts);
        if (!c.signal.aborted) setRows(result.data);
      }
    };
    void load().catch(e => { if (!c.signal.aborted) setError(e.message); })
      .finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [tab, refresh, isAdmin]);
  const change = <K extends keyof ReturnType<typeof empty>>(key: K, value: ReturnType<typeof empty>[K]) => setForm(f => ({ ...f, [key]: value }));
  const reset = () => { setEditing(null); setImages([]); setForm(empty()); };
  const mutate = async (fn: () => Promise<unknown>, message: string, sync = false) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await fn();
      setNotice(message); reload(n => n + 1);
      if (sync) {
        window.dispatchEvent(new Event(catalogChanged));
        try { localStorage.setItem(catalogChanged, String(Date.now())); } catch { /* optional cross-tab refresh */ }
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Không lưu được dữ liệu."); }
    finally { setBusy(false); }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    const payload = new FormData();
    let i = 0;
    const imageOrder = images.map(image => {
      if ("id" in image) return image.id;
      payload.append("images", image.file);
      return `new:${i++}`;
    });
    payload.append("product", JSON.stringify({ ...form, price: Number(form.price), stock: Number(form.stock),
      collectionId: form.collectionId ? Number(form.collectionId) : null, imageOrder }));
    void mutate(async () => {
      if (editing === null) await apiClient.post("/admin/products", payload, guard);
      else await apiClient.patch(`/admin/products/${editing}`, payload, guard);
      reset();
    }, "Đã lưu sản phẩm.", true);
  };
  const edit = (p: Product) => {
    setEditing(p.id);
    setForm({ name: p.name, description: p.description ?? "", price: String(p.price), stock: String(p.stock), status: p.status,
      collectionId: String(p.collections[0]?.collection.id ?? ""), isFeatured: p.isFeatured, shapeOptions: p.shapeOptions, lengthOptions: p.lengthOptions });
    setImages(p.images.map(i => ({ id: i.id, src: i.imageUrl })));
    document.getElementById("na-product-form")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const pickFiles = async (files: File[]) => {
    if (images.length + files.length > 5 || files.some(f => !["image/jpeg", "image/png", "image/webp"].includes(f.type) || f.size > 5 * 1024 * 1024)) {
      setError("Tối đa 5 ảnh JPG, PNG hoặc WebP, mỗi ảnh không quá 5 MB."); return;
    }
    try {
      const previews = await Promise.all(files.map(file => new Promise<ImageChoice>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res({ file, src: String(reader.result) });
        reader.onerror = rej;
        reader.readAsDataURL(file);
      })));
      setImages(items => [...items, ...previews].slice(0, 5));
      setError("");
    } catch { setError("Không đọc được ảnh."); }
  };
  const patch = (path: string, body: unknown) => void mutate(() => apiClient.patch(`/admin/${path}`, body, guard), "Đã cập nhật.");
  if (status === "loading") return <p className="na-admin">Đang kiểm tra phiên đăng nhập…</p>;
  if (!isAdmin) return <section className="na-admin"><h1>Khu vực quản trị</h1><p>Vui lòng đăng nhập bằng tài khoản quản trị.</p><Link to="/login">Đăng nhập</Link></section>;
  return <section className="na-admin">
    <header><small>NAIL ATELIER / QUẢN TRỊ</small><h1>Tổng quan vận hành Nail Atelier</h1><Link to="/">Về cửa hàng</Link></header>
    <nav aria-label="Phân hệ quản trị">{tabs.map(([key, label]) => <button key={key} disabled={busy} className={key === tab ? "na-selected" : ""} onClick={() => { setTab(key); setRows([]); setNotice(""); }}>{label}</button>)}</nav>
    <h2>{tabs.find(([key]) => key === tab)?.[1]}</h2>
    {loading && <p role="status">Đang tải dữ liệu…</p>}{error && <p role="alert" className="na-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {tab === "dashboard" && metrics && <div className="na-kpis">
      {[["Tổng số đơn", metrics.orders], ["Đơn chờ xử lý", metrics.pending], ["Doanh thu đã thanh toán", formatVnd(metrics.revenue)],
        ["Biên lai chờ xác minh", metrics.receipts], ["Yêu cầu cần xử lý", metrics.custom]].map(([label, value]) => <div className="na-card" key={label}><small>{label}</small><strong>{value}</strong></div>)}
    </div>}
    {tab === "products" && <>
      <form className="na-card" id="na-product-form" onSubmit={save}>
        <h3>{editing === null ? "Thêm sản phẩm mới" : "Sửa sản phẩm"}</h3>
        <fieldset disabled={busy || loading} className="na-fields">
          <label>Tên sản phẩm<input required minLength={3} maxLength={255} value={form.name} onChange={e => change("name", e.target.value)} /></label>
          <label>Bộ sưu tập<select value={form.collectionId} onChange={e => change("collectionId", e.target.value)}>
            <option value="">Không chọn</option>{collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <label>Giá (₫)<input required type="number" min={10000} step={1} value={form.price} onChange={e => change("price", e.target.value)} /></label>
          <label>Tồn kho<input required type="number" min={0} step={1} value={form.stock} onChange={e => change("stock", e.target.value)} /></label>
          <label>Trạng thái<select value={form.status} onChange={e => change("status", e.target.value)}>{["DRAFT", "ACTIVE", "HIDDEN", "ARCHIVED"].map(s => <option value={s} key={s}>{state(s)}</option>)}</select></label>
          <label>Dáng móng<select multiple required value={form.shapeOptions} onChange={e => change("shapeOptions", Array.from(e.target.selectedOptions, o => o.value))}>{shapes.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Độ dài<select multiple required value={form.lengthOptions} onChange={e => change("lengthOptions", Array.from(e.target.selectedOptions, o => o.value))}>{lengths.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Mô tả<textarea maxLength={5000} value={form.description} onChange={e => change("description", e.target.value)} /></label>
          <label className="na-check"><input type="checkbox" checked={form.isFeatured} onChange={e => change("isFeatured", e.target.checked)} /> Nổi bật</label>
          <label>Ảnh (JPG, PNG, WebP · tối đa 5 ảnh, 5 MB/ảnh)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { void pickFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} /></label>
          <div className="na-images">{images.map((im, i) => <div key={i}><img src={im.src} alt={`Ảnh sản phẩm ${i + 1}`} />
            {i === 0 ? <small>Ảnh chính</small> : <button type="button" onClick={() => setImages(items => [items[i], ...items.filter((_, j) => i !== j)])}>Đặt làm ảnh chính</button>}
            <button type="button" onClick={() => setImages(items => items.filter((_, j) => i !== j))}>Gỡ ảnh</button>
          </div>)}</div>
          <div><button className="na-primary">{editing === null ? "Thêm sản phẩm" : "Lưu thay đổi"}</button> {editing !== null && <button type="button" onClick={reset}>Hủy sửa</button>}</div>
        </fieldset>
      </form>
      <button disabled={busy} onClick={() => { const name = prompt("Tên bộ sưu tập mới:"); if (name?.trim()) void mutate(() => apiClient.post("/admin/collections", { name }, guard), "Đã tạo bộ sưu tập.", true); }}>Tạo bộ sưu tập</button>
      {table(["Sản phẩm", "Bộ sưu tập", "Giá", "Tồn kho", "Trạng thái", "Thao tác"], products.map(p => [
        <div className="na-product">{p.images[0] && <img src={p.images[0].imageUrl} alt="" />}{p.name}</div>,
        p.collections.map(c => c.collection.name).join(", ") || "—", formatVnd(Number(p.price)), p.stock,
        p.status === "ACTIVE" && !p.stock ? "Hết hàng" : state(p.status),
        <><button disabled={busy} onClick={() => edit(p)}>Sửa</button> <button disabled={busy} onClick={() => {
          if (confirm(`Xóa vĩnh viễn “${p.name}”?`)) void mutate(async () => { await apiClient.delete(`/admin/products/${p.id}`, guard); if (editing === p.id) reset(); }, "Đã xóa sản phẩm.", true);
        }}>Xóa</button></>,
      ]))}
      <p>Sản phẩm đã có trong đơn hàng không thể xóa cứng. Hãy sửa trạng thái sang Lưu trữ.</p>
    </>}
    {tab === "orders" && table(["Mã đơn", "Khách hàng", "Phương thức", "Thanh toán", "Trạng thái", "Tổng tiền", "Thao tác"], rows.map(r => {
      const p = r.payments?.[0];
      return [r.orderCode, r.user?.fullName ?? r.user?.email, p && state(p.method), p && state(p.status), state(r.status), formatVnd(Number(r.totalAmount)),
        <>{nextStatus[r.status] && p && (p.method === "COD" || p.status === "PAID") &&
          <button disabled={busy} onClick={() => patch(`orders/${r.id}/status`, { status: nextStatus[r.status] })}>Chuyển sang {state(nextStatus[r.status])}</button>}{" "}
          {p && p.status !== "PAID" && ["PENDING", "CONFIRMED", "PROCESSING"].includes(r.status) &&
          <button disabled={busy} onClick={() => {
            const reason = prompt("Lý do hủy đơn:");
            if (reason?.trim()) void mutate(() => apiClient.patch(`/admin/orders/${r.id}/cancel`, { reason }, guard), "Đã hủy đơn và hoàn tồn kho.", true);
          }}>Hủy đơn</button>}</>];
    }))}
    {tab === "payments" && table(["Mã đơn", "Phương thức", "Số tiền", "Trạng thái", "Mã tham chiếu", "Đối soát"], rows.map(r => [
      r.order?.orderCode, state(r.method), formatVnd(Number(r.amount)), state(r.status), r.transferReference,
      r.method === "BANK_TRANSFER" && r.status === "AWAITING_VERIFICATION" && r.hasReceipt ? <>
        <a href={`/api/admin/payments/${r.id}/receipt`} target="_blank" rel="noreferrer">Xem ảnh</a>{" "}
        <button disabled={busy} onClick={() => { if (confirm("Xác nhận đã nhận tiền?")) patch(`payments/${r.id}/verify`, { approve: true }); }}>Xác nhận</button>{" "}
        <button disabled={busy} onClick={() => patch(`payments/${r.id}/verify`, { approve: false })}>Từ chối</button></> : "—",
    ]))}
    {tab === "custom-design-requests" && table(["Khách hàng", "Ý tưởng", "Ảnh tham khảo", "Trạng thái", "Báo giá", "Thao tác"], rows.map(r => [
      r.customerName, r.title, r.images?.map((i, index) => <a style={{ marginRight: 8 }} key={i.id} href={`/api/admin/custom-images/${i.id}`} target="_blank" rel="noreferrer">Ảnh {index + 1}</a>),
      state(r.status), r.quotedPrice ? formatVnd(Number(r.quotedPrice)) : "—",
      ["SUBMITTED", "NEED_INFO"].includes(r.status) ? <>
        <button disabled={busy} onClick={() => { const price = prompt("Giá báo (VND):"); if (price) patch(`custom-design-requests/${r.id}`, { status: "QUOTED", quotedPrice: Number(price) }); }}>Báo giá</button>{" "}
        {(["NEED_INFO", "REJECTED"] as const).map(status => <button key={status} disabled={busy} onClick={() => { const note = prompt("Nội dung gửi khách:"); if (note) patch(`custom-design-requests/${r.id}`, { status, note }); }}>{state(status)}</button>)}</> : "—",
    ]))}
    {tab === "users" && table(["Khách hàng", "Email", "Vai trò", "Trạng thái", "Lý do khóa", "Thao tác"], rows.map(r => [
      r.fullName, r.email, r.role, r.isActive ? "Hoạt động" : "Đã khóa", r.lockedReason,
      r.role === "CUSTOMER" ? <button disabled={busy} onClick={() => {
        const reason = r.isActive ? prompt("Lý do khóa tài khoản:") : null;
        if (!r.isActive || reason?.trim()) patch(`users/${r.id}`, { isActive: !r.isActive, reason });
      }}>{r.isActive ? "Khóa" : "Mở khóa"}</button> : "—",
    ]))}
    {tab === "promotions" && <>
      <form className="na-card na-fields" onSubmit={e => {
        e.preventDefault(); const form = e.currentTarget; const f = new FormData(form);
        void mutate(async () => {
          await apiClient.post("/admin/promotions", { code: f.get("code"), discountType: f.get("type"),
            discountValue: Number(f.get("value")), maxDiscount: Number(f.get("max")), minOrderAmount: Number(f.get("min")), usageLimit: Number(f.get("limit")) }, guard);
          form.reset();
        }, "Đã tạo mã khuyến mãi.");
      }}>
        <label>Mã<input name="code" required minLength={4} maxLength={20} /></label>
        <label>Loại<select name="type"><option value="FIXED">Giảm tiền</option><option value="PERCENT">Giảm %</option></select></label>
        <label>Giá trị<input required name="value" type="number" min={1} /></label>
        <label>Giảm tối đa (cho mã %)<input name="max" type="number" min={0} /></label>
        <label>Đơn tối thiểu<input name="min" type="number" min={0} /></label>
        <label>Giới hạn lượt dùng<input required name="limit" type="number" min={1} defaultValue={50} /></label>
        <div><button className="na-primary" disabled={busy}>Tạo mã (30 ngày)</button></div>
      </form>
      {table(["Mã", "Giá trị", "Lượt dùng", "Trạng thái", "Thao tác"], rows.map(r => [
        r.code, r.discountType === "PERCENT" ? `${r.discountValue}%` : formatVnd(Number(r.discountValue)),
        `${r.usedCount} / ${r.usageLimit ?? "∞"}`, r.isActive ? "Đang bật" : "Đã tắt",
        <button disabled={busy} onClick={() => patch(`promotions/${r.id}`, { isActive: !r.isActive })}>{r.isActive ? "Tắt" : "Bật"}</button>,
      ]))}
    </>}
    {tab === "email-logs" && table(["Người nhận", "Sự kiện", "Trạng thái", "Số lần gửi", "Lỗi", "Thao tác"], rows.map(r => [
      r.toEmail, r.subject, state(r.status), r.attempts, r.lastError,
      r.status === "FAILED" ? <button disabled={busy} onClick={() => void mutate(async () => {
        const { data } = await apiClient.post<Row>(`/admin/email-logs/${r.id}/retry`, {}, guard);
        if (data.status !== "SENT") { reload(n => n + 1); throw new Error(data.lastError || "Gửi lại thất bại."); }
      }, "Đã gửi lại email.")}>Gửi lại</button> : "—",
    ]))}
  </section>;
};
