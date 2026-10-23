import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@emobility/contracts";
import { api, RequestError } from "../api/client";
import type {
  IncidentForm,
  OperationsModel,
  RedistributionForm,
} from "../models/operations";

const emptyIncident: IncidentForm = {
  resourceType: "vehicle",
  resourceId: "",
  description: "",
};
const emptyRedistribution: RedistributionForm = {
  sourceHubId: "",
  targetHubId: "",
  vehicleIds: [],
};

export function useOperations(
  user: User | null,
  enabled: boolean,
  pollIntervalMs: number,
  onSessionExpired: () => void,
  onAccessRevoked: () => void,
): OperationsModel {
  const operator = user?.role === "operator" ? user : null;
  const ownerRef = useRef(operator);
  const enabledRef = useRef(enabled);
  const requestRef = useRef<AbortController | null>(null);
  const mutationCount = useRef(new Map<User, number>());
  const [hubs, setHubs] = useState<OperationsModel["hubs"]>([]);
  const [incidents, setIncidents] = useState<OperationsModel["incidents"]>([]);
  const [redistributions, setRedistributions] = useState<
    OperationsModel["redistributions"]
  >([]);
  const [log, setLog] = useState<OperationsModel["log"]>([]);
  const [incidentForm, setIncidentForm] = useState(emptyIncident);
  const [redistributionForm, setRedistributionForm] =
    useState(emptyRedistribution);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  ownerRef.current = operator;
  enabledRef.current = enabled;

  const clear = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    mutationCount.current.clear();
    setHubs([]);
    setIncidents([]);
    setRedistributions([]);
    setLog([]);
    setIncidentForm(emptyIncident);
    setRedistributionForm(emptyRedistribution);
    setError("");
    setLoading(false);
    setBusy(false);
  }, []);

  useEffect(() => {
    clear();
    return () => requestRef.current?.abort();
  }, [clear, operator]);

  const refresh = useCallback(async () => {
    if (!operator || !enabledRef.current) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const active = () =>
      ownerRef.current === operator &&
      enabledRef.current &&
      !controller.signal.aborted;
    setLoading(true);
    setError("");
    try {
      const current = await api.me(controller.signal);
      if (!active()) return;
      if (current.id !== operator.id || current.role !== "operator") {
        clear();
        onAccessRevoked();
        return;
      }
      const [summaries, nextIncidents, nextOrders, nextLog] = await Promise.all(
        [
          api.hubs(controller.signal),
          api.incidents(controller.signal),
          api.redistributions(controller.signal),
          api.operationLog(controller.signal),
        ],
      );
      const details = await Promise.all(
        summaries.map((hub) => api.detail(hub.id, controller.signal)),
      );
      if (!active()) return;
      setHubs(details);
      setIncidents(nextIncidents);
      setRedistributions(nextOrders);
      setLog(nextLog);
    } catch (cause) {
      if (!active()) return;
      if (cause instanceof RequestError && cause.status === 401) {
        clear();
        onSessionExpired();
      } else if (cause instanceof RequestError && cause.status === 403) {
        clear();
        onAccessRevoked();
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "Không thể tải dữ liệu vận hành.",
        );
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (ownerRef.current === operator) setLoading(false);
      }
    }
  }, [clear, onAccessRevoked, onSessionExpired, operator]);

  useEffect(() => {
    if (!enabled || !operator) return;
    void refresh();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval =
      pollIntervalMs > 0
        ? window.setInterval(refreshVisible, pollIntervalMs)
        : undefined;
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("online", refreshVisible);
    window.addEventListener("focus", refreshVisible);
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      window.removeEventListener("focus", refreshVisible);
      requestRef.current?.abort();
    };
  }, [enabled, operator, pollIntervalMs, refresh]);

  const mutate = useCallback(
    async (work: () => Promise<unknown>, onSuccess?: () => void) => {
      if (!operator || !enabledRef.current || ownerRef.current !== operator)
        return false;
      const owner = operator;
      mutationCount.current.set(
        owner,
        (mutationCount.current.get(owner) ?? 0) + 1,
      );
      setBusy(true);
      setError("");
      try {
        const current = await api.me();
        if (ownerRef.current !== owner || !enabledRef.current) return false;
        if (current.id !== operator.id || current.role !== "operator") {
          clear();
          onAccessRevoked();
          return false;
        }
        await work();
        if (ownerRef.current !== owner) return false;
        if (enabledRef.current) {
          onSuccess?.();
          void refresh();
        }
        return true;
      } catch (cause) {
        if (ownerRef.current !== owner) return false;
        if (cause instanceof RequestError && cause.status === 401) {
          clear();
          onSessionExpired();
        } else if (cause instanceof RequestError && cause.status === 403) {
          clear();
          onAccessRevoked();
        } else if (enabledRef.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Thao tác không thành công.",
          );
        }
        return false;
      } finally {
        const pending = mutationCount.current.get(owner) ?? 0;
        if (pending <= 1) mutationCount.current.delete(owner);
        else mutationCount.current.set(owner, pending - 1);
        if (ownerRef.current === owner && !mutationCount.current.has(owner))
          setBusy(false);
      }
    },
    [clear, onAccessRevoked, onSessionExpired, operator, refresh],
  );

  const changeIncident = <K extends keyof IncidentForm>(
    field: K,
    value: IncidentForm[K],
  ) =>
    setIncidentForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "resourceType" ? { resourceId: "" } : {}),
    }));
  const changeRedistribution = <K extends keyof RedistributionForm>(
    field: K,
    value: RedistributionForm[K],
  ) =>
    setRedistributionForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "sourceHubId"
        ? {
            vehicleIds: [],
            targetHubId:
              current.targetHubId === value ? "" : current.targetHubId,
          }
        : {}),
    }));
  const toggleVehicle = (id: string) =>
    setRedistributionForm((current) => ({
      ...current,
      vehicleIds: current.vehicleIds.includes(id)
        ? current.vehicleIds.filter((item) => item !== id)
        : [...current.vehicleIds, id],
    }));
  const createIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitted = { ...incidentForm };
    await mutate(
      () => api.createIncident(submitted),
      () => {
        setIncidentForm((current) =>
          current === incidentForm ? emptyIncident : current,
        );
      },
    );
  };
  const createRedistribution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitted = {
      ...redistributionForm,
      vehicleIds: [...redistributionForm.vehicleIds],
    };
    await mutate(
      () => api.createRedistribution(submitted),
      () => {
        setRedistributionForm((current) =>
          current === redistributionForm ? emptyRedistribution : current,
        );
      },
    );
  };
  const act = async (work: (id: string) => Promise<unknown>, id: string) => {
    await mutate(() => work(id));
  };
  const source = hubs.find((hub) => hub.id === redistributionForm.sourceHubId);
  const incidentResources =
    incidentForm.resourceType === "hub"
      ? hubs.map((hub) => ({
          id: hub.id,
          label: `${hub.name} · ${hub.location}`,
        }))
      : incidentForm.resourceType === "vehicle"
        ? hubs.flatMap((hub) =>
            hub.vehicleList.map((vehicle) => ({
              id: vehicle.id,
              label: `${vehicle.code} · ${hub.name}`,
            })),
          )
        : hubs.flatMap((hub) =>
            hub.chargingPoints.map((point) => ({
              id: point.id,
              label: `${point.code} · ${hub.name}`,
            })),
          );

  return {
    hubs,
    sourceHubs: hubs.filter((hub) => hub.status === "active"),
    incidentResources,
    availableVehicles:
      source?.vehicleList.filter((vehicle) => vehicle.status === "available") ??
      [],
    targetHubs: hubs.filter(
      (hub) =>
        hub.id !== redistributionForm.sourceHubId && hub.status === "active",
    ),
    hubNames: Object.fromEntries(hubs.map((hub) => [hub.id, hub.name])),
    actorNames: Object.fromEntries(
      log.map((entry) => [entry.actorId, entry.actorName]),
    ),
    incidents,
    redistributions,
    log,
    incidentForm,
    redistributionForm,
    error,
    loading,
    busy,
    refresh,
    changeIncident,
    changeRedistribution,
    toggleVehicle,
    createIncident,
    resolveIncident: (id) => act(api.resolveIncident, id),
    createRedistribution,
    startRedistribution: (id) => act(api.startRedistribution, id),
    cancelRedistribution: (id) => act(api.cancelRedistribution, id),
    completeRedistribution: (id) => act(api.completeRedistribution, id),
  };
}
