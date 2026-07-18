from __future__ import annotations
"""Lazy proxy — defers object construction until first attribute access.
Reduces cold-start weight: only what a request actually uses gets loaded."""
import asyncio


class lazy:
    __slots__ = ('_f', '_v')

    def __init__(self, f):
        object.__setattr__(self, '_f', f)
        object.__setattr__(self, '_v', None)

    def _r(self):
        v = object.__getattribute__(self, '_v')
        if v is None:
            v = object.__getattribute__(self, '_f')()
            object.__setattr__(self, '_v', v)
        return v

    def __getattr__(self, n): return getattr(self._r(), n)

    def __setattr__(self, n, v): setattr(self._r(), n, v)

    def __call__(self, *a, **kw): return self._r()(*a, **kw)
