import { CatalogKey } from "unomi/ui/service/Catalog";

/**
 * Which condition/action parameter is a reference to another Unomi object, and to
 * which catalog. Unomi's definitions type these as plain `string` with no hint, so
 * the mapping is explicit here: exact "<type>.<paramId>" wins, then a "*.<paramId>"
 * wildcard (same param on any type, e.g. `scope`), then a suffix heuristic.
 *
 * ponytail: `propertyName` is NOT here — it resolves against target-specific property
 * lists (a different shape than Opt[]) and is already handled by the property rows.
 */

// Exact type.param overrides. "*" = the same param on any type.
const EXPLICIT: Record<string, CatalogKey> = {
	"*.scope": "scopes",
	"goalMatchCondition.goalId": "goals",
	"eventTypeCondition.eventTypeId": "eventTypes",
	"profileSegmentCondition.segments": "segments",
	"profileUserListCondition.lists": "lists",
	"scoringCondition.scoringPlanId": "scorings",
	"addToListsAction.listIdentifiers": "lists",
	"removeFromListsAction.listIdentifiers": "lists"
};

// Fallback by paramId suffix, tried in order. First match wins.
const BY_SUFFIX: [RegExp, CatalogKey][] = [
	[/scope$/i, "scopes"],
	[/campaignId$/i, "campaigns"],
	[/goalId$/i, "goals"],
	[/scoringPlanId$/i, "scorings"],
	[/valueTypeId$/i, "valueTypes"],
	[/eventType(Id)?$/i, "eventTypes"],
	[/listIdentifiers$/i, "lists"],
	[/segmentId$/i, "segments"]
];

export function refFor(type: string, paramId: string): CatalogKey | null {
	const exact = EXPLICIT[`${type}.${paramId}`] || EXPLICIT[`*.${paramId}`];
	if (exact) {
		return exact;
	}
	for (const [re, key] of BY_SUFFIX) {
		if (re.test(paramId)) {
			return key;
		}
	}
	return null;
}
