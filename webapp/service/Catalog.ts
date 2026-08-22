/**
 * Single cache for the "reference" catalogs the UI lets you pick from (scopes,
 * segments, goals, …). One request per key, memoized; failures are NOT cached so a
 * retry re-fetches. Consumers: the BRM condition editor, the metadata forms and the
 * technical action editor — everywhere an id of another Unomi object is chosen.
 *
 * ponytail: full-list load + client-side filter. These catalogs are dozens of rows;
 * the only large one (profiles) is paged server-side elsewhere and stays out of here.
 */

import * as UnomiClient from "unomi/ui/service/UnomiClient";

export interface Opt { id: string; name: string; }
export interface PropDef { id: string; name: string; valueTypeId: string | null; }
export type Props = { profile: PropDef[]; session: PropDef[]; event: PropDef[] };

// ponytail: no `tags` — Unomi 3.x exposes no tag catalog endpoint; tags stay free text.
export type CatalogKey = "segments" | "scorings" | "lists" | "goals" | "eventTypes" | "scopes" | "campaigns" | "valueTypes";

const flat = (a: { id: string; name?: string }[] | null | undefined): Opt[] =>
	(a || []).filter((x) => x && x.id).map((x) => ({ id: x.id, name: x.name || x.id }));

// One loader per catalog. Each normalizes its endpoint's shape to Opt[].
const LOADERS: Record<CatalogKey, () => Promise<Opt[]>> = {
	segments: async () => flat(await UnomiClient.getJson("/segments")),
	scorings: async () => flat(await UnomiClient.getJson("/scoring")),
	lists: async () => flat((await UnomiClient.getJson<{ list: { id: string; name?: string }[] }>("/lists")).list || []),
	goals: async () => flat(await UnomiClient.getJson("/goals")),
	campaigns: async () => flat(await UnomiClient.getJson("/campaigns")),
	// /scopes wraps each item as { metadata: {id,name} } (unlike segments/goals).
	scopes: async () => flat((await UnomiClient.getJson<{ metadata: { id: string; name?: string } }[]>("/scopes") || []).map((x) => x.metadata)),
	// /events/types is a plain string[]; use the value as both id and name.
	eventTypes: async () => ((await UnomiClient.getJson<string[]>("/events/types")) || []).map((e) => ({ id: e, name: e })),
	// ValueType = { id, nameKey, ... }; nameKey is an i18n key but the best label we have.
	valueTypes: async () => (await UnomiClient.getJson<{ id: string; nameKey?: string }[]>("/definitions/values") || []).filter((x) => x && x.id).map((x) => ({ id: x.id, name: x.nameKey || x.id }))
};

async function loadProps(): Promise<Props> {
	const raw = await UnomiClient.getJson<Record<string, { valueTypeId?: string; metadata: { id: string; name?: string } }[]>>("/profiles/properties");
	const map = (arr?: { valueTypeId?: string; metadata: { id: string; name?: string } }[]): PropDef[] =>
		(arr || []).filter((p) => p && p.metadata && p.metadata.id).map((p) => ({ id: p.metadata.id, name: p.metadata.name || p.metadata.id, valueTypeId: p.valueTypeId || null }));
	// Event properties have no catalog endpoint → free-text (empty list).
	return { profile: map(raw.profiles), session: map(raw.sessions), event: [] };
}

// Memoize the in-flight/settled promise; drop it on rejection so a later call retries
// (catalogs load right after login — a transient 401 must not poison the cache).
const cache = new Map<string, Promise<unknown>>();
function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
	let p = cache.get(key) as Promise<T> | undefined;
	if (!p) {
		p = load().catch((e: unknown) => { cache.delete(key); throw e; });
		cache.set(key, p);
	}
	return p;
}

export function get(key: CatalogKey): Promise<Opt[]> {
	return memo(key, LOADERS[key]);
}

export function getProps(): Promise<Props> {
	return memo("props", loadProps);
}

// Drop one key (e.g. after creating/deleting a scope) or everything (on logout).
export function invalidate(key?: string): void {
	if (key) { cache.delete(key); } else { cache.clear(); }
}
