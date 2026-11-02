using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace RoyalMatch
{
    /// <summary>Tek bir taşın sahnedeki görünümü.</summary>
    public class PieceView : MonoBehaviour
    {
        public Piece piece;
        public SpriteRenderer sr;
        private float idleT;

        public static PieceView Create(Transform parent, Piece p, Vector3 pos)
        {
            var go = new GameObject("Piece");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            var v = go.AddComponent<PieceView>();
            v.sr = go.AddComponent<SpriteRenderer>();
            v.sr.sortingOrder = 20;
            v.piece = p;
            v.Refresh();
            return v;
        }

        public void Refresh()
        {
            switch (piece.kind)
            {
                case PieceKind.Rocket: sr.sprite = Art.Rocket(piece.dir); break;
                case PieceKind.Tnt: sr.sprite = Art.Tnt(); break;
                case PieceKind.LightBall: sr.sprite = Art.LightBall(); break;
                case PieceKind.Propeller: sr.sprite = Art.Propeller(); break;
                default: sr.sprite = Art.Piece(piece.color); break;
            }
            transform.localScale = Vector3.one * 0.92f;
        }

        private void Update()
        {
            // Güçlendiriciler hafifçe nefes alır
            if (piece != null && piece.IsBooster)
            {
                idleT += Time.deltaTime;
                float s = 0.92f + Mathf.Sin(idleT * 4f) * 0.03f;
                transform.localScale = new Vector3(s, s, 1f);
                if (piece.kind == PieceKind.Propeller) transform.localEulerAngles = new Vector3(0, 0, idleT * 60f);
            }
        }
    }

    /// <summary>Hücre zemini, çimen, engel ve zincir görünümleri.</summary>
    public class CellView
    {
        public SpriteRenderer back, grass, blocker, chain;
    }

    /// <summary>Görsel efektler (roket izi, patlama halkası, parçacıklar, pervane uçuşu).</summary>
    public static class Fx
    {
        public static SpriteRenderer Spawn(Transform parent, Sprite s, Vector3 pos, Color c, int order = 40)
        {
            var go = new GameObject("Fx");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = s; sr.color = c; sr.sortingOrder = order;
            return sr;
        }

        public static IEnumerator Burst(Transform parent, Vector3 pos, Color c, int n = 7)
        {
            var parts = new List<SpriteRenderer>();
            var vel = new List<Vector3>();
            for (int i = 0; i < n; i++)
            {
                var sr = Spawn(parent, Art.Particle(), pos, c, 45);
                float a = Random.Range(0f, Mathf.PI * 2f), sp = Random.Range(2.5f, 5.5f);
                sr.transform.localScale = Vector3.one * Random.Range(0.6f, 1.1f);
                parts.Add(sr); vel.Add(new Vector3(Mathf.Cos(a) * sp, Mathf.Sin(a) * sp, 0f));
            }
            float t = 0f, dur = 0.38f;
            while (t < dur)
            {
                t += Time.deltaTime;
                for (int i = 0; i < parts.Count; i++)
                {
                    if (parts[i] == null) continue;
                    vel[i] += Vector3.up * (-14f * Time.deltaTime);
                    parts[i].transform.localPosition += vel[i] * Time.deltaTime;
                    parts[i].transform.localScale = Vector3.one * Mathf.Lerp(0.9f, 0f, t / dur);
                }
                yield return null;
            }
            foreach (var p in parts) if (p != null) Object.Destroy(p.gameObject);
        }

        public static IEnumerator Ring(Transform parent, Vector3 pos, Color c, float radius, float dur = 0.35f)
        {
            var sr = Spawn(parent, Art.Ring(), pos, c, 44);
            float t = 0f;
            while (t < dur)
            {
                t += Time.deltaTime; float k = Mathf.Clamp01(t / dur);
                sr.transform.localScale = Vector3.one * Mathf.Lerp(0.3f, radius * 2f, Ease.OutCubic(k));
                sr.color = new Color(c.r, c.g, c.b, 1f - k);
                yield return null;
            }
            Object.Destroy(sr.gameObject);
        }

        /// <summary>İki roket parçası kaynaktan zıt yönlere uçar, arkasında iz bırakır.</summary>
        public static IEnumerator RocketTrail(Transform parent, Vector3 pos, RocketDir dir, float length)
        {
            var beam = Spawn(parent, Art.Beam(), pos, new Color(1f, 0.95f, 0.7f, 0.9f), 42);
            beam.transform.localEulerAngles = new Vector3(0, 0, dir == RocketDir.Horizontal ? 0f : 90f);
            var a = Spawn(parent, Art.Rocket(dir), pos, Color.white, 43);
            var b = Spawn(parent, Art.Rocket(dir), pos, Color.white, 43);
            a.transform.localScale = b.transform.localScale = Vector3.one * 0.8f;
            if (dir == RocketDir.Horizontal) { a.transform.localEulerAngles = new Vector3(0, 0, 180f); }
            else { b.transform.localEulerAngles = new Vector3(0, 0, 180f); }
            float t = 0f, dur = 0.28f;
            while (t < dur)
            {
                t += Time.deltaTime; float k = Ease.OutCubic(Mathf.Clamp01(t / dur));
                float off = k * length;
                Vector3 d = dir == RocketDir.Horizontal ? Vector3.right : Vector3.up;
                a.transform.localPosition = pos + d * off; b.transform.localPosition = pos - d * off;
                beam.transform.localScale = new Vector3(off * 2f + 0.2f, 1f, 1f);
                beam.color = new Color(1f, 0.95f, 0.7f, 0.9f * (1f - k));
                yield return null;
            }
            Object.Destroy(a.gameObject); Object.Destroy(b.gameObject); Object.Destroy(beam.gameObject);
        }

        /// <summary>Kaynaktan hedeflere ışık çizgileri.</summary>
        public static IEnumerator Lightning(Transform parent, Vector3 from, List<Vector3> targets, Color c)
        {
            var beams = new List<SpriteRenderer>();
            foreach (var to in targets)
            {
                Vector3 mid = (from + to) * 0.5f;
                float len = Vector3.Distance(from, to);
                float ang = Mathf.Atan2(to.y - from.y, to.x - from.x) * Mathf.Rad2Deg;
                var sr = Spawn(parent, Art.Beam(), mid, c, 42);
                sr.transform.localEulerAngles = new Vector3(0, 0, ang);
                sr.transform.localScale = new Vector3(Mathf.Max(0.1f, len), 0.35f, 1f);
                beams.Add(sr);
            }
            float t = 0f, dur = 0.3f;
            while (t < dur)
            {
                t += Time.deltaTime; float k = t / dur;
                foreach (var b in beams) b.color = new Color(c.r, c.g, c.b, 1f - k);
                yield return null;
            }
            foreach (var b in beams) Object.Destroy(b.gameObject);
        }

        /// <summary>Pervane kavisli uçuş.</summary>
        public static IEnumerator Fly(Transform parent, Sprite s, Vector3 from, Vector3 to, float dur = 0.5f)
        {
            var sr = Spawn(parent, s, from, Color.white, 46);
            float t = 0f;
            while (t < dur)
            {
                t += Time.deltaTime; float k = Mathf.Clamp01(t / dur);
                Vector3 p = Vector3.Lerp(from, to, Ease.InOutQuad(k));
                p.y += Mathf.Sin(k * Mathf.PI) * 1.5f;
                sr.transform.localPosition = p;
                sr.transform.localEulerAngles = new Vector3(0, 0, t * 720f);
                sr.transform.localScale = Vector3.one * (0.9f + Mathf.Sin(k * Mathf.PI) * 0.4f);
                yield return null;
            }
            Object.Destroy(sr.gameObject);
        }

        public static IEnumerator Shake(Transform tr, float amp = 0.08f, float dur = 0.25f)
        {
            Vector3 o = tr.localPosition; float t = 0f;
            while (t < dur)
            {
                t += Time.deltaTime; float k = 1f - t / dur;
                tr.localPosition = o + new Vector3(Random.Range(-amp, amp) * k, Random.Range(-amp, amp) * k, 0f);
                yield return null;
            }
            tr.localPosition = o;
        }
    }
}
