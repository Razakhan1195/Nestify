import * as SecureStore from "expo-secure-store";
import { createStatementDraftStore } from "./statement-draft-core";
// One unfinished reviewed-entry draft per account; never contains file bytes or a saved-bill status.
export const statementDrafts=createStatementDraftStore(SecureStore);
