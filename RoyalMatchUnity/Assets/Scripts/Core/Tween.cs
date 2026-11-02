using System;
using System.Collections;
using UnityEngine;

namespace RoyalMatch
{
    /// <summary>Küçük bir tween yardımcı seti. Dış paket gerekmez.</summary>
    public static class Ease
    {
        public static float OutBack(float t)
        {
            const float c1 = 1.70158f, c3 = c1 + 1f;
            return 1f + c3 * Mathf.Pow(t - 1f, 3f) + c1 * Mathf.Pow(t - 1f, 2f);
        }
        public static float OutCubic(float t) { return 1f - Mathf.Pow(1f - t, 3f); }
        public static float InCubic(float t) { return t * t * t; }
        public static float InOutQuad(float t) { return t < 0.5f ? 2f * t * t : 1f - Mathf.Pow(-2f * t + 2f, 2f) / 2f; }
        public static float OutBounce(float t)
        {
            const float n1 = 7.5625f, d1 = 2.75f;
            if (t < 1f / d1) return n1 * t * t;
            if (t < 2f / d1) { t -= 1.5f / d1; return n1 * t * t + 0.75f; }
            if (t < 2.5f / d1) { t -= 2.25f / d1; return n1 * t * t + 0.9375f; }
            t -= 2.625f / d1; return n1 * t * t + 0.984375f;
        }
    }

    public static class Tween
    {
        public static IEnumerator Move(Transform tr, Vector3 to, float dur, Func<float, float> ease = null)
        {
            if (tr == null) yield break;
            Vector3 from = tr.localPosition;
            float t = 0f;
            while (t < 1f)
            {
                if (tr == null) yield break;
                t += Time.deltaTime / dur;
                float k = Mathf.Clamp01(t);
                tr.localPosition = Vector3.LerpUnclamped(from, to, ease != null ? ease(k) : k);
                yield return null;
            }
            if (tr != null) tr.localPosition = to;
        }

        public static IEnumerator Scale(Transform tr, Vector3 to, float dur, Func<float, float> ease = null)
        {
            if (tr == null) yield break;
            Vector3 from = tr.localScale;
            float t = 0f;
            while (t < 1f)
            {
                if (tr == null) yield break;
                t += Time.deltaTime / dur;
                float k = Mathf.Clamp01(t);
                tr.localScale = Vector3.LerpUnclamped(from, to, ease != null ? ease(k) : k);
                yield return null;
            }
            if (tr != null) tr.localScale = to;
        }

        public static IEnumerator Fade(SpriteRenderer sr, float toAlpha, float dur)
        {
            if (sr == null) yield break;
            Color c = sr.color; float from = c.a; float t = 0f;
            while (t < 1f)
            {
                if (sr == null) yield break;
                t += Time.deltaTime / dur;
                c.a = Mathf.Lerp(from, toAlpha, Mathf.Clamp01(t));
                sr.color = c;
                yield return null;
            }
        }

        /// <summary>Taşı yok olurken şişirip küçültür ve siler.</summary>
        public static IEnumerator PopAndDestroy(GameObject go, float dur = 0.18f)
        {
            if (go == null) yield break;
            Transform tr = go.transform;
            Vector3 big = tr.localScale * 1.25f;
            float t = 0f;
            while (t < 1f)
            {
                if (go == null) yield break;
                t += Time.deltaTime / dur;
                float k = Mathf.Clamp01(t);
                tr.localScale = k < 0.35f ? Vector3.Lerp(big / 1.25f, big, k / 0.35f) : Vector3.Lerp(big, Vector3.zero, (k - 0.35f) / 0.65f);
                yield return null;
            }
            if (go != null) UnityEngine.Object.Destroy(go);
        }

        public static IEnumerator Delay(float s)
        {
            float t = 0f;
            while (t < s) { t += Time.deltaTime; yield return null; }
        }
    }
}
