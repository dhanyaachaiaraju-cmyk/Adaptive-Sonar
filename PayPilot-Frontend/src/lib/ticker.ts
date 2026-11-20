/**
 * One shared requestAnimationFrame loop for every 2D canvas instrument.
 * Subscribers are only called while they report themselves visible, and the loop stops
 * entirely when nothing is subscribed — so N charts never mean N animation loops.
 */
type Tick = (now: number) => void

const subs = new Set<Tick>()
let raf = 0

function loop(now: number) {
  subs.forEach((fn) => fn(now))
  raf = subs.size ? requestAnimationFrame(loop) : 0
}

export function onTick(fn: Tick): () => void {
  subs.add(fn)
  if (!raf) raf = requestAnimationFrame(loop)
  return () => {
    subs.delete(fn)
    if (!subs.size && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }
}

/** Observe visibility so off-screen instruments skip their draw work. */
export function observeVisibility(el: Element, cb: (visible: boolean) => void): () => void {
  const io = new IntersectionObserver((entries) => cb(entries.some((e) => e.isIntersecting)), { rootMargin: '80px' })
  io.observe(el)
  return () => io.disconnect()
}
