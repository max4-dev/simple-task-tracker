import { authenticatedApiClient } from "@/shared/api";
import { API_ROUTES } from "@/shared/config";
import type { LoginValues } from "../model/login.schema";

export async function login(values: LoginValues) {
  await authenticatedApiClient.post(API_ROUTES.AUTH.LOGIN, { json: values });
}
