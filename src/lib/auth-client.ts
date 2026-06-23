export type LoginActionResult =
  | { ok: true }
  | { ok: false; message: string };

async function readAuthResult(response: Response): Promise<LoginActionResult> {
  const result = (await response.json().catch(() => null)) as LoginActionResult | null;
  if (result && typeof result === "object" && "ok" in result) {
    return result;
  }

  throw new Error(response.ok ? "Unexpected auth response" : "Authentication request failed");
}

export async function register(name: string, email: string, password: string): Promise<LoginActionResult> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, email, password }),
  });

  return readAuthResult(response);
}

export async function login(email: string, password: string): Promise<LoginActionResult> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  return readAuthResult(response);
}

export async function logout() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Logout failed");
  }
}
