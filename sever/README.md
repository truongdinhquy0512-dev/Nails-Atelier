# Nail Atelier — Quản trị

Express khởi động tại `sever/srv/server.ts`; `sever/srv/admin.ts` chứa các API quản trị, thiết kế riêng, lịch sử đơn và biên lai. `sever/` nằm cùng cấp với `client/`. Giao diện React được phục vụ ở `/admin`. File HTML mẫu bên ngoài dự án không bị thay đổi.

## Chạy trên máy phát triển

1. Mở Docker Desktop, rồi chạy ở thư mục gốc: `docker compose up -d`.
2. Kiểm tra `DATABASE_URL` trong `.env` trỏ tới PostgreSQL của dự án. Chạy `npm.cmd install`, `npx.cmd prisma generate`, rồi `npx.cmd prisma migrate deploy`.
3. Chạy `npm.cmd run dev` ở thư mục gốc. Mở terminal khác trong `client`, chạy `npm.cmd install` rồi `npm.cmd run dev`.
4. Đăng nhập ở `http://localhost:5173/login`. Nếu chưa có Admin, đăng ký tài khoản của bạn trước, rồi dùng Prisma Studio (`npx.cmd prisma studio`) đổi `role` của đúng tài khoản sang `ADMIN`. Đăng nhập lại và mở `http://localhost:5173/admin`.

Không cấp quyền qua giao diện đăng ký. Các thao tác ghi của Admin yêu cầu phiên đăng nhập có quyền `ADMIN` và header `X-Atelier-Admin: 1`.

Để nhập lại 4 sản phẩm và 3 bộ sưu tập mẫu, chạy `npm.cmd run db:seed:catalog` từ thư mục gốc sau khi migration hoàn tất. Lệnh tái sử dụng ảnh trong `client/public/images/` và không ghi đè bản ghi đã có cùng slug.

## Kiểm tra thủ công

- Admin: tạo bộ sưu tập, tạo sản phẩm **Đang bán** với một ảnh và tồn kho dương. Mở `/catalog` và `/collections`; kiểm tra tên, giá, ảnh. Sửa giá và ảnh chính, kiểm tra cập nhật; chuyển sang **Lưu trữ**, kiểm tra sản phẩm không còn xuất hiện. Sản phẩm đã có trong đơn hàng hoặc giỏ hàng không xóa cứng được.
- Khách: đặt một đơn chuyển khoản, gửi ảnh biên lai từ giỏ hàng hoặc trang tài khoản. Admin xem ảnh tại tab Thanh toán và xác nhận hoặc từ chối. Với COD, trạng thái thanh toán chuyển thành đã thanh toán khi Admin xác nhận giao hoàn tất.
- Khách: thêm số điện thoại và địa chỉ, gửi thiết kế kèm ảnh. Admin mở ảnh và báo giá. Khi khách chấp nhận, một đơn chuyển khoản được tạo theo giá báo; khách có thể gửi biên lai trong tài khoản.

Ảnh sản phẩm được lưu trong `sever/uploads/products` mặc định. Có thể đặt `PRODUCT_UPLOAD_DIR` thành thư mục lưu trữ bền vững; sao lưu thư mục ảnh cùng cơ sở dữ liệu. Dev proxy của Vite chuyển cả API và ảnh qua `/api`.

Để gửi email và thử thao tác Gửi lại, đặt `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` và, nếu nhà cung cấp yêu cầu, `SMTP_USER`, `SMTP_PASS` trong `.env` của backend. Thiếu cấu hình hoặc gửi lỗi được ghi vào nhật ký, không hoàn tác đơn hàng.

MoMo chỉ dùng máy chủ Sandbox. Đặt `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `MOMO_IPN_URL` (URL HTTPS công khai trỏ tới `POST /api/payments/momo/ipn`) và `MOMO_REDIRECT_URL` (trang tài khoản frontend). Checkout chỉ hiển thị MoMo khi đủ cấu hình. Việc quay lại cửa hàng không xác nhận thanh toán; trạng thái chỉ đổi từ IPN có chữ ký và số tiền hợp lệ. Không có nút giả lập thanh toán trong trang quản trị.
