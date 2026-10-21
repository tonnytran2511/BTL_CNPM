import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { HubDetail, UpdateHubRequest, User } from "@emobility/contracts";
import { api, RequestError } from "../api/client";
import type {
  HubCreateField,
  HubCreateForm,
  HubEditField,
  HubEditForm,
  HubManagementModel,
} from "../models/hubManagement";

const emptyCreateForm: HubCreateForm = { code: "", name: "", location: "" };
type EditableHubValues = Pick<
  HubEditForm,
  "name" | "location" | "status" | "capacity"
>;

interface HubManagementState {
  session: User | null;
  hubs: HubDetail[];
  editForms: Record<string, HubEditForm>;
  baselineForms: Record<string, EditableHubValues>;
  createForm: HubCreateForm;
  error: string;
  busy: boolean;
}

function emptyState(session: User | null): HubManagementState {
  return {
    session,
    hubs: [],
    editForms: {},
    baselineForms: {},
    createForm: emptyCreateForm,
    error: "",
    busy: false,
  };
}

function editableValues(hub: HubDetail): EditableHubValues {
  return {
    name: hub.name,
    location: hub.location,
    status: hub.status,
    capacity: String(hub.parking.capacity),
  };
}

function editFormFromHub(hub: HubDetail): HubEditForm {
  return { ...editableValues(hub), chargingPointCode: "" };
}

function mergeEditForm(
  current: HubEditForm,
  baseline: EditableHubValues,
  latest: EditableHubValues,
): HubEditForm {
  return {
    name: current.name === baseline.name ? latest.name : current.name,
    location:
      current.location === baseline.location
        ? latest.location
        : current.location,
    status: current.status === baseline.status ? latest.status : current.status,
    capacity:
      current.capacity === baseline.capacity
        ? latest.capacity
        : current.capacity,
    chargingPointCode: current.chargingPointCode,
  };
}

function isAccessError(error: unknown): error is RequestError {
  return error instanceof RequestError && [401, 403].includes(error.status);
}

export function useHubManagement(
  user: User | null,
  enabled: boolean,
  onSessionExpired: () => void,
  onAccessRevoked: () => void,
): HubManagementModel {
  const session = user?.role === "operator" ? user : null;
  const [stored, setStored] = useState(() => emptyState(session));
  const sessionRef = useRef(session);
  const invalidatedSessionRef = useRef<User | null>(null);
  const previousSessionRef = useRef(session);
  const enabledRef = useRef(enabled);
  const controllers = useRef(new Set<AbortController>());
  const refreshController = useRef<AbortController | null>(null);
  sessionRef.current = session;
  enabledRef.current = enabled;
  if (previousSessionRef.current !== session) {
    previousSessionRef.current = session;
    invalidatedSessionRef.current = null;
  }

  const update = useCallback(
    (
      owner: User,
      change: (current: HubManagementState) => HubManagementState,
    ) => {
      if (
        sessionRef.current !== owner ||
        invalidatedSessionRef.current === owner ||
        !enabledRef.current
      )
        return;
      setStored((current) =>
        current.session === owner ? change(current) : current,
      );
    },
    [],
  );

  const abortRequests = useCallback(() => {
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();
    refreshController.current = null;
  }, []);

  const invalidateSession = useCallback(
    (owner: User, status: 401 | 403) => {
      if (
        sessionRef.current !== owner ||
        invalidatedSessionRef.current === owner
      )
        return;
      invalidatedSessionRef.current = owner;
      abortRequests();
      setStored((current) =>
        current.session === owner ? emptyState(owner) : current,
      );
      if (status === 401) onSessionExpired();
      else onAccessRevoked();
    },
    [abortRequests, onAccessRevoked, onSessionExpired],
  );

  const refreshData = useCallback(
    async (owner: User): Promise<boolean> => {
      if (
        sessionRef.current !== owner ||
        invalidatedSessionRef.current === owner ||
        !enabledRef.current
      )
        return false;
      refreshController.current?.abort();
      const controller = new AbortController();
      refreshController.current = controller;
      controllers.current.add(controller);
      const active = () =>
        sessionRef.current === owner &&
        invalidatedSessionRef.current !== owner &&
        enabledRef.current &&
        !controller.signal.aborted;
      update(owner, (current) => ({ ...current, error: "" }));
      try {
        const currentUser = await api.me(controller.signal);
        if (!active()) return false;
        if (currentUser.id !== owner.id || currentUser.role !== owner.role) {
          invalidateSession(owner, 403);
          return false;
        }
        const summaries = await api.hubs(controller.signal);
        const details = await Promise.all(
          summaries.map((hub) => api.detail(hub.id, controller.signal)),
        );
        if (!active()) return false;
        setStored((current) => {
          if (current.session !== owner) return current;
          const nextForms: Record<string, HubEditForm> = {};
          const nextBaselines: Record<string, EditableHubValues> = {};
          for (const hub of details) {
            const latest = editableValues(hub);
            const form = current.editForms[hub.id];
            const baseline = current.baselineForms[hub.id];
            nextForms[hub.id] =
              form && baseline
                ? mergeEditForm(form, baseline, latest)
                : editFormFromHub(hub);
            nextBaselines[hub.id] = latest;
          }
          return {
            ...current,
            hubs: details,
            editForms: nextForms,
            baselineForms: nextBaselines,
            error: "",
          };
        });
        return true;
      } catch (error) {
        if (!active()) return false;
        if (isAccessError(error)) {
          invalidateSession(owner, error.status as 401 | 403);
          return false;
        }
        update(owner, (current) => ({
          ...current,
          error:
            error instanceof Error
              ? error.message
              : "Không thể tải danh sách Hub.",
        }));
        return false;
      } finally {
        controllers.current.delete(controller);
        if (refreshController.current === controller)
          refreshController.current = null;
      }
    },
    [invalidateSession, update],
  );

  useEffect(() => {
    setStored((current) =>
      current.session === session ? current : emptyState(session),
    );
    return abortRequests;
  }, [abortRequests, session]);

  useEffect(() => {
    if (!session || !enabled) return;
    void refreshData(session);
    return () => refreshController.current?.abort();
  }, [enabled, refreshData, session]);

  const mutate = async (
    owner: User,
    work: () => Promise<unknown>,
    afterSuccess?: () => void,
  ): Promise<boolean> => {
    if (
      sessionRef.current !== owner ||
      invalidatedSessionRef.current === owner ||
      !enabledRef.current
    )
      return false;
    const controller = new AbortController();
    controllers.current.add(controller);
    update(owner, (current) => ({ ...current, busy: true, error: "" }));
    try {
      const currentUser = await api.me(controller.signal);
      if (
        controller.signal.aborted ||
        sessionRef.current !== owner ||
        invalidatedSessionRef.current === owner ||
        !enabledRef.current
      )
        return false;
      if (currentUser.id !== owner.id || currentUser.role !== owner.role) {
        invalidateSession(owner, 403);
        return false;
      }
      await work();
      if (
        sessionRef.current !== owner ||
        invalidatedSessionRef.current === owner ||
        !enabledRef.current
      )
        return false;
      afterSuccess?.();
      void refreshData(owner);
      return true;
    } catch (error) {
      if (sessionRef.current !== owner || controller.signal.aborted)
        return false;
      if (isAccessError(error)) {
        invalidateSession(owner, error.status as 401 | 403);
        return false;
      }
      update(owner, (current) => ({
        ...current,
        error:
          error instanceof Error ? error.message : "Thao tác không thành công.",
      }));
      return false;
    } finally {
      controllers.current.delete(controller);
      update(owner, (current) => ({ ...current, busy: false }));
    }
  };

  const state = stored.session === session ? stored : emptyState(session);
  const changeCreateField = <K extends HubCreateField>(
    field: K,
    value: HubCreateForm[K],
  ) => {
    if (!session || !enabledRef.current) return;
    update(session, (current) => ({
      ...current,
      createForm: { ...current.createForm, [field]: value },
    }));
  };
  const changeHubField = <K extends HubEditField>(
    hubId: string,
    field: K,
    value: HubEditForm[K],
  ) => {
    if (!session || !enabledRef.current) return;
    update(session, (current) => ({
      ...current,
      editForms: {
        ...current.editForms,
        [hubId]: { ...current.editForms[hubId], [field]: value },
      },
    }));
  };

  const markSaved = (
    owner: User,
    hubId: string,
    values: Partial<EditableHubValues>,
  ) =>
    update(owner, (current) => {
      const baseline = current.baselineForms[hubId];
      if (!baseline) return current;
      return {
        ...current,
        baselineForms: {
          ...current.baselineForms,
          [hubId]: { ...baseline, ...values },
        },
      };
    });

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    const submitted = { ...state.createForm };
    await mutate(
      session,
      () => api.createHub(submitted),
      () =>
        update(session, (current) =>
          Object.keys(submitted).every(
            (key) =>
              current.createForm[key as keyof HubCreateForm] ===
              submitted[key as keyof HubCreateForm],
          )
            ? { ...current, createForm: emptyCreateForm }
            : current,
        ),
    );
  };

  const submitUpdate = async (
    hubId: string,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!session) return;
    const form = state.editForms[hubId];
    const baseline = state.baselineForms[hubId];
    if (!form || !baseline) return;
    const changes: UpdateHubRequest = {};
    if (form.name !== baseline.name) changes.name = form.name;
    if (form.location !== baseline.location) changes.location = form.location;
    if (form.status !== baseline.status) changes.status = form.status;
    if (!Object.keys(changes).length) return;
    await mutate(
      session,
      () => api.updateHub(hubId, changes),
      () => markSaved(session, hubId, changes),
    );
  };

  const submitCapacity = async (
    hubId: string,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!session) return;
    const form = state.editForms[hubId];
    const baseline = state.baselineForms[hubId];
    if (!form || !baseline) return;
    const capacity = Number(form.capacity);
    if (!Number.isInteger(capacity) || capacity < 0) {
      update(session, (current) => ({
        ...current,
        error: "Sức chứa phải là số nguyên không âm.",
      }));
      return;
    }
    if (form.capacity === baseline.capacity) return;
    await mutate(
      session,
      () => api.setParkingCapacity(hubId, capacity),
      () => markSaved(session, hubId, { capacity: String(capacity) }),
    );
  };

  const submitChargingPoint = async (
    hubId: string,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!session) return;
    const code = state.editForms[hubId]?.chargingPointCode ?? "";
    await mutate(
      session,
      () => api.addChargingPoint(hubId, code),
      () => {
        update(session, (current) => {
          const form = current.editForms[hubId];
          if (!form || form.chargingPointCode !== code) return current;
          return {
            ...current,
            editForms: {
              ...current.editForms,
              [hubId]: { ...form, chargingPointCode: "" },
            },
          };
        });
      },
    );
  };

  const removeHub = (hubId: string) => {
    const hub = state.hubs.find((item) => item.id === hubId);
    if (
      session &&
      hub &&
      window.confirm(
        `Xóa Hub ${hub.name}? Chỉ xóa được Hub chưa có dữ liệu liên quan.`,
      )
    )
      void mutate(session, () => api.deleteHub(hubId));
  };

  const removeChargingPoint = (hubId: string, pointId: string) => {
    if (session)
      void mutate(session, () => api.removeChargingPoint(hubId, pointId));
  };

  return {
    hubs: state.hubs,
    error: state.error,
    busy: state.busy,
    createForm: state.createForm,
    editForms: state.editForms,
    refresh: () => (session ? refreshData(session) : Promise.resolve(false)),
    changeCreateField,
    changeHubField,
    submitCreate,
    submitUpdate,
    submitCapacity,
    submitChargingPoint,
    removeHub,
    removeChargingPoint,
  };
}
