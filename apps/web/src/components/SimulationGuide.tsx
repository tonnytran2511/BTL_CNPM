export function SimulationGuide() {
  return (
    <article className="simulation-guide">
      <section className="hero">
        <div>
          <p className="eyebrow">HƯỚNG DẪN SỬ DỤNG</p>
          <h2 id="simulation-guide-title">Chạy và đọc mô phỏng</h2>
          <p>
            Dùng kịch bản tăng nhu cầu để tìm hiểu khi nào Hub có thể thiếu xe.
          </p>
        </div>
      </section>
      <section className="guide-card" aria-labelledby="guide-start">
        <h2 id="guide-start">1. Chọn Hub và nhập tham số</h2>
        <p>
          Đăng nhập bằng tài khoản vận hành. Chọn một Hub đang hoạt động từ danh
          sách, rồi nhập các thông số dưới đây.
        </p>
        <dl className="guide-definitions">
          <div>
            <dt>Thời lượng (phút)</dt>
            <dd>Khoảng thời gian muốn quan sát, ví dụ 60 phút.</dd>
          </div>
          <div>
            <dt>Bước thời gian (phút)</dt>
            <dd>
              Độ dài mỗi lần tính. Ví dụ bước 5 phút trong 60 phút tạo 12 bước.
              Thời lượng phải chia hết cho bước và bước không được lớn hơn thời
              lượng.
            </dd>
          </div>
          <div>
            <dt>Seed ngẫu nhiên (Cài đặt nâng cao)</dt>
            <dd>
              Mặc định là 42; có thể giữ nguyên khi chạy thông thường. Ô Seed
              luôn hiển thị trong form nếu muốn đổi. Số nguyên này dùng để tái
              lập biến thiên nhu cầu. Giữ cùng seed, snapshot và tham số để nhận
              cùng kết quả; dùng seed khác để thử diễn biến khác. Ví dụ: seed 42
              cho phép chạy lại cùng chuỗi nhu cầu; seed 43 thử một chuỗi khác.
              Seed không phải số xe hay số yêu cầu.
            </dd>
          </div>
          <div>
            <dt>Nhu cầu ban đầu (yêu cầu/bước)</dt>
            <dd>
              Số yêu cầu trung bình trong mỗi bước của trường hợp so sánh. Có
              thể nhập số thập phân; số thực tế ở mỗi bước sẽ biến thiên.
            </dd>
          </div>
          <div>
            <dt>Nhu cầu kịch bản (yêu cầu/bước)</dt>
            <dd>
              Mức nhu cầu muốn thử, phải lớn hơn hoặc bằng nhu cầu ban đầu. Khi
              đổi độ dài bước, hãy điều chỉnh cả hai mức nhu cầu theo đơn vị
              mới.
            </dd>
          </div>
        </dl>
        <p>
          Giới hạn số bước, nhu cầu và ngưỡng pin được hiển thị trên trang mô
          phỏng theo cấu hình hiện tại.
        </p>
      </section>
      <section className="guide-card" aria-labelledby="guide-example">
        <h2 id="guide-example">2. Thử một lần chạy</h2>
        <p>
          Chọn Ngẫu nhiên tham số để điền nhanh các giá trị số hợp lệ. Hub đang
          chọn được giữ nguyên; kiểm tra tham số rồi chọn Chạy mô phỏng. Nút này
          không tự chạy và không thay đổi kết quả của lần chạy trước.
        </p>
        <p>
          Ví dụ học cách dùng: chọn một Hub bất kỳ đang hoạt động, nhập thời
          lượng <strong>60</strong>, bước <strong>5</strong>, seed{" "}
          <strong>42</strong>, nhu cầu ban đầu <strong>0.2</strong> và nhu cầu
          kịch bản <strong>2</strong>. Đây là tham số minh họa, không phải số
          liệu nhu cầu thực tế.
        </p>
        <p>
          Chọn <strong>Chạy mô phỏng</strong>. Hệ thống lấy một bản chụp trạng
          thái (snapshot) mới và dùng cùng snapshot, seed cho cả hai trường hợp.
          Mở <strong>Diễn biến từng bước</strong> để xem 12 bước của ví dụ.
        </p>
      </section>
      <section className="guide-card" aria-labelledby="guide-results">
        <h2 id="guide-results">3. Đọc kết quả</h2>
        <dl className="guide-definitions">
          <div>
            <dt>Xe đủ điều kiện đầu kỳ</dt>
            <dd>
              Xe có sẵn tại Hub và đạt ngưỡng pin tối thiểu tại thời điểm chụp.
              Xe đang giữ, thuê, sạc hoặc bảo trì không được tính.
            </dd>
          </div>
          <div>
            <dt>Tổng yêu cầu</dt>
            <dd>
              Tổng nhu cầu đã sinh trong các bước. Nhu cầu kịch bản cao hơn có
              thể tạo nhiều yêu cầu không được đáp ứng hơn.
            </dd>
          </div>
          <div>
            <dt>Được phục vụ</dt>
            <dd>
              Số yêu cầu nhận được xe. Mỗi xe chỉ phục vụ tối đa một yêu cầu
              trong mô hình hiện tại.
            </dd>
          </div>
          <div>
            <dt>Không được phục vụ</dt>
            <dd>
              Số yêu cầu đến khi không còn xe đủ điều kiện. Tổng yêu cầu bằng
              được phục vụ cộng không được phục vụ.
            </dd>
          </div>
          <div>
            <dt>Xe còn lại</dt>
            <dd>
              Xe đầu kỳ đủ điều kiện trừ số đã phục vụ. Nếu cả hai trường hợp
              đều dùng hết xe, số được phục vụ có thể bằng nhau dù nhu cầu rất
              khác.
            </dd>
          </div>
        </dl>
        <p>
          Kiểm tra tên Hub, thời điểm snapshot và tham số ghi cạnh kết quả. Thay
          đổi ô nhập chưa làm thay đổi kết quả cũ; cần chạy lại. Mỗi lần chạy
          lấy snapshot mới nên dữ liệu vận hành thay đổi có thể làm kết quả khác
          dù seed giống nhau.
        </p>
      </section>
      <section className="guide-card" aria-labelledby="guide-errors">
        <h2 id="guide-errors">Khi kết quả chưa như mong đợi</h2>
        <ul>
          <li>
            <strong>Không có Hub để chọn:</strong> kiểm tra danh sách Hub có tải
            được không và có Hub đang hoạt động không; dùng nút tải lại nếu có
            lỗi.
          </li>
          <li>
            <strong>Lỗi tham số:</strong> kiểm tra thời lượng chia hết bước, nhu
            cầu kịch bản ≥ ban đầu và các giới hạn hiển thị.
          </li>
          <li>
            <strong>Không phục vụ được yêu cầu nào:</strong> xem số xe đủ điều
            kiện đầu kỳ; Hub có thể không có xe sẵn sàng đạt ngưỡng pin.
          </li>
          <li>
            <strong>Muốn kiểm tra trường hợp không có nhu cầu:</strong> đặt cả
            hai mức nhu cầu bằng 0. Số yêu cầu sẽ bằng 0 và số xe đủ điều kiện
            được giữ nguyên trong kết quả.
          </li>
        </ul>
      </section>
      <aside className="guide-limit">
        <h2>Phạm vi mô hình hiện tại</h2>
        <p>
          Mô phỏng chỉ xét lượt lấy xe rời một Hub. Chưa tính trả xe, sạc, hàng
          chờ, điều chuyển hoặc đề xuất. Kết quả là thử nghiệm theo giả định,
          chưa phải dự báo nhu cầu thực tế. Mô phỏng không đặt xe hay thay đổi
          dữ liệu vận hành.
        </p>
        <p>
          Chọn Lưu báo cáo mô phỏng (.txt) trong phần kết quả để tải báo cáo về
          máy. Báo cáo gồm tham số của lần chạy, thời điểm snapshot, bảng so
          sánh và diễn biến của cả hai trường hợp. Kết quả chưa được lưu thành
          lịch sử; tải lại trang sẽ xóa kết quả đang xem, nhưng file đã tải vẫn
          được giữ trên máy.
        </p>
      </aside>
    </article>
  );
}
