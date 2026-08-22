/**
 * Single layer that talks to the Unomi REST API (/cxs, proxied in dev).
 * Holds Basic Auth in sessionStorage so it survives a page reload but dies with
 * the tab — never localStorage (that persists to disk across browser sessions).
 * ponytail: sessionStorage, not an httpOnly cookie. httpOnly needs a backend that
 * sets the cookie and injects the Basic header server-side (a BFF/reverse proxy);
 * this SPA talks Basic straight to Unomi, so it must read the secret itself.
 * ponytail: functions + module-level state, not a class. Add a class if we ever
 * need more than one concurrent Unomi connection (we won't).
 */

const AUTH_KEY = "unomi.auth";
let base = "/cxs";
let authHeader = sessionStorage.getItem(AUTH_KEY) ?? "";

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
	sessionStorage.setItem(AUTH_KEY, authHeader);
}

export function clearCredentials(): void {
	authHeader = "";
	sessionStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
	return authHeader !== "";
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	if (authHeader) {
		headers.set("Authorization", authHeader);
	}
	// Only JSON string bodies get a JSON content-type; FormData sets its own
	// multipart boundary, so leave it untouched.
	if (init.body && typeof init.body === "string") {
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
	// 204 No Content (e.g. rule statistics before the rule has ever fired) has no
	// body — calling res.json() on it throws "Unexpected end of JSON input".
	return (res.status === 204 ? null : await res.json()) as T;
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

/** POST a JSON body and parse the JSON response (count → number, aggregation → map).
 * Tolerates an empty body (Unomi returns 204/empty when a query matches nothing). */
export async function post<T>(path: string, body: object): Promise<T | null> {
	const res = await request(path, { method: "POST", body: JSON.stringify(body) });
	const text = await res.text();
	return text ? (JSON.parse(text) as T) : null;
}

/** DELETE a resource. Response body (if any) is ignored. */
export async function del(path: string): Promise<void> {
	await request(path, { method: "DELETE" });
}

/** POST a JSON body and get back the raw CSV text (e.g. /profiles/export). */
export async function postCsv(path: string, body: object): Promise<string> {
	const res = await request(path, { method: "POST", body: JSON.stringify(body) });
	return res.text();
}

/** POST multipart FormData (e.g. /importConfiguration/oneshot). Returns the response. */
export async function postForm(path: string, form: FormData): Promise<Response> {
	return request(path, { method: "POST", body: form });
}

/** Trigger a browser download of text content. No auth involved — data is already fetched. */
export function downloadText(text: string, filename: string, mime = "text/csv"): void {
	const url = URL.createObjectURL(new Blob([text], { type: mime }));
	const a = Object.assign(document.createElement("a"), { href: url, download: filename });
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
