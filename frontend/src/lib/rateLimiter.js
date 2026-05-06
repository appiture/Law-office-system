/**
 * Rate Limiter / Debounce utility for critical write operations.
 *
 * Prevents duplicate submissions caused by double-clicks, network retries,
 * or rapid form re-submissions.
 */

const activeLocks = new Map();

/**
 * Creates a debounced guard for a named action.
 * If the action is already in progress, the duplicate call is rejected.
 * After the action completes (or fails), the lock is released after `cooldownMs`.
 *
 * @param {string} actionKey  Unique key for the action (e.g. "addPayment:caseId")
 * @param {Function} fn       The async function to execute
 * @param {number} cooldownMs Minimum time between repeated calls (default 1500ms)
 * @returns {Promise<*>}      The result of fn()
 */
export const guardAction = async (actionKey, fn, cooldownMs = 1500) => {
  const now = Date.now();
  const existing = activeLocks.get(actionKey);

  if (existing) {
    if (existing.pending) {
      throw new Error("This action is already in progress. Please wait.");
    }
    if (now - existing.completedAt < cooldownMs) {
      throw new Error("Please wait before repeating this action.");
    }
  }

  activeLocks.set(actionKey, { pending: true, completedAt: 0 });

  try {
    const result = await fn();
    activeLocks.set(actionKey, { pending: false, completedAt: Date.now() });
    return result;
  } catch (error) {
    activeLocks.set(actionKey, { pending: false, completedAt: Date.now() });
    throw error;
  }
};

/**
 * Checks if an action is currently locked (in-progress or cooling down).
 */
export const isActionLocked = (actionKey, cooldownMs = 1500) => {
  const existing = activeLocks.get(actionKey);
  if (!existing) return false;
  if (existing.pending) return true;
  return Date.now() - existing.completedAt < cooldownMs;
};

/**
 * Clears all action locks. Call on logout or organization switch.
 */
export const clearAllActionLocks = () => {
  activeLocks.clear();
};

/**
 * Creates a simple debounce wrapper for a function.
 * Subsequent calls within `delayMs` cancel the previous call.
 */
export const debounce = (fn, delayMs = 300) => {
  let timerId = null;
  const debounced = (...args) => {
    if (timerId !== null) clearTimeout(timerId);
    timerId = setTimeout(() => {
      timerId = null;
      fn(...args);
    }, delayMs);
  };
  debounced.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };
  return debounced;
};
