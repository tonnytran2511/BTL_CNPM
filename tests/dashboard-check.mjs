import assert from "node:assert/strict";

function assertError(response, status) {
  assert.equal(response.status, status);
  assert.deepEqual(Object.keys(response.body).sort(), [
    "code",
    "message",
    "statusCode",
  ]);
  assert.equal(response.body.statusCode, status);
  assert.equal(response.body.code, `HTTP_${status}`);
  assert.equal(typeof response.body.message, "string");
  assert.ok(response.body.message.length > 0);
}

export async function checkDashboard({ t, request, operator, student }) {
  await t.test(
    "T15 integrated routes enforce authentication and operator permissions with consistent errors",
    async () => {
      const protectedReads = [
        "/auth/me",
        "/hubs",
        "/network/overview",
        "/simulation/snapshot",
        "/simulations/config",
        "/vehicles",
        "/vehicle-reservations",
        "/mobility/private-vehicles",
        "/mobility/parking/bookings",
        "/mobility/charging/requests",
      ];
      for (const path of protectedReads) assertError(await request(path), 401);
      const operatorRoutes = [
        ["/network/overview", "GET"],
        ["/simulation/snapshot", "GET"],
        ["/simulations/config", "GET"],
        ["/simulations/demand-surge", "POST"],
        ["/incidents", "POST"],
        ["/redistributions", "POST"],
      ];
      for (const [path, method] of operatorRoutes) {
        assertError(
          await request(path, {
            method,
            body: method === "POST" ? {} : undefined,
          }),
          401,
        );
        assertError(
          await request(path, {
            cookie: student.cookie,
            method,
            body: method === "POST" ? {} : undefined,
          }),
          403,
        );
      }
      assertError(
        await request("/hubs/invalid-id", { cookie: student.cookie }),
        400,
      );
      assertError(
        await request("/hubs/00000000-0000-4000-8000-000000000000", {
          cookie: student.cookie,
        }),
        404,
      );
      assertError(
        await request("/vehicle-reservations", {
          method: "POST",
          cookie: student.cookie,
          body: {},
        }),
        400,
      );
      assertError(
        await request("/vehicle-reservations", {
          method: "POST",
          cookie: student.cookie,
          origin: "https://other.example",
          body: {},
        }),
        403,
      );
    },
  );

  await t.test(
    "T15 rental mutations update overview, Hub detail and student Hub list through real APIs",
    async () => {
      const available = await request("/vehicles", { cookie: student.cookie });
      assert.equal(available.status, 200);
      const vehicle = available.body.vehicles[0];
      assert.ok(vehicle, "Seed must provide a rentable vehicle");
      const overview = () =>
        request("/network/overview", { cookie: operator.cookie });
      const before = await overview();
      const reserved = await request("/vehicle-reservations", {
        method: "POST",
        cookie: student.cookie,
        body: { vehicleId: vehicle.id },
      });
      assert.equal(reserved.status, 201, JSON.stringify(reserved.body));
      try {
        const after = await overview();
        assert.equal(after.status, 200);
        assert.equal(
          after.body.totals.availableVehicles,
          before.body.totals.availableVehicles - 1,
        );
        const hubBefore = before.body.hubs.find(
          (hub) => hub.id === vehicle.hubId,
        );
        assert.ok(hubBefore);
        const detail = await request(`/hubs/${vehicle.hubId}`, {
          cookie: operator.cookie,
        });
        assert.equal(
          detail.body.vehicles.available,
          hubBefore.vehicles.available - 1,
        );
        assert.equal(
          detail.body.vehicleList.find((item) => item.id === vehicle.id).status,
          "reserved",
        );
        const studentHubs = await request("/hubs", { cookie: student.cookie });
        assert.deepEqual(
          studentHubs.body.find((hub) => hub.id === vehicle.hubId),
          after.body.hubs.find((hub) => hub.id === vehicle.hubId),
        );
        // A reservation holds a vehicle, not a destination parking space.
        assert.deepEqual(detail.body.parking, hubBefore.parking);
        assertError(
          await request("/vehicle-reservations", {
            method: "POST",
            cookie: student.cookie,
            body: { vehicleId: vehicle.id },
          }),
          409,
        );
      } finally {
        const cancelled = await request(
          `/vehicle-reservations/${reserved.body.id}/cancel`,
          { method: "POST", cookie: student.cookie },
        );
        assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
      }
      const restored = await overview();
      assert.deepEqual(restored.body.totals, before.body.totals);
      assert.deepEqual(restored.body.hubs, before.body.hubs);
    },
  );
}
