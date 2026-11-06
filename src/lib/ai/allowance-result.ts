/** Return the member allowance when no usable answer was produced.
 * This does not refund provider spending: uncertain upstream costs retain their hold.
 */
export async function withAiAllowance(
  release: (() => Promise<void>) | undefined,
  operation: () => Promise<Response>,
  onRecoveryFailure: () => void,
): Promise<Response> {
  let successful = false;
  try {
    const response = await operation();
    successful = response.ok;
    return response;
  } finally {
    if (!successful && release) {
      try { await release(); } catch { onRecoveryFailure(); }
    }
  }
}
