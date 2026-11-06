import * as SecureStore from "expo-secure-store";
import {createStatementBatchStore} from "./statement-batch-core";
export const statementBatches=createStatementBatchStore(SecureStore);
