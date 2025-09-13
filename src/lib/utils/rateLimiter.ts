import { setTimeout } from 'timers/promises';

export async function rateLimit<T>(fn: () => Promise<T>): Promise<T> {
  await setTimeout(1000);
  return fn();
}