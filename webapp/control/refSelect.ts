import ComboBox from "sap/m/ComboBox";
import MultiComboBox from "sap/m/MultiComboBox";
import Item from "sap/ui/core/Item";
import Event from "sap/ui/base/Event";
import * as Catalog from "unomi/ui/service/Catalog";
import { CatalogKey, Opt } from "unomi/ui/service/Catalog";

/**
 * Native searchable picker for a reference to another Unomi object. Single value ->
 * ComboBox (type-ahead, free text still allowed for ids not yet in the catalog);
 * many -> MultiComboBox. Items are filled async from the cached Catalog; `commit`
 * writes the chosen id(s) back to the owning parameterValues/model.
 *
 * ponytail: full-list + client-side filter (catalogs are small). If one ever grows,
 * swap that key to a SelectDialog/ValueHelpDialog with server-side search here.
 */
export function refSelect(key: CatalogKey, value: unknown, multi: boolean, commit: (v: string | string[]) => void): ComboBox | MultiComboBox {
	if (multi) {
		const mcb = new MultiComboBox({ width: "24rem" });
		const selected = ((value as string[]) || []).slice();
		void fill(key, (items) => { items.forEach((o) => mcb.addItem(new Item({ key: o.id, text: o.name }))); mcb.setSelectedKeys(selected); });
		mcb.attachSelectionChange(() => commit(mcb.getSelectedKeys()));
		return mcb;
	}
	const id = (value as string) || "";
	const cb = new ComboBox({ width: "16rem", selectedKey: id, value: id });
	// Re-apply the key after items load so it renders the name (not the raw id).
	void fill(key, (items) => { items.forEach((o) => cb.addItem(new Item({ key: o.id, text: o.name }))); cb.setSelectedKey(id); if (!cb.getSelectedItem()) { cb.setValue(id); } });
	cb.attachSelectionChange((e: Event) => { const it = e.getParameter("selectedItem" as never) as Item; if (it) { commit(it.getKey()); } });
	cb.attachChange(() => commit(cb.getSelectedKey() || cb.getValue()));
	return cb;
}

// Fill from the catalog; on error leave it empty so free-text entry still works.
async function fill(key: CatalogKey, apply: (items: Opt[]) => void): Promise<void> {
	try { apply(await Catalog.get(key)); } catch { /* offline / not authed: keep free text */ }
}
