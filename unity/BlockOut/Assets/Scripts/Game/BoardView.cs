using System.Collections.Generic;
using BlockOut.Core;
using UnityEngine;

namespace BlockOut.Game
{
    /// <summary>Tahtayı (zemin, hücreler, duvarlar, kapılar, bloklar) kurar ve kamerayı sığdırır.</summary>
    public class BoardView : MonoBehaviour
    {
        public Board Board { get; private set; }
        public Camera Cam;

        Transform root;
        readonly Dictionary<Block, BlockView> views = new Dictionary<Block, BlockView>();
        int lastW, lastH;
        const float Tilt = 58f;

        public void Build(Board board)
        {
            Board = board;
            views.Clear();
            if (root != null) Destroy(root.gameObject);
            root = new GameObject("BoardRoot").transform;
            root.SetParent(transform, false);

            BuildFloor();
            BuildGates();
            foreach (Block b in board.Blocks) CreateView(b);
            RefreshFrozen();
            FitCamera();
        }

        // --- koordinatlar ---------------------------------------------------------------

        /// <summary>Model hücresi (x sağa, y aşağı) -> dünya (x sağa, z ileri). Tahta merkezde, y=0 düzlemi.</summary>
        public Vector3 CellToLocal(Vector2 c)
        {
            return new Vector3(c.x - (Board.Width - 1) / 2f, 0f, (Board.Height - 1) / 2f - c.y);
        }

        public Vector3 CellToLocal(Vector2Int c)
        {
            return CellToLocal(new Vector2(c.x, c.y));
        }

        public Vector3 OffsetToWorld(Vector2Int offset)
        {
            return new Vector3(offset.x, 0f, -offset.y);
        }

        public Vector3 DirToWorld(Dir d)
        {
            Vector2Int v = DirUtil.Delta(d);
            return new Vector3(v.x, 0f, -v.y);
        }

        /// <summary>Dünya noktasını (y=0 düzlemi) model hücresine çevirir.</summary>
        public Vector2Int WorldToCell(Vector3 p)
        {
            return new Vector2Int(
                Mathf.RoundToInt(p.x + (Board.Width - 1) / 2f),
                Mathf.RoundToInt((Board.Height - 1) / 2f - p.z));
        }

        // --- kurulum --------------------------------------------------------------------

        void BuildFloor()
        {
            GameObject floor = GameObject.CreatePrimitive(PrimitiveType.Cube);
            floor.name = "Floor";
            floor.transform.SetParent(root, false);
            floor.transform.localPosition = new Vector3(0f, -0.12f, 0f);
            floor.transform.localScale = new Vector3(Board.Width + 0.5f, 0.2f, Board.Height + 0.5f);
            floor.GetComponent<Renderer>().sharedMaterial = Palette.Lit(Palette.Floor);
            Destroy(floor.GetComponent<Collider>());

            Material tile = Palette.Lit(Palette.Tile);
            Material wall = Palette.Lit(Palette.Wall);
            for (int y = 0; y < Board.Height; y++)
                for (int x = 0; x < Board.Width; x++)
                {
                    var c = new Vector2Int(x, y);
                    GameObject g = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    g.transform.SetParent(root, false);
                    Destroy(g.GetComponent<Collider>());
                    if (Board.Walls.Contains(c))
                    {
                        g.name = "Wall";
                        g.transform.localPosition = CellToLocal(c) + Vector3.up * 0.35f;
                        g.transform.localScale = new Vector3(0.98f, 0.7f, 0.98f);
                        g.GetComponent<Renderer>().sharedMaterial = wall;
                    }
                    else
                    {
                        g.name = "Tile";
                        g.transform.localPosition = CellToLocal(c);
                        g.transform.localScale = new Vector3(0.94f, 0.04f, 0.94f);
                        g.GetComponent<Renderer>().sharedMaterial = tile;
                    }
                }
        }

        void BuildGates()
        {
            const float thick = 0.32f;
            const float offset = 0.5f + 0.24f;
            foreach (GateDef gate in Board.Gates)
            {
                GameObject g = GameObject.CreatePrimitive(PrimitiveType.Cube);
                g.name = "Gate";
                g.transform.SetParent(root, false);
                Destroy(g.GetComponent<Collider>());
                g.GetComponent<Renderer>().sharedMaterial = Palette.Lit(Palette.Get(gate.Color));
                float mid = gate.Start + (gate.Length - 1) / 2f;
                float len = gate.Length - 0.12f;
                Vector3 pos;
                Vector3 scale;
                switch (gate.Side)
                {
                    case Dir.Up:
                        pos = CellToLocal(new Vector2(mid, 0)) + new Vector3(0f, 0.18f, offset);
                        scale = new Vector3(len, 0.36f, thick);
                        break;
                    case Dir.Down:
                        pos = CellToLocal(new Vector2(mid, Board.Height - 1)) + new Vector3(0f, 0.18f, -offset);
                        scale = new Vector3(len, 0.36f, thick);
                        break;
                    case Dir.Left:
                        pos = CellToLocal(new Vector2(0, mid)) + new Vector3(-offset, 0.18f, 0f);
                        scale = new Vector3(thick, 0.36f, len);
                        break;
                    default:
                        pos = CellToLocal(new Vector2(Board.Width - 1, mid)) + new Vector3(offset, 0.18f, 0f);
                        scale = new Vector3(thick, 0.36f, len);
                        break;
                }
                g.transform.localPosition = pos;
                g.transform.localScale = scale;
            }
        }

        BlockView CreateView(Block b)
        {
            GameObject go = new GameObject("Block " + b.Id);
            go.transform.SetParent(root, false);
            BlockView v = go.AddComponent<BlockView>();
            v.Init(b, this);
            views[b] = v;
            return v;
        }

        // --- güncellemeler --------------------------------------------------------------

        public void SetVisible(bool visible)
        {
            if (root != null) root.gameObject.SetActive(visible);
        }

        public BlockView GetView(Block b)
        {
            BlockView v;
            return views.TryGetValue(b, out v) ? v : null;
        }

        public void OnBlockMoved(Block b)
        {
            BlockView v = GetView(b);
            if (v != null) v.SyncTarget();
        }

        public void OnBlockExited(Block b, Dir d)
        {
            BlockView v = GetView(b);
            views.Remove(b);
            if (v != null) v.PlayExit(d, null);
        }

        public void RefreshFrozen()
        {
            foreach (KeyValuePair<Block, BlockView> kv in views)
                kv.Value.SetFrozen(Board.FrozenLeft(kv.Key));
        }

        // --- kamera ---------------------------------------------------------------------

        public void FitCamera()
        {
            if (Cam == null || Board == null) return;
            lastW = Screen.width;
            lastH = Screen.height;
            Cam.orthographic = true;
            Cam.transform.rotation = Quaternion.Euler(Tilt, 0f, 0f);
            float rad = Tilt * Mathf.Deg2Rad;
            float w = Board.Width + 1.8f;
            float d = Board.Height + 1.8f;
            float vertical = d * Mathf.Sin(rad) + 1.2f * Mathf.Cos(rad);
            float aspect = (float)Screen.width / Mathf.Max(1, Screen.height);
            // Üstte ve altta arayüz için pay bırak (%14 + %14).
            float size = Mathf.Max(vertical / 2f / 0.72f, w / 2f / aspect / 0.96f);
            Cam.orthographicSize = size;
            Cam.nearClipPlane = 0.3f;
            Cam.farClipPlane = 120f;
            Cam.transform.position = Vector3.zero - Cam.transform.forward * 40f;
            Cam.clearFlags = CameraClearFlags.SolidColor;
            Cam.backgroundColor = Palette.Background;
        }

        void Update()
        {
            if (Screen.width != lastW || Screen.height != lastH) FitCamera();
        }
    }
}
