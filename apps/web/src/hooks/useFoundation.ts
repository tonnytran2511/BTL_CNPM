import { useCallback, useEffect, useRef, useState } from "react";
import type {
  User,
  PublicConfig,
  HubSummary,
  NetworkOverview,
} from "@emobility/contracts";
import { api, RequestError } from "../api/client";
import { dashboardStats } from "../models/dashboard";
import { roleLabel } from "../utils/format";
export function useFoundation() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState("");
  const [hubs, setHubs] = useState<HubSummary[]>([]);
  const [overview, setOverview] = useState<NetworkOverview | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const generation = useRef(0);
  const inFlight = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const reset = useCallback(() => {
    generation.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    inFlight.current = false;
    setRefreshing(false);
    setUser(null);
    setHubs([]);
    setOverview(null);
    setUpdatedAt(null);
  }, []);
  const sessionExpired = useCallback(() => {
    reset();
    setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }, [reset]);
  const initialize = useCallback(async (signal?: AbortSignal) => {
    setBooting(true);
    setError("");
    try {
      const next = await api.config(signal);
      if (signal?.aborted) return;
      setConfig(next);
      document.title = next.appName;
      try {
        const nextUser = await api.me(signal);
        if (!signal?.aborted) setUser(nextUser);
      } catch (e) {
        if (!(e instanceof RequestError && e.status === 401)) throw e;
      }
    } catch (e) {
      if (!signal?.aborted)
        setError(e instanceof Error ? e.message : "Không thể tải ứng dụng.");
    } finally {
      if (!signal?.aborted) setBooting(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void initialize(controller.signal);
    return () => controller.abort();
  }, [initialize]);
  const refresh = useCallback(async () => {
    if (!user || inFlight.current) return;
    const current = generation.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const next =
        user.role === "operator"
          ? await api.overview(controller.signal)
          : await api.hubs(controller.signal);
      if (current !== generation.current || controller.signal.aborted) return;
      if (Array.isArray(next)) {
        setHubs(next);
        setOverview(null);
        setUpdatedAt(new Date().toISOString());
      } else {
        setHubs(next.hubs);
        setOverview(next);
        setUpdatedAt(next.updatedAt);
      }
      setError("");
    } catch (e) {
      if (current !== generation.current || controller.signal.aborted) return;
      if (e instanceof RequestError && e.status === 401) {
        sessionExpired();
        return;
      }
      setError(e instanceof Error ? e.message : "Không thể cập nhật dữ liệu.");
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        inFlight.current = false;
        setRefreshing(false);
      }
    }
  }, [user, sessionExpired]);
  useEffect(() => {
    if (!config || !user) return;
    void refresh();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(refreshVisible, config.pollIntervalMs);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
      generation.current += 1;
      activeRequest.current?.abort();
      activeRequest.current = null;
      inFlight.current = false;
    };
  }, [config, user, refresh]);
  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await api.login(email.trim(), password);
      generation.current += 1;
      setUser(next);
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đăng nhập.");
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await api.logout();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đăng xuất.");
    } finally {
      setBusy(false);
    }
  };
  return {
    config,
    user,
    booting,
    error,
    hubs,
    updatedAt,
    refreshing,
    busy,
    email,
    password,
    setEmail,
    setPassword,
    login,
    logout,
    sessionExpired,
    refresh,
    retry: () => initialize(),
    stats: dashboardStats(hubs, overview),
    role: user ? roleLabel(user.role) : "",
    heading:
      user?.role === "operator"
        ? "Toàn cảnh mạng lưới"
        : "Tìm điểm di chuyển của bạn",
  };
}
