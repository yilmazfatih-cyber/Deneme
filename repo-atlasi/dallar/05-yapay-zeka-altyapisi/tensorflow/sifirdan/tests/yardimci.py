"""Testler için sayısal (sonlu farklar) gradyan."""

import numpy as np


def numeric_grad(f, x, eps=1e-6):
    """f: numpy dizisi -> skaler. Merkezî fark ile df/dx."""
    x = np.array(x, dtype=np.float64)
    g = np.zeros_like(x)
    for idx in np.ndindex(x.shape):
        xp, xm = x.copy(), x.copy()
        xp[idx] += eps
        xm[idx] -= eps
        g[idx] = (f(xp) - f(xm)) / (2 * eps)
    return g
