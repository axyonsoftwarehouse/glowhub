import { Platform } from "react-native";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "check_in"
  | "checkout"
  | "completed"
  | "cancelled"
  | "no_show";

export type MeResponse = {
  user: { id: string; name: string; email: string };
  tenant: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    isReadOnly: boolean;
    isSolo: boolean;
  };
  role: string;
  professional: { id: string; name: string } | null;
  tenants: {
    id: string;
    name: string;
    slug: string;
    isSolo: boolean;
    role: string;
  }[];
};

export type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  priceCents: number;
  notes: string | null;
  branch: { id: string; name: string };
  professional: { id: string; name: string };
  service: { id: string; name: string };
  client: { id: string; name: string; phone: string | null };
};

export type AppointmentsResponse = {
  from: string;
  to: string;
  appointments: Appointment[];
};

export class ApiClientError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function apiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return Platform.OS === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000";
}

async function request<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    token?: string | null;
    body?: unknown;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.token
          ? { authorization: `Bearer ${options.token}` }
          : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok) {
      const error = (data as { error?: { code?: string; message?: string } })
        ?.error;
      throw new ApiClientError(
        response.status,
        error?.code ?? "HTTP_ERROR",
        error?.message ?? `A API respondeu ${response.status}.`,
      );
    }

    return data as T;
  } catch (cause) {
    if (cause instanceof ApiClientError) throw cause;
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new ApiClientError(0, "TIMEOUT", "A API demorou para responder.");
    }
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      "Não foi possível falar com a API. Confira a URL e a rede.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function login(email: string, password: string) {
  return request<{
    token: string;
    user: { id: string; name: string; email: string };
  }>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function logout(token: string) {
  return request<{ ok: boolean }>("/api/v1/auth/logout", {
    method: "POST",
    token,
  });
}

export async function me(token: string) {
  return request<MeResponse>("/api/v1/me", { token });
}

export async function appointments(
  token: string,
  params: { from: string; to: string; mine?: boolean },
) {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    limit: "200",
  });
  if (params.mine) query.set("mine", "1");
  return request<AppointmentsResponse>(
    `/api/v1/appointments?${query.toString()}`,
    { token },
  );
}

export async function updateAppointmentStatus(
  token: string,
  appointmentId: string,
  status: AppointmentStatus,
) {
  return request<{ ok: true; status: AppointmentStatus }>(
    `/api/v1/appointments/${appointmentId}/status`,
    {
      method: "PATCH",
      token,
      body: { status },
    },
  );
}

export { apiBaseUrl };
