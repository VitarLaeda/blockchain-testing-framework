import { step as allureStep } from "allure-js-commons";
import type { StepContext } from "allure-js-commons";

export type StepParams = Record<string, unknown>;

export type StepBody<T> = (context: StepContext) => T | PromiseLike<T>;

function formatValue(value: unknown): string {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatParams(params: StepParams): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(", ");
}

/**
 * Wraps `allure-js-commons` `step` so that every step:
 *  - records its input parameters in the Allure report (visible per step),
 *  - prints a readable line to the terminal alongside the `spec` reporter,
 *  - exposes the {@link StepContext} so the body can attach result parameters.
 */
export function step<T>(name: string, body: StepBody<T>): Promise<T>;
export function step<T>(
  name: string,
  params: StepParams,
  body: StepBody<T>,
): Promise<T>;
export function step<T>(
  name: string,
  paramsOrBody: StepParams | StepBody<T>,
  maybeBody?: StepBody<T>,
): Promise<T> {
  const hasParams = typeof paramsOrBody !== "function";
  const params: StepParams = hasParams ? (paramsOrBody as StepParams) : {};
  const body = (hasParams ? maybeBody : paramsOrBody) as StepBody<T>;

  return Promise.resolve(
    allureStep(name, async (context: StepContext) => {
      for (const [key, value] of Object.entries(params)) {
        await context.parameter(key, formatValue(value));
      }

      const paramText = formatParams(params);
      console.log(
        paramText
          ? `      \u21b3 ${name} \u2014 ${paramText}`
          : `      \u21b3 ${name}`,
      );

      return body(context);
    }),
  );
}
