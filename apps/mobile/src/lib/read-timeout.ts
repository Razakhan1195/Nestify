/** Bound read-only UI waits; never retry or time out a purchase transaction here. */
export function withReadTimeout<T>(read: Promise<T>, milliseconds = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("This is taking longer than expected. Please try again.")), milliseconds);
    read.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
