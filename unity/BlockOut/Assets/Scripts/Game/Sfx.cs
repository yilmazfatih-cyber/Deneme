using UnityEngine;

namespace BlockOut.Game
{
    /// <summary>Ses dosyası olmadan, çalışma anında üretilen kısa efektler ve titreşim.</summary>
    public class Sfx : MonoBehaviour
    {
        public static Sfx Instance { get; private set; }

        const string SoundKey = "bo_sound";
        const string VibrationKey = "bo_vibration";
        const int Rate = 44100;

        public bool SoundOn { get; private set; }
        public bool VibrationOn { get; private set; }

        AudioSource source;
        AudioClip click, move, exit, thaw, win, lose, hammer;

        void Awake()
        {
            Instance = this;
            SoundOn = PlayerPrefs.GetInt(SoundKey, 1) == 1;
            VibrationOn = PlayerPrefs.GetInt(VibrationKey, 1) == 1;
            source = gameObject.AddComponent<AudioSource>();
            source.playOnAwake = false;
            source.volume = 0.8f;

            click = Tone("click", new[] { 1300f }, 0.045f, 0.4f);
            move = Tone("move", new[] { 240f }, 0.04f, 0.35f);
            exit = Sweep("exit", 520f, 980f, 0.16f, 0.6f);
            thaw = Tone("thaw", new[] { 880f, 1320f }, 0.07f, 0.5f);
            win = Arpeggio("win", new[] { 523.25f, 659.25f, 783.99f, 1046.5f }, 0.13f, 0.6f);
            lose = Sweep("lose", 420f, 230f, 0.45f, 0.5f);
            hammer = Tone("hammer", new[] { 110f, 160f }, 0.12f, 0.7f);
        }

        public void SetSound(bool on)
        {
            SoundOn = on;
            PlayerPrefs.SetInt(SoundKey, on ? 1 : 0);
            PlayerPrefs.Save();
        }

        public void SetVibration(bool on)
        {
            VibrationOn = on;
            PlayerPrefs.SetInt(VibrationKey, on ? 1 : 0);
            PlayerPrefs.Save();
        }

        public void Click() { Play(click, 0.7f); }
        public void Move() { Play(move, 0.5f); }
        public void Thaw() { Play(thaw, 0.8f); }
        public void Win() { Play(win, 1f); Vibrate(); }
        public void Lose() { Play(lose, 0.8f); }
        public void Hammer() { Play(hammer, 1f); Vibrate(); }
        public void Exit() { Play(exit, 0.9f); Vibrate(); }

        void Play(AudioClip clip, float volume)
        {
            if (!SoundOn || clip == null || source == null) return;
            source.PlayOneShot(clip, volume);
        }

        void Vibrate()
        {
            if (!VibrationOn) return;
#if UNITY_ANDROID || UNITY_IOS
            if (Application.isMobilePlatform) Handheld.Vibrate();
#endif
        }

        // --- üretim ----------------------------------------------------------------------

        /// <summary>Verilen frekansların ardışık çalındığı kısa ton.</summary>
        static AudioClip Tone(string name, float[] freqs, float noteSeconds, float gain)
        {
            int perNote = (int)(Rate * noteSeconds);
            var data = new float[perNote * freqs.Length];
            for (int n = 0; n < freqs.Length; n++)
                for (int i = 0; i < perNote; i++)
                {
                    float t = (float)i / Rate;
                    float env = Envelope((float)i / perNote);
                    data[n * perNote + i] = Mathf.Sin(2f * Mathf.PI * freqs[n] * t) * env * gain;
                }
            return Make(name, data);
        }

        /// <summary>Frekansı doğrusal kayan ton.</summary>
        static AudioClip Sweep(string name, float from, float to, float seconds, float gain)
        {
            int count = (int)(Rate * seconds);
            var data = new float[count];
            float phase = 0f;
            for (int i = 0; i < count; i++)
            {
                float u = (float)i / count;
                float f = Mathf.Lerp(from, to, u);
                phase += 2f * Mathf.PI * f / Rate;
                data[i] = Mathf.Sin(phase) * Envelope(u) * gain;
            }
            return Make(name, data);
        }

        /// <summary>Kısa arpej (kazanma sesi).</summary>
        static AudioClip Arpeggio(string name, float[] notes, float noteSeconds, float gain)
        {
            int perNote = (int)(Rate * noteSeconds);
            var data = new float[perNote * notes.Length + Rate / 4];
            for (int n = 0; n < notes.Length; n++)
            {
                int len = n == notes.Length - 1 ? perNote + Rate / 4 : perNote;
                for (int i = 0; i < len; i++)
                {
                    float t = (float)i / Rate;
                    float env = Envelope((float)i / len);
                    float s = Mathf.Sin(2f * Mathf.PI * notes[n] * t) + 0.3f * Mathf.Sin(4f * Mathf.PI * notes[n] * t);
                    data[n * perNote + i] += s * env * gain * 0.7f;
                }
            }
            return Make(name, data);
        }

        static float Envelope(float u)
        {
            float attack = Mathf.Clamp01(u / 0.08f);
            float release = Mathf.Clamp01((1f - u) / 0.5f);
            return Mathf.Min(attack, release);
        }

        static AudioClip Make(string name, float[] data)
        {
            AudioClip clip = AudioClip.Create(name, data.Length, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}
