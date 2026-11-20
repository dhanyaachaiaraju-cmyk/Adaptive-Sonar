/**
 * Cross-view selection state. One selection drives every view: selecting an adaptation
 * event highlights it on the timeline, the charts and the decision-network pathway;
 * selecting a target focuses the ocean camera and opens its inspector.
 */
import { useSyncExternalStore } from 'react'

export interface Selection {
  eventSeq: number | null
  targetId: string | null
  nodeId: string | null
}

let state: Selection = { eventSeq: null, targetId: null, nodeId: null }
const listeners = new Set<() => void>()

export function select(patch: Partial<Selection>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function getSelection(): Selection {
  return state
}

export function subscribeSelection(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useSelection<T>(pick: (s: Selection) => T): T {
  return useSyncExternalStore(
    subscribeSelection,
    () => pick(state),
    () => pick(state),
  )
}
