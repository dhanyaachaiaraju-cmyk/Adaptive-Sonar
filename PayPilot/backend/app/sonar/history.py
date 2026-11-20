"""Bounded, sequence-numbered buffers so clients can poll incrementally (since=<seq>)."""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable


class SeqBuffer:
    def __init__(self, maxlen: int):
        self._items: deque[dict] = deque(maxlen=maxlen)
        self.seq = 0

    def append(self, item: dict) -> dict:
        self.seq += 1
        item = {"seq": self.seq, **item}
        self._items.append(item)
        return item

    def since(self, seq: int | None = None, limit: int | None = None) -> list[dict]:
        items: Iterable[dict] = self._items
        if seq is not None:
            items = [i for i in self._items if i["seq"] > seq]
        items = list(items)
        if limit is not None and len(items) > limit:
            items = items[-limit:]
        return items

    def latest(self) -> dict | None:
        return self._items[-1] if self._items else None

    def clear(self) -> None:
        self._items.clear()
        self.seq = 0

    def __len__(self) -> int:
        return len(self._items)
