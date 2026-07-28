/**
 * Single layer that talks to the Unomi REST API (/cxs, proxied in dev).
 * Holds Basic Auth in memory for the session — no localStorage.
 * ponytail: functions + module-level state, not a class. Add a class if we ever
 * need more than one concurrent Unomi connection (we won't).
 */

let base = "/cxs";
let authHeader = "";

/** Override the API base (from Settings). Empty falls back to the dev proxy path. */
export function setBaseUrl(url: string): void {
	base = url || "/cxs";
}

export interface PartialList<T> {
	list: T[];
	totalSize: number;
	offset: number;
	pageSize: number;
}

export function setCredentials(user: string, pass: string): void {
	authHeader = "Basic " + btoa(`${user}:${pass}`);
}

export function clearCredentials(): void {
	authHeader = "";
}

export function isAuthenticated(): boolean {
	return authHeader !== "";
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	if (authHeader) {
		headers.set("Authorization", authHeader);
	}
	if (init.body) {
		headers.set("Content-Type", "application/json");
	}
	const res = await fetch(base + path, { ...init, headers });
	if (!res.ok) {
		throw new Error(`${res.status} ${res.statusText}`);
	}
	return res;
}

/** Health check — GET /cxs/test/ping. Used to verify connectivity + credentials. */
export async function ping(): Promise<string> {
	const res = await request("/test/ping");
	return res.text();
}

/** Generic GET returning JSON. */
export async function getJson<T>(path: string): Promise<T> {
	const res = await request(path);
	return (await res.json()) as T;
}

/** POST a Query/Condition body to a search|query endpoint → PartialList envelope. */
export async function queryList<T>(path: string, query: object): Promise<PartialList<T>> {
	const res = await request(path, { method: "POST", body: JSON.stringify(query) });
	return (await res.json()) as PartialList<T>;
}

/** POST a full object to save/create a resource. Unomi returns 204; body ignored. */
export async function postJson(path: string, body: object): Promise<void> {
	await request(path, { method: "POST", body: JSON.stringify(body) });
}

/** DELETE a resource. Response body (if any) is ignored. */
export async function del(path: string): Promise<void> {
	await request(path, { method: "DELETE" });
}
