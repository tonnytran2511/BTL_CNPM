## Thay đổi

- Task / yêu cầu liên quan:
- Hành vi trước và sau thay đổi:
- Chủ module:

## Tích hợp

- API / contract / migration thay đổi:
- Service được module khác sử dụng:
- Quy tắc nghiệp vụ áp dụng (BR trong docs/business-rules.md):

## Kiểm chứng

- Lệnh và kết quả test thực tế:
- Luồng thường, sai quyền, lỗi trạng thái và xung đột tài nguyên:
- Ảnh / log / test case liên quan:

## Checklist

- [ ] Đọc AGENTS.md và DESIGN.md; component chỉ UI.
- [ ] Không hardcode dữ liệu hoặc tham số nghiệp vụ trong UI/service.
- [ ] Thay đổi trạng thái/tài nguyên cùng transaction; test rollback nếu liên quan.
- [ ] Không sửa migration đã chia sẻ; không có secret trong diff.
- [ ] Cập nhật contract, sơ đồ và tài liệu liên quan.
- [ ] Build, format và test phù hợp pass.
- [ ] Nêu hạn chế/chưa triển khai và ghi nhận việc dùng AI.
