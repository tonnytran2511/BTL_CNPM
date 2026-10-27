import type {
  ScenarioLimits,
  ScenarioRun,
  ScenarioSimulationRequest,
  ScenarioSimulationResult,
  ScenarioSnapshot,
  SimulationRecommendation,
} from "@emobility/contracts";
import { simulateDemand, validateDemandParameters } from "./simulation.engine";

export function validateScenarioParameters(
  p: ScenarioSimulationRequest,
  limits: ScenarioLimits,
) {
  validateDemandParameters(p, limits);
  if (p.horizonMinutes > limits.maximumHorizonMinutes)
    throw new Error(`Thời lượng tối đa ${limits.maximumHorizonMinutes} phút.`);
  if (!["demand_surge", "parking_full", "charging_failure"].includes(p.kind))
    throw new Error("Kịch bản không hợp lệ.");
  if (
    !Number.isSafeInteger(p.additionalOccupiedSpaces) ||
    p.additionalOccupiedSpaces < 0
  )
    throw new Error("Số chỗ chiếm thêm phải là số nguyên không âm.");
  if (
    !Array.isArray(p.failedChargingPointIds) ||
    new Set(p.failedChargingPointIds).size !== p.failedChargingPointIds.length
  )
    throw new Error("Danh sách cổng hỏng không được trùng.");
  if (
    !Number.isSafeInteger(p.chargingServiceMinutes) ||
    p.chargingServiceMinutes <= 0 ||
    p.chargingServiceMinutes % p.stepMinutes !== 0 ||
    p.chargingServiceMinutes > p.horizonMinutes
  )
    throw new Error(
      "Thời gian phục vụ sạc phải chia hết cho bước và không vượt thời lượng.",
    );
  if (
    p.kind !== "demand_surge" &&
    p.baselineArrivalsPerStep !== p.scenarioArrivalsPerStep
  )
    throw new Error(
      "Kịch bản chỗ đỗ/cổng hỏng dùng cùng nhu cầu cho hai nhánh.",
    );
  if (p.kind !== "parking_full" && p.additionalOccupiedSpaces !== 0)
    throw new Error("Chỉ kịch bản chỗ đỗ được chiếm thêm chỗ.");
  if (p.kind !== "charging_failure" && p.failedChargingPointIds.length)
    throw new Error("Chỉ kịch bản cổng hỏng được chọn cổng.");
  if (p.kind === "parking_full" && p.additionalOccupiedSpaces === 0)
    throw new Error("Chọn ít nhất một chỗ chiếm thêm.");
  if (p.kind === "charging_failure" && p.failedChargingPointIds.length === 0)
    throw new Error("Chọn ít nhất một cổng đang hoạt động để giả lập hỏng.");
  const maximumDemand =
    (Math.ceil(
      2 * Math.max(p.baselineArrivalsPerStep, p.scenarioArrivalsPerStep),
    ) *
      p.horizonMinutes) /
    p.stepMinutes;
  if (
    !Number.isFinite(maximumDemand) ||
    maximumDemand > limits.maximumGeneratedRequests
  )
    throw new Error(
      `Giảm nhu cầu hoặc số bước; giới hạn tải mô hình ${limits.maximumGeneratedRequests} yêu cầu.`,
    );
}

const emptyRun = (resources: number): ScenarioRun => ({
  demand: 0,
  served: 0,
  unserved: 0,
  queued: 0,
  completed: 0,
  initialResources: resources,
  remainingResources: resources,
  peakParking: null,
  chargingUtilizationPercent: null,
  meanWaitMinutes: null,
  waitingAtEndMinutes: null,
  timeline: [],
});
function arrivals(seed: number, rate: number, steps: number) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: steps }, () => {
    const expected = 2 * rate * random();
    const rounding = random();
    return Math.floor(expected) + (rounding < expected % 1 ? 1 : 0);
  });
}

/** Independent what-if workflows. No operational mutations, clock, or global randomness. */
export function simulateScenario(
  snapshot: ScenarioSnapshot,
  p: ScenarioSimulationRequest,
  limits: ScenarioLimits,
): ScenarioSimulationResult {
  validateScenarioParameters(p, limits);
  const hub = snapshot.hubs.find(
    (h) => h.id === p.hubId && h.status === "active",
  );
  const resource = snapshot.resources.find((r) => r.hubId === p.hubId);
  if (!hub || !resource) throw new Error("Chọn Hub hoạt động trong snapshot.");
  const steps = p.horizonMinutes / p.stepMinutes;
  let baseline: ScenarioRun, scenario: ScenarioRun;
  if (p.kind === "demand_surge") {
    const legacy = simulateDemand(
      {
        ...snapshot,
        hubs: snapshot.hubs.map((h) =>
          h.id === hub.id
            ? {
                ...h,
                vehicleList: h.vehicleList.filter((vehicle) =>
                  resource.eligibleVehicleIds.includes(vehicle.id),
                ),
              }
            : h,
        ),
      },
      p,
      limits,
    );
    const convert = (run: typeof legacy.baseline): ScenarioRun => ({
      ...emptyRun(legacy.initialEligibleVehicles),
      demand: run.demand,
      served: run.served,
      unserved: run.unserved,
      remainingResources: run.remainingVehicles,
      timeline: run.timeline.map((s) => ({
        elapsedMinutes: s.elapsedMinutes,
        demand: s.demand,
        served: s.served,
        unserved: s.unserved,
        queued: 0,
        completed: 0,
        availableResources: s.availableVehicles,
        occupiedParking: hub.parking.occupied + hub.parking.held,
        busyChargingPoints: 0,
      })),
    });
    baseline = convert(legacy.baseline);
    scenario = convert(legacy.scenario);
  } else if (p.kind === "parking_full") {
    const free = resource.parkingSpaceIds.length;
    if (p.additionalOccupiedSpaces > free)
      throw new Error(
        "Chỗ chiếm thêm vượt số chỗ có thể cấp trong toàn thời lượng.",
      );
    const run = (additional: number) => {
      const result = emptyRun(free - additional);
      let occupied = hub.parking.occupied + hub.parking.held + additional;
      result.peakParking = occupied;
      const demands = arrivals(p.seed, p.baselineArrivalsPerStep, steps);
      demands.forEach((demand, i) => {
        const served = Math.min(demand, result.remainingResources);
        result.demand += demand;
        result.served += served;
        result.unserved += demand - served;
        result.remainingResources -= served;
        occupied += served;
        result.peakParking = Math.max(result.peakParking!, occupied);
        result.timeline.push({
          elapsedMinutes: (i + 1) * p.stepMinutes,
          demand,
          served,
          unserved: demand - served,
          queued: 0,
          completed: 0,
          availableResources: result.remainingResources,
          occupiedParking: occupied,
          busyChargingPoints: 0,
        });
      });
      return result;
    };
    baseline = run(0);
    scenario = run(p.additionalOccupiedSpaces);
  } else {
    const failed = new Set(p.failedChargingPointIds);
    if (
      p.failedChargingPointIds.some(
        (id) =>
          !resource.chargingPoints.some(
            (point) => point.id === id && point.status !== "failed",
          ),
      )
    )
      throw new Error(
        "Cổng giả lập hỏng phải thuộc Hub và chưa hỏng trong snapshot.",
      );
    const run = (failures: Set<string>) => {
      const points = resource.chargingPoints;
      const usable = points.filter(
        (point) => point.status !== "failed" && !failures.has(point.id),
      );
      const result = emptyRun(
        usable.filter(
          (point) => point.status === "available" && !point.activeSession,
        ).length,
      );
      // Existing active sessions have an assumed full service duration remaining.
      const busy = new Map<string, { ends: number; modeled: boolean }>();
      const queue: { count: number; arrived: number }[] =
        resource.chargingQueueWaitMinutes.map((wait) => ({
          count: 1,
          arrived: -wait,
        }));
      for (const point of points) {
        if (point.activeSession) {
          result.demand++;
          if (point.status === "failed" || failures.has(point.id))
            queue.push({ count: 1, arrived: 0 });
          else {
            busy.set(point.id, {
              ends: p.chargingServiceMinutes,
              modeled: true,
            });
            result.served++;
          }
        } else if (point.status === "occupied" && !failures.has(point.id))
          busy.set(point.id, { ends: Infinity, modeled: false });
      }
      result.demand += resource.chargingQueueWaitMinutes.length;
      if (result.demand > limits.maximumGeneratedRequests)
        throw new Error("Hàng chờ snapshot vượt giới hạn tải mô hình.");
      let head = 0,
        waitSum = 0,
        started = 0,
        busyMinutes = 0;
      const demands = arrivals(p.seed, p.baselineArrivalsPerStep, steps);
      const release = (at: number) => {
        let completed = 0;
        for (const [id, task] of busy)
          if (task.ends <= at) {
            if (task.modeled) completed++;
            busy.delete(id);
          }
        result.completed += completed;
        return completed;
      };
      demands.forEach((demand, i) => {
        const at = i * p.stepMinutes;
        release(at);
        result.demand += demand;
        if (result.demand > limits.maximumGeneratedRequests)
          throw new Error("Tổng yêu cầu vượt giới hạn tải mô hình.");
        if (demand) queue.push({ count: demand, arrived: at });
        let served = 0;
        for (const point of usable) {
          if (busy.has(point.id)) continue;
          while (head < queue.length && queue[head].count === 0) head++;
          if (head === queue.length) break;
          queue[head].count--;
          waitSum += at - queue[head].arrived;
          started++;
          served++;
          busy.set(point.id, {
            ends: at + p.chargingServiceMinutes,
            modeled: true,
          });
        }
        result.served += served;
        const busyCount = busy.size;
        busyMinutes += busyCount * p.stepMinutes;
        const completed = release(at + p.stepMinutes);
        result.queued = result.demand - result.served;
        result.remainingResources = usable.filter(
          (point) => !busy.has(point.id),
        ).length;
        result.timeline.push({
          elapsedMinutes: at + p.stepMinutes,
          demand,
          served,
          unserved: 0,
          queued: result.queued,
          completed,
          availableResources: result.remainingResources,
          occupiedParking: hub.parking.occupied + hub.parking.held,
          busyChargingPoints: busyCount,
        });
      });
      result.meanWaitMinutes = started ? waitSum / started : null;
      const waitingSum = queue
        .slice(head)
        .reduce(
          (sum, item) => sum + item.count * (p.horizonMinutes - item.arrived),
          0,
        );
      result.waitingAtEndMinutes = result.queued
        ? waitingSum / result.queued
        : null;
      result.chargingUtilizationPercent = points.length
        ? (100 * busyMinutes) / (points.length * p.horizonMinutes)
        : 0;
      return result;
    };
    baseline = run(new Set());
    scenario = run(failed);
  }
  const recommendations: SimulationRecommendation[] = [];
  const deficit = scenario.unserved + scenario.queued;
  if (deficit > 0) {
    const alternatives = snapshot.hubs
      .filter((h) => h.id !== hub.id && h.status === "active")
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const other of alternatives) {
      const otherResources = snapshot.resources.find(
        (r) => r.hubId === other.id,
      );
      if (!otherResources) continue;
      const quantity = Math.min(
        deficit,
        p.kind === "demand_surge"
          ? Math.min(
              otherResources.eligibleVehicleIds.length,
              resource.parkingSpaceIds.length,
            )
          : p.kind === "parking_full"
            ? otherResources.parkingSpaceIds.length
            : otherResources.chargingPoints.filter(
                (point) => point.status === "available" && !point.activeSession,
              ).length,
      );
      if (!quantity) continue;
      recommendations.push({
        kind:
          p.kind === "demand_surge"
            ? "review_redistribution"
            : p.kind === "parking_full"
              ? "redirect_parking"
              : "redirect_charging",
        sourceHubId: p.kind === "demand_surge" ? other.id : hub.id,
        targetHubId: p.kind === "demand_surge" ? hub.id : other.id,
        quantity,
        resource:
          p.kind === "demand_surge"
            ? "vehicle"
            : p.kind === "parking_full"
              ? "parking_space"
              : "charging_point",
        snapshotCapturedAt: snapshot.capturedAt,
        reason: `Kịch bản còn ${deficit} yêu cầu chưa được phục vụ. Snapshot ghi nhận tối đa ${quantity} tài nguyên có thể xem xét với Hub ${other.name}; chưa tính thời gian di chuyển hoặc giữ tài nguyên.`,
        requiresRevalidation: true,
      });
      break; // A single bounded suggestion; never promise the same resource twice.
    }
    if (!recommendations.length)
      recommendations.push({
        kind: "review_capacity",
        sourceHubId: hub.id,
        targetHubId: null,
        quantity: deficit,
        resource:
          p.kind === "demand_surge"
            ? "vehicle"
            : p.kind === "parking_full"
              ? "parking_space"
              : "charging_point",
        snapshotCapturedAt: snapshot.capturedAt,
        reason: `Còn ${deficit} yêu cầu chưa phục vụ; snapshot chưa có Hub khác đủ điều kiện để đề xuất chuyển hướng. Cần xem xét năng lực và nhu cầu.`,
        requiresRevalidation: true,
      });
  }
  return {
    modelVersion: "resource-flow-v1",
    snapshotCapturedAt: snapshot.capturedAt,
    hub: { id: hub.id, name: hub.name },
    parameters: structuredClone(p),
    limits: { ...limits },
    baseline,
    scenario,
    impact: {
      served: scenario.served - baseline.served,
      unserved: scenario.unserved - baseline.unserved,
      queued: scenario.queued - baseline.queued,
      meanWaitMinutes:
        baseline.meanWaitMinutes === null || scenario.meanWaitMinutes === null
          ? null
          : scenario.meanWaitMinutes - baseline.meanWaitMinutes,
    },
    recommendations,
  };
}
