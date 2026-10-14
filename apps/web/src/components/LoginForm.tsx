import type { FormEvent } from "react";
interface Props {
  appName: string;
  email: string;
  password: string;
  busy: boolean;
  error: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}
export function LoginForm(props: Props) {
  return (
    <main className="login-shell">
      <section className="login-intro">
        <span className="brand-mark" aria-hidden="true">
          ↗
        </span>
        <p className="eyebrow">ĐHQG–HCM · DI CHUYỂN ĐIỆN</p>
        <h1>
          Một mạng lưới.
          <br />
          Nhiều điểm đến.
        </h1>
        <p>
          Kết nối hành trình với xe điện, chỗ đỗ và điểm sạc trong khu đô thị
          đại học.
        </p>
        <div className="route-graphic" aria-hidden="true">
          <span>METRO</span>
          <i />
          <span>CAMPUS</span>
          <i />
          <span>KÝ TÚC XÁ</span>
        </div>
      </section>
      <section className="login-card">
        <p className="eyebrow">{props.appName}</p>
        <h2>Chào mừng trở lại</h2>
        <p className="muted">Đăng nhập để xem mạng lưới Mobility Hub.</p>
        <form onSubmit={props.onSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={props.email}
            onChange={(e) => props.onEmail(e.target.value)}
          />
          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            value={props.password}
            onChange={(e) => props.onPassword(e.target.value)}
          />
          {props.error && (
            <p className="notice error" role="alert">
              {props.error}
            </p>
          )}
          <button className="primary" type="submit" disabled={props.busy}>
            {props.busy ? "Đang đăng nhập…" : "Đăng nhập →"}
          </button>
        </form>
        <p className="login-note">
          Dành cho sinh viên và đơn vị vận hành ĐHQG–HCM.
        </p>
      </section>
    </main>
  );
}
