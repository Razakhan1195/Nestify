import * as SecureStore from "expo-secure-store";
import {createInventoryIntentStore} from "./inventory-create-store";
export const inventoryCreateStore=createInventoryIntentStore(SecureStore);
