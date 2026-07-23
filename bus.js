/**
 * Minimal event bus.
 *
 * Exists to break a dependency cycle: the map and the route cards both need to
 * trigger a selection change, and both need to re-render when one happens.
 * Rather than importing each other, they emit here and app.js wires the
 * response. Keeps the module graph acyclic.
 */
const handlers = new Map();

export function on(event, fn){
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => handlers.get(event).delete(fn);
}

export function emit(event, ...args){
  const set = handlers.get(event);
  if (!set) return;
  for (const fn of set) fn(...args);
}
