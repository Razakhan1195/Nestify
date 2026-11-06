import * as SecureStore from "expo-secure-store";
import {createReceiptBatchStore} from "./receipt-batch-core";
export const receiptBatches=createReceiptBatchStore(SecureStore);
