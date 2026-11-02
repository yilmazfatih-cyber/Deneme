using System;
using System.Collections.Generic;
using UnityEngine;

namespace RoyalMatch
{
    public enum SfxKind { Pop, Swap, Invalid, Boom, Rocket, Whoosh, Create, Win, Lose, Coin, Click, Star, Shuffle }

    /// <summary>Tüm sesler çalışma anında sentezlenir (ses dosyası yok).</summary>
    public class Sfx : MonoBehaviour
    {
        public static Sfx I;
        private AudioSource src;
        private readonly Dictionary<SfxKind, AudioClip> clips = new Dictionary<SfxKind, AudioClip>();
        private const int Rate = 22050;

        private void Awake()
        {
            I = this;
            src = gameObject.AddComponent<AudioSource>();
            src.playOnAwake = false;
            if (gameObject.GetComponent<AudioListener>() == null) gameObject.AddComponent<AudioListener>();
        }

        public static void Play(SfxKind k, float volume = 1f)
        {
            if (I == null || !Save.Data.sound) return;
            AudioClip c;
            if (!I.clips.TryGetValue(k, out c)) { c = I.Make(k); I.clips[k] = c; }
            I.src.pitch = k == SfxKind.Pop ? UnityEngine.Random.Range(0.92f, 1.1f) : 1f;
            I.src.PlayOneShot(c, volume);
        }

        private AudioClip Make(SfxKind k)
        {
            float[] d;
            switch (k)
            {
                case SfxKind.Pop: d = Tone(0.12f, t => 520f + 300f * (1f - t), t => Mathf.Exp(-t * 30f)); break;
                case SfxKind.Swap: d = Noise(0.09f, t => Mathf.Sin(t * Mathf.PI) * 0.4f, 1400f); break;
                case SfxKind.Invalid: d = Tone(0.16f, t => 220f, t => Mathf.Exp(-t * 10f) * (t < 0.04f || (t > 0.08f && t < 0.12f) ? 1f : 0.2f)); break;
                case SfxKind.Boom: d = Mix(Noise(0.45f, t => Mathf.Exp(-t * 7f), 500f), Tone(0.45f, t => 80f - 40f * t, t => Mathf.Exp(-t * 6f))); break;
                case SfxKind.Rocket: d = Mix(Tone(0.35f, t => 300f + 900f * t, t => Mathf.Exp(-t * 6f) * 0.6f), Noise(0.35f, t => Mathf.Exp(-t * 5f) * 0.5f, 3000f)); break;
                case SfxKind.Whoosh: d = Noise(0.25f, t => Mathf.Sin(t * Mathf.PI) * 0.6f, 2500f); break;
                case SfxKind.Create: d = Arp(new[] { 660f, 880f, 1320f }, 0.07f, 0.25f); break;
                case SfxKind.Win: d = Arp(new[] { 523f, 659f, 784f, 1047f, 1319f }, 0.11f, 0.5f); break;
                case SfxKind.Lose: d = Arp(new[] { 392f, 330f, 262f }, 0.22f, 0.5f); break;
                case SfxKind.Coin: d = Arp(new[] { 1568f, 2093f }, 0.06f, 0.18f); break;
                case SfxKind.Star: d = Arp(new[] { 1047f, 1319f, 1568f }, 0.06f, 0.3f); break;
                case SfxKind.Shuffle: d = Noise(0.5f, t => Mathf.Abs(Mathf.Sin(t * 40f)) * Mathf.Exp(-t * 3f) * 0.5f, 2000f); break;
                default: d = Tone(0.05f, t => 900f, t => Mathf.Exp(-t * 60f)); break;
            }
            var clip = AudioClip.Create(k.ToString(), d.Length, 1, Rate, false);
            clip.SetData(d, 0);
            return clip;
        }

        private static float[] Tone(float dur, Func<float, float> freq, Func<float, float> env)
        {
            int n = (int)(dur * Rate);
            var d = new float[n];
            float phase = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / n;
                phase += 2f * Mathf.PI * freq(t) / Rate;
                d[i] = Mathf.Sin(phase) * env(t) * 0.7f;
            }
            return d;
        }

        private static float[] Noise(float dur, Func<float, float> env, float cutoff)
        {
            int n = (int)(dur * Rate);
            var d = new float[n];
            var rnd = new System.Random(7);
            float lp = 0f, a = Mathf.Clamp01(cutoff / Rate * 2f);
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / n;
                float white = (float)rnd.NextDouble() * 2f - 1f;
                lp += a * (white - lp);
                d[i] = lp * env(t) * 0.9f;
            }
            return d;
        }

        private static float[] Arp(float[] notes, float step, float total)
        {
            int n = (int)(total * Rate);
            var d = new float[n];
            for (int k = 0; k < notes.Length; k++)
            {
                int start = (int)(k * step * Rate);
                float phase = 0f;
                for (int i = start; i < n; i++)
                {
                    float t = (float)(i - start) / Rate;
                    phase += 2f * Mathf.PI * notes[k] / Rate;
                    d[i] += (Mathf.Sin(phase) + 0.3f * Mathf.Sin(phase * 2f)) * Mathf.Exp(-t * 9f) * 0.35f;
                }
            }
            return d;
        }

        private static float[] Mix(float[] a, float[] b)
        {
            int n = Math.Max(a.Length, b.Length);
            var d = new float[n];
            for (int i = 0; i < n; i++) d[i] = Mathf.Clamp((i < a.Length ? a[i] : 0f) + (i < b.Length ? b[i] : 0f), -1f, 1f);
            return d;
        }
    }
}
