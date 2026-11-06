// A distinct path prevents an older backend from silently treating a historical
// payload as a current unpaid bill if a deployment rolls back during entry.
export { POST } from "../route";
export const dynamic = "force-dynamic";
