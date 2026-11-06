import * as SecureStore from "expo-secure-store";
import {createVaultPendingStore} from "./vault-pending-core";
export const vaultPending=createVaultPendingStore(SecureStore);
