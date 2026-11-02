using System;
using System.Collections;
using System.Collections.Generic;
using BlockOut.Core;
using UnityEngine;

namespace BlockOut.Game
{
    /// <summary>Bir bloğun 3B görünümü: hücre küpleri, hücre arası köprüler, buz katmanı ve sayaç.</summary>
    public class BlockView : MonoBehaviour
    {
        public Block Block { get; private set; }

        BoardView board;
        Vector3 targetPos;
        readonly List<GameObject> iceParts = new List<GameObject>();
        TextMesh counter;
        bool exiting;

        const float CellScale = 0.92f;
        const float BlockHeight = 0.62f;

        public void Init(Block block, BoardView boardView)
        {
            Block = block;
            board = boardView;
            Material mat = Palette.Lit(Palette.Get(block.Color));

            foreach (Vector2Int c in block.BaseCells)
            {
                GameObject cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
                cube.name = "Cell";
                cube.transform.SetParent(transform, false);
                cube.transform.localPosition = board.CellToLocal(c) + Vector3.up * (BlockHeight / 2f);
                cube.transform.localScale = new Vector3(CellScale, BlockHeight, CellScale);
                cube.GetComponent<Renderer>().sharedMaterial = mat;

                // Komşu hücrelerle aradaki boşluğu kapatan köprüler (tek parça görünsün).
                Vector2Int right = c + new Vector2Int(1, 0);
                Vector2Int down = c + new Vector2Int(0, 1);
                if (block.BaseCells.Contains(right)) AddBridge(c, right, mat, true);
                if (block.BaseCells.Contains(down)) AddBridge(c, down, mat, false);
            }

            targetPos = board.OffsetToWorld(block.Offset);
            transform.position = targetPos;
        }

        void AddBridge(Vector2Int a, Vector2Int b, Material mat, bool horizontal)
        {
            GameObject bridge = GameObject.CreatePrimitive(PrimitiveType.Cube);
            bridge.name = "Bridge";
            bridge.transform.SetParent(transform, false);
            Vector3 mid = (board.CellToLocal(a) + board.CellToLocal(b)) / 2f + Vector3.up * (BlockHeight / 2f);
            bridge.transform.localPosition = mid;
            float gap = 1f - CellScale + 0.06f;
            bridge.transform.localScale = horizontal
                ? new Vector3(gap, BlockHeight, CellScale)
                : new Vector3(CellScale, BlockHeight, gap);
            bridge.GetComponent<Renderer>().sharedMaterial = mat;
            Destroy(bridge.GetComponent<Collider>());
        }

        /// <summary>Buz katmanını günceller. 0 ise buz kaldırılır.</summary>
        public void SetFrozen(int left)
        {
            if (left <= 0)
            {
                if (iceParts.Count > 0)
                {
                    foreach (GameObject g in iceParts) Destroy(g);
                    iceParts.Clear();
                    if (Sfx.Instance != null) Sfx.Instance.Thaw();
                    StartCoroutine(Pop());
                }
                return;
            }
            if (iceParts.Count == 0)
            {
                Material ice = Palette.Translucent(Palette.Ice);
                foreach (Vector2Int c in Block.BaseCells)
                {
                    GameObject cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    cube.name = "Ice";
                    cube.transform.SetParent(transform, false);
                    cube.transform.localPosition = board.CellToLocal(c) + Vector3.up * (BlockHeight / 2f + 0.04f);
                    cube.transform.localScale = new Vector3(1.0f, BlockHeight + 0.14f, 1.0f);
                    cube.GetComponent<Renderer>().sharedMaterial = ice;
                    Destroy(cube.GetComponent<Collider>());
                    iceParts.Add(cube);
                }
                GameObject textGo = new GameObject("Counter");
                textGo.transform.SetParent(transform, false);
                Vector2 center = Vector2.zero;
                foreach (Vector2Int c in Block.BaseCells) center += new Vector2(c.x, c.y);
                center /= Block.BaseCells.Count;
                textGo.transform.localPosition = board.CellToLocal(center) + Vector3.up * (BlockHeight + 0.25f);
                counter = textGo.AddComponent<TextMesh>();
                counter.font = Palette.Font;
                counter.GetComponent<MeshRenderer>().sharedMaterial = Palette.Font.material;
                counter.fontSize = 64;
                counter.characterSize = 0.12f;
                counter.anchor = TextAnchor.MiddleCenter;
                counter.alignment = TextAlignment.Center;
                counter.color = new Color(0.08f, 0.2f, 0.4f);
                counter.fontStyle = FontStyle.Bold;
                iceParts.Add(textGo);
            }
            if (counter != null)
            {
                counter.text = left.ToString();
                if (Camera.main != null) counter.transform.rotation = Camera.main.transform.rotation;
            }
        }

        IEnumerator Pop()
        {
            float t = 0f;
            while (t < 0.18f)
            {
                t += Time.deltaTime;
                float s = 1f + 0.12f * Mathf.Sin(t / 0.18f * Mathf.PI);
                transform.localScale = new Vector3(s, s, s);
                yield return null;
            }
            transform.localScale = Vector3.one;
        }

        public void SyncTarget()
        {
            targetPos = board.OffsetToWorld(Block.Offset);
        }

        void Update()
        {
            if (exiting) return;
            float k = 1f - Mathf.Exp(-Time.deltaTime * 24f);
            transform.position = Vector3.Lerp(transform.position, targetPos, k);
        }

        /// <summary>Kapıdan dışarı kayma animasyonu; bitince nesne silinir.</summary>
        public void PlayExit(Dir dir, Action onDone)
        {
            exiting = true;
            foreach (Collider c in GetComponentsInChildren<Collider>()) c.enabled = false;
            StartCoroutine(ExitRoutine(dir, onDone));
        }

        IEnumerator ExitRoutine(Dir dir, Action onDone)
        {
            Vector3 from = targetPos;
            Vector3 to = from + board.DirToWorld(dir) * 2.6f;
            float t = 0f;
            const float dur = 0.28f;
            while (t < dur)
            {
                t += Time.deltaTime;
                float u = Mathf.Clamp01(t / dur);
                float e = 1f - (1f - u) * (1f - u);
                transform.position = Vector3.Lerp(from, to, e);
                float s = Mathf.Lerp(1f, 0.15f, u * u);
                transform.localScale = new Vector3(s, s, s);
                yield return null;
            }
            if (onDone != null) onDone();
            Destroy(gameObject);
        }
    }
}
