import BaseController from "unomi/ui/controller/BaseController";
import MessageToast from "sap/m/MessageToast";
import Input from "sap/m/Input";
import * as UnomiClient from "unomi/ui/service/UnomiClient";

/**
 * @namespace unomi.ui.controller
 */
export default class Login extends BaseController {

	public async onLogin(): Promise<void> {
		const user = (this.byId("userInput") as Input).getValue();
		const pass = (this.byId("passInput") as Input).getValue();
		UnomiClient.setCredentials(user, pass);
		try {
			await UnomiClient.ping();
			this.getRouter().navTo("home");
		} catch (e) {
			UnomiClient.clearCredentials();
			MessageToast.show(`Connection failed: ${(e as Error).message}`);
		}
	}
}
