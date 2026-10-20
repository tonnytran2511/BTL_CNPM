import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { ErrorFilter } from "../apps/api/dist/common/error.filter.js";

const require = createRequire(import.meta.url);
const { HttpException, BadRequestException } = require("@nestjs/common");

function responseFor(error) {
  const filter = new ErrorFilter();
  const logs = [];
  filter.logger = { error: (message) => logs.push(message) };
  const response = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  filter.catch(error, {
    switchToHttp: () => ({ getResponse: () => response }),
  });
  return { ...response, logs };
}

test("T15 all server failures redact internal messages in responses and logs", () => {
  const secret = "postgresql://private:password@database/internal_table";
  for (const error of [
    new Error(secret),
    new HttpException(secret, 500),
    new HttpException({ message: [secret], query: secret }, 503),
  ]) {
    const response = responseFor(error);
    assert.ok(response.statusCode >= 500);
    assert.equal(response.body.statusCode, response.statusCode);
    assert.equal(response.body.code, `HTTP_${response.statusCode}`);
    assert.equal(
      response.body.message,
      "Không thể xử lý yêu cầu. Vui lòng thử lại.",
    );
    assert.equal(JSON.stringify(response).includes(secret), false);
    assert.equal(response.logs.length, 1);
  }
});

test("T15 validation messages remain actionable and client errors keep their status", () => {
  const invalid = responseFor(
    new BadRequestException([
      "hubId must be a UUID",
      "seed must be an integer",
    ]),
  );
  assert.deepEqual(invalid.body, {
    statusCode: 400,
    code: "HTTP_400",
    message: "hubId must be a UUID; seed must be an integer",
  });
  for (const status of [401, 403, 404, 409, 429]) {
    assert.deepEqual(
      responseFor(new HttpException("Action denied", status)).body,
      {
        statusCode: status,
        code: `HTTP_${status}`,
        message: "Action denied",
      },
    );
  }
});
