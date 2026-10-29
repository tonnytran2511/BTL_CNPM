import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Own disposable runner and a new browser context; never use a personal profile.
const output = resolve(process.env.DEMO_OUTPUT_DIR ?? ".local/demo-recording");
const timingScale = Number(process.env.DEMO_TIMING_SCALE ?? "1");
assert.ok(Number.isFinite(timingScale) && timingScale > 0 && timingScale <= 1);
await mkdir(output, { recursive: true });
const runner = spawn(process.execPath, ["scripts/demo-t14.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
const evidence = {
  status: "running",
  recordedAt: new Date().toISOString(),
  timingScale,
  scenes: [],
};
await writeFile(
  resolve(output, "verification.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
const wait = (ms) => new Promise((done) => setTimeout(done, ms * timingScale));
try {
  const session = await new Promise((done, reject) => {
    let buffer = "";
    const timer = setTimeout(
      () => reject(new Error("Demo startup timeout")),
      60000,
    );
    runner.stdout.on("data", (chunk) => {
      buffer += chunk;
      const start = buffer.indexOf('{\n  "url"');
      const end = buffer.indexOf("\nDisposable demo only.", start);
      if (start >= 0 && end > start) {
        clearTimeout(timer);
        done(JSON.parse(buffer.slice(start, end)));
      }
    });
    runner.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Disposable environment exited before ready"));
    });
  });
  browser = await chromium.launch({ headless: true, slowMo: 180 });
  const states = {};
  for (const role of ["student", "operator"]) {
    const context = await browser.newContext();
    const login = await context.request.post(`${session.url}/api/auth/login`, {
      headers: { Origin: session.url },
      data: session.credentials[role],
    });
    assert.equal(login.status(), 201);
    states[role] = await context.storageState();
    await context.close();
  }
  async function scene(name, role, seconds, action) {
    const context = await browser.newContext({
      storageState: states[role],
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: output, size: { width: 1280, height: 720 } },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const started = Date.now();
    const api = async (path) => {
      const response = await context.request.get(`${session.url}/api${path}`);
      assert.equal(response.status(), 200, path);
      return response.json();
    };
    try {
      await page.goto(session.url);
      await page
        .getByRole("button", { name: "Đăng xuất", exact: true })
        .waitFor();
      await action(page, api);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: resolve(output, `${name}.png`) });
      await new Promise((done) =>
        setTimeout(
          done,
          Math.max(1000, seconds * 1000 * timingScale - (Date.now() - started)),
        ),
      );
    } catch (error) {
      await page.screenshot({
        path: resolve(output, `${name}-failure.png`),
        fullPage: true,
      });
      throw error;
    } finally {
      const video = page.video();
      await context.close();
      await video.saveAs(resolve(output, `${name}.webm`));
    }
    evidence.scenes.push({ name, targetSeconds: seconds, pageErrors: errors });
    console.log(`Verified and recorded ${name}`);
  }
  let vehicle, source, target, privateCode;
  await scene("01-rental", "student", 30, async (page, api) => {
    const hubs = await api("/hubs");
    const candidates = (await api("/vehicles")).vehicles;
    vehicle = candidates.find((v) => v.batteryPercent < 100);
    assert.ok(vehicle);
    source = hubs.find((h) => h.id === vehicle.hubId);
    target = hubs.find(
      (h) =>
        h.id !== source.id && h.status === "active" && h.parking.available > 0,
    );
    assert.ok(source && target);
    const search = page.getByRole("region", { name: "Tìm xe", exact: true });
    await search.scrollIntoViewIfNeeded();
    await wait(2000);
    await search
      .locator("li")
      .filter({ hasText: vehicle.code })
      .getByRole("button", { name: "Đặt xe", exact: true })
      .click();
    await page.getByRole("button", { name: "Nhận xe", exact: true }).click();
    await page.getByLabel("Trả xe tại Hub").selectOption(target.id);
    await wait(3000);
    await page.getByRole("button", { name: "Trả xe", exact: true }).click();
    await page.getByText("Lịch sử chuyến", { exact: true }).waitFor();
    const trips = await api("/trips");
    assert.ok(
      trips.some(
        (t) =>
          t.vehicle.id === vehicle.id &&
          t.targetHub?.id === target.id &&
          t.status === "completed",
      ),
    );
    await page
      .getByRole("region", { name: "Chuyến thuê của tôi", exact: true })
      .scrollIntoViewIfNeeded();
    evidence.rental = {
      vehicleCode: vehicle.code,
      from: source.name,
      to: target.name,
      completed: true,
    };
  });
  await scene("02-private-parking", "student", 30, async (page, api) => {
    const region = page.getByRole("region", {
      name: "Đăng ký xe và chọn dịch vụ",
      exact: true,
    });
    await region.getByRole("button", { name: /Chưa đăng ký xe/ }).click();
    privateCode = `DEMO-${Date.now().toString(36).toUpperCase()}`;
    await region.getByLabel("Mã xe / biển số").fill(privateCode);
    await region.getByLabel("Pin hiện tại (%)", { exact: true }).fill("35");
    await region
      .getByRole("button", { name: "Đăng ký xe", exact: true })
      .click();
    await region.getByRole("button", { name: /Đặt chỗ đỗ/ }).click();
    const ownVehicle = region.locator('select[name="vehicle"]');
    const vehicleId = await ownVehicle
      .locator("option")
      .filter({ hasText: privateCode })
      .getAttribute("value");
    assert.ok(vehicleId);
    await ownVehicle.selectOption(vehicleId);
    const form = region.locator("form").filter({
      has: page.getByRole("heading", { name: "Thông tin đặt chỗ đỗ" }),
    });
    await form.locator('select[name="hub"]').selectOption(source.id);
    const local = (offset) => {
      const d = new Date(Date.now() + offset);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    };
    // Respect the real booking clock: do not backdate or mutate DB/UI time.
    const startsAt = Math.ceil((Date.now() + 5000) / 60000) * 60000;
    await form
      .getByLabel("Bắt đầu", { exact: true })
      .fill(local(startsAt - Date.now()));
    await form.getByLabel("Kết thúc", { exact: true }).fill(local(3600000));
    await form.getByRole("button", { name: "Đặt chỗ", exact: true }).click();
    await page.getByRole("button", { name: "Check-in", exact: true }).waitFor();
    await new Promise((done) =>
      setTimeout(done, Math.max(0, startsAt - Date.now() + 250)),
    );
    await page.getByRole("button", { name: "Check-in", exact: true }).click();
    await page
      .getByRole("button", { name: "Check-out", exact: true })
      .waitFor();
    await wait(3000);
    await page.getByRole("button", { name: "Check-out", exact: true }).click();
    await page
      .getByRole("button", { name: "Check-out", exact: true })
      .waitFor({ state: "hidden" });
    const bookings = await api("/mobility/parking/bookings");
    assert.ok(
      bookings.some(
        (b) => b.vehicleCode === privateCode && b.status === "completed",
      ),
    );
    evidence.privateParking = {
      registered: true,
      checkInAndOut: true,
      waitedForRealBookingStart: true,
    };
  });
  await scene("03-charging", "operator", 40, async (page, api) => {
    const region = page.getByRole("region", {
      name: "Điều phối sạc",
      exact: true,
    });
    await region.locator('select[name="vehicle"]').selectOption(vehicle.id);
    await region.getByLabel("Pin mục tiêu (%)", { exact: true }).fill("100");
    await region
      .getByRole("button", { name: "Gửi yêu cầu sạc xe thuê", exact: true })
      .click();
    await region.locator('select[name="hub"]').selectOption(target.id);
    await region
      .getByRole("button", { name: "Phân bổ cổng theo ưu tiên", exact: true })
      .click();
    await region
      .getByRole("button", { name: "Bắt đầu sạc", exact: true })
      .click();
    const points = await api("/mobility/charging/points");
    const occupied = points.find(
      (p) => p.vehicleCode === vehicle.code && p.sessionStatus === "charging",
    );
    assert.ok(occupied);
    const failure = page.getByRole("region", {
      name: "Sự cố cổng sạc",
      exact: true,
    });
    await failure.locator("select").selectOption(occupied.id);
    await failure
      .getByLabel("Mô tả sự cố", { exact: true })
      .fill("Cổng ngừng cấp điện trong phiên demo trên DB tạm");
    await failure
      .locator('input[name="battery"]')
      .fill(String(vehicle.batteryPercent));
    await failure
      .getByRole("button", {
        name: "Báo hỏng cổng và xử lý phiên",
        exact: true,
      })
      .click();
    await failure
      .getByRole("button", { name: "Xác nhận đã sửa xong", exact: true })
      .click();
    await failure
      .getByRole("button", {
        name: "Báo hỏng cổng và xử lý phiên",
        exact: true,
      })
      .waitFor();
    await region
      .getByRole("button", { name: "Phân bổ cổng theo ưu tiên", exact: true })
      .click();
    await region
      .getByRole("button", { name: "Bắt đầu sạc", exact: true })
      .click();
    await region.getByLabel("Pin thực tế (%)", { exact: true }).fill("100");
    await wait(4000);
    await region
      .getByRole("button", { name: "Hoàn tất sạc", exact: true })
      .click();
    await region.getByText(/Hoàn tất.*Pin hiện tại/).waitFor();
    const found = (await api("/vehicles")).vehicles.find(
      (v) => v.id === vehicle.id,
    );
    assert.equal(found?.batteryPercent, 100);
    await region.locator(".mobility-list").scrollIntoViewIfNeeded();
    evidence.charging = {
      interruptedAndRequeued: true,
      repaired: true,
      completed: true,
      observedBatteryPercent: 100,
    };
  });
  await scene("04-redistribution", "operator", 30, async (page, api) => {
    await page.getByRole("link", { name: "Vận hành", exact: true }).click();
    await page
      .locator("label")
      .filter({ hasText: /^Hub nguồn/ })
      .locator("select")
      .selectOption(target.id);
    await page
      .locator("label")
      .filter({ hasText: /^Hub đích/ })
      .locator("select")
      .selectOption(source.id);
    await page
      .getByRole("checkbox", { name: new RegExp(vehicle.code) })
      .check();
    await page.getByRole("button", { name: "Tạo lệnh", exact: true }).click();
    await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
    await wait(3000);
    await page
      .getByRole("button", { name: "Hoàn tất điều chuyển", exact: true })
      .click();
    await page
      .getByText("Trạng thái:")
      .filter({ hasText: "Hoàn tất" })
      .waitFor();
    const orders = await api("/redistributions");
    assert.ok(
      orders.some(
        (o) => o.vehicleIds.includes(vehicle.id) && o.status === "completed",
      ),
    );
    await page
      .getByRole("heading", { name: "Lịch sử vận hành", exact: true })
      .scrollIntoViewIfNeeded();
    evidence.redistribution = {
      completed: true,
      audit: (await api("/operations/log")).length > 0,
    };
  });
  await scene("05-simulation", "operator", 50, async (page, api) => {
    await page.getByRole("link", { name: "Mô phỏng", exact: true }).click();
    const region = page.getByRole("region", {
      name: "So sánh ba kịch bản",
      exact: true,
    });
    const before = await api("/hubs");
    const kinds = ["demand_surge", "parking_full", "charging_failure"];
    evidence.simulations = [];
    for (const kind of kinds) {
      await region.locator("select").nth(0).selectOption(kind);
      await region.locator("select").nth(1).selectOption(source.id);
      if (kind === "charging_failure")
        await region.getByRole("checkbox").first().check();
      await region
        .getByRole("button", { name: "Chạy và lưu mô phỏng", exact: true })
        .click();
      const result = region.getByRole("region", {
        name: "So sánh chỉ số",
        exact: true,
      });
      await result.waitFor();
      await result.scrollIntoViewIfNeeded();
      await wait(3500);
      const downloading = page.waitForEvent("download");
      await region
        .getByRole("button", { name: "Tải báo cáo (.txt)", exact: true })
        .click();
      const download = await downloading;
      const file = resolve(output, `${kind}.txt`);
      await download.saveAs(file);
      const txt = await readFile(file, "utf8");
      assert.ok(txt.length > 500 && txt.includes("resource-flow-v1"));
      evidence.simulations.push({
        kind,
        downloaded: true,
        bytes: Buffer.byteLength(txt),
      });
    }
    await region
      .getByRole("button", { name: "Xem bản lưu", exact: true })
      .first()
      .click();
    await region
      .getByRole("region", { name: "So sánh chỉ số", exact: true })
      .scrollIntoViewIfNeeded();
    assert.deepEqual(await api("/hubs"), before);
    const history = await api("/simulations/runs");
    assert.equal(history.items.length, 3);
    evidence.historyReopened = true;
    evidence.hubsUnchangedAfterSimulation = true;
  });
  evidence.status = "passed";
  await writeFile(
    resolve(output, "verification.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
} finally {
  await browser?.close();
  if (runner.exitCode === null && runner.signalCode === null) {
    const exited = once(runner, "exit");
    runner.kill("SIGTERM");
    await exited;
  }
}
