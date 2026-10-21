import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { HubDetail } from "@emobility/contracts";
import { api } from "../api/client";
import type {
  HubCreateField,
  HubCreateForm,
  HubEditField,
  HubEditForm,
  HubManagementModel,
} from "../models/hubManagement";

const emptyCreateForm: HubCreateForm = { code: "", name: "", location: "" };

function editFormFromHub(hub: HubDetail): HubEditForm {
  return {
    name: hub.name,
    location: hub.location,
    status: hub.status,
    capacity: String(hub.parking.capacity),
    chargingPointCode: "",
  };
}

export function useHubManagement(enabled: boolean): HubManagementModel {
  const [hubs, setHubs] = useState<HubDetail[]>([]);
  const [editForms, setEditForms] = useState<Record<string, HubEditForm>>({});
  const [createForm, setCreateForm] = useState<HubCreateForm>(emptyCreateForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try {
      const summaries = await api.hubs(signal);
      const details = await Promise.all(
        summaries.map((hub) => api.detail(hub.id, signal)),
      );
      if (!signal?.aborted) {
        setHubs(details);
        setEditForms((current) => {
          const next: Record<string, HubEditForm> = {};
          for (const hub of details)
            next[hub.id] = current[hub.id] ?? editFormFromHub(hub);
          return next;
        });
      }
    } catch (e) {
      if (!signal?.aborted)
        setError(
          e instanceof Error ? e.message : "Không thể tải danh sách Hub.",
        );
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [enabled, refresh]);

  const mutate = async (work: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác không thành công.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeCreateField = <K extends HubCreateField>(
    field: K,
    value: HubCreateForm[K],
  ) => setCreateForm((form) => ({ ...form, [field]: value }));
  const changeHubField = <K extends HubEditField>(
    hubId: string,
    field: K,
    value: HubEditForm[K],
  ) =>
    setEditForms((forms) => ({
      ...forms,
      [hubId]: { ...forms[hubId], [field]: value },
    }));

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      await mutate(() =>
        api.createHub({
          code: createForm.code,
          name: createForm.name,
          location: createForm.location,
        }),
      )
    )
      setCreateForm(emptyCreateForm);
  };

  const submitUpdate = async (
    hubId: string,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const form = editForms[hubId];
    if (!form) return;
    await mutate(() =>
      api.updateHub(hubId, {
        name: form.name,
        location: form.location,
        status: form.status,
      }),
    );
  };

  const submitCapacity = async (
    hubId: string,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const capacity = Number(editForms[hubId]?.capacity);
    if (!Number.isInteger(capacity) || capacity < 0) {
      setError("Sức chứa phải là số nguyên không âm.");
      return;
    }
    await mutate(() => api.setParkingCapacity(hubId, capacity));
  };

  const submitChargingPoint = async (
    hubId: string,
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const code = editForms[hubId]?.chargingPointCode ?? "";
    if (await mutate(() => api.addChargingPoint(hubId, code)))
      changeHubField(hubId, "chargingPointCode", "");
  };

  const removeHub = (hubId: string) => {
    const hub = hubs.find((item) => item.id === hubId);
    if (
      hub &&
      window.confirm(
        `Xóa Hub ${hub.name}? Chỉ xóa được Hub chưa có dữ liệu liên quan.`,
      )
    )
      void mutate(() => api.deleteHub(hubId));
  };

  const removeChargingPoint = (hubId: string, pointId: string) =>
    void mutate(() => api.removeChargingPoint(hubId, pointId));

  return {
    hubs,
    error,
    busy,
    createForm,
    editForms,
    refresh: () => void refresh(),
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
