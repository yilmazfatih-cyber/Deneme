using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace RoyalMatch
{
    public interface IBoardListener
    {
        void OnMoves(int left);
        void OnGoal(GoalType g, int remaining, Vector3 worldPos);
        void OnBoosterModeChanged(InGameBooster? active);
        void OnWon(int bonusMoves);
        void OnLost();
        void OnMessage(string text);
        void OnFlash();
    }

    /// <summary>
    /// Tahtanın sahnedeki yöneticisi: girdi, model adımları ve animasyon sırası.
    /// Her çözüm dalgası: olaylar canlandırılır → yer çekimi → yeniden dalga.
    /// </summary>
    public class BoardController : MonoBehaviour
    {
        public BoardModel model;
        public LevelData level;
        private IBoardListener listener;
        private Camera cam;
        private readonly Dictionary<int, PieceView> views = new Dictionary<int, PieceView>();
        private CellView[,] cellViews;
        private Transform boardRoot, fxRoot;
        private SpriteRenderer selectRing;
        public bool Busy { get; private set; }
        public bool InputEnabled = true;
        private InGameBooster? boosterMode;
        private Vector2Int? selected;
        private Vector2Int? dragStart;
        private Vector3 dragStartWorld;
        private float idleTimer;
        private List<PieceView> hintViews = new List<PieceView>();
        private Coroutine hintRoutine;
        private bool finished;

        public const float CellSize = 1f;

        public void Setup(LevelData lv, IList<StartBooster> startBoosters, IBoardListener l, Camera camera)
        {
            level = lv; listener = l; cam = camera;
            model = new BoardModel(lv);
            model.PlaceStartBoosters(startBoosters);
            boardRoot = new GameObject("Board").transform; boardRoot.SetParent(transform, false);
            fxRoot = new GameObject("Fx").transform; fxRoot.SetParent(transform, false);
            BuildStatic();
            SyncAll();
            FitCamera();
            listener.OnMoves(model.movesLeft);
            foreach (var kv in model.goals) listener.OnGoal(kv.Key, kv.Value, Vector3.zero);
            StartCoroutine(IntroDrop());
        }

        public Vector3 CellPos(int x, int y)
        {
            return new Vector3((x - (model.W - 1) * 0.5f) * CellSize, (y - (model.H - 1) * 0.5f) * CellSize, 0f);
        }

        public Vector3 CellWorld(int x, int y) { return boardRoot.TransformPoint(CellPos(x, y)); }

        private void FitCamera()
        {
            float aspect = (float)Screen.width / Screen.height;
            float needW = (model.W + 1.2f) * CellSize / 2f / aspect;
            float needH = (model.H + 7.5f) * CellSize / 2f;
            cam.orthographic = true;
            cam.orthographicSize = Mathf.Max(needW, needH);
            cam.transform.position = new Vector3(0f, 0.6f, -10f);
        }

        private void BuildStatic()
        {
            // Çerçeve: ahşap + altın şerit + koyu iç (tek 9-slice sprite)
            var frame = Fx.Spawn(boardRoot, Art.BoardFrame(), Vector3.zero, Color.white, 0);
            frame.drawMode = SpriteDrawMode.Sliced; frame.size = new Vector2(model.W + 0.5f, model.H + 0.5f);

            cellViews = new CellView[model.W, model.H];
            for (int x = 0; x < model.W; x++)
                for (int y = 0; y < model.H; y++)
                {
                    var c = model.cells[x, y];
                    var cv = new CellView();
                    cellViews[x, y] = cv;
                    if (!c.exists) continue;
                    cv.back = Fx.Spawn(boardRoot, Art.CellBack(), CellPos(x, y), (x + y) % 2 == 0 ? Art.Hex("#23305A") : Art.Hex("#2B3A66"), 3);
                    RefreshCell(x, y);
                }
            selectRing = Fx.Spawn(boardRoot, Art.SelectRing(), Vector3.zero, new Color(1f, 1f, 1f, 0.9f), 30);
            selectRing.gameObject.SetActive(false);
        }

        private void RefreshCell(int x, int y)
        {
            var c = model.cells[x, y]; var cv = cellViews[x, y];
            if (!c.exists) return;
            // çimen
            if (c.grass > 0)
            {
                if (cv.grass == null) cv.grass = Fx.Spawn(boardRoot, Art.Grass(c.grass), CellPos(x, y), Color.white, 5);
                cv.grass.sprite = Art.Grass(c.grass);
            }
            else if (cv.grass != null) { Destroy(cv.grass.gameObject); cv.grass = null; }
            // engel
            if (c.HasBlocker)
            {
                if (cv.blocker == null) cv.blocker = Fx.Spawn(boardRoot, BlockerSprite(c.blocker, c.blockerHp), CellPos(x, y), Color.white, 22);
                cv.blocker.sprite = BlockerSprite(c.blocker, c.blockerHp);
                cv.blocker.transform.localScale = Vector3.one * 0.94f;
            }
            else if (cv.blocker != null) { Destroy(cv.blocker.gameObject); cv.blocker = null; }
            // zincir
            if (c.chain)
            {
                if (cv.chain == null) cv.chain = Fx.Spawn(boardRoot, Art.Chain(), CellPos(x, y), Color.white, 25);
            }
            else if (cv.chain != null) { Destroy(cv.chain.gameObject); cv.chain = null; }
        }

        public static Sprite BlockerSprite(BlockerType t, int hp)
        {
            switch (t)
            {
                case BlockerType.Box: return Art.Box(hp);
                case BlockerType.Vase: return Art.Vase(hp);
                case BlockerType.Plate: return Art.Plate(hp);
                case BlockerType.Egg: return Art.Egg(hp);
                case BlockerType.Safe: return Art.Safe(hp);
                default: return Art.Mailbox(hp);
            }
        }

        /// <summary>Modeldeki her taş için görünüm olmasını ve doğru yerde durmasını sağlar.</summary>
        private void SyncAll()
        {
            var alive = new HashSet<int>();
            for (int x = 0; x < model.W; x++)
                for (int y = 0; y < model.H; y++)
                {
                    var c = model.cells[x, y];
                    if (c.piece == null) continue;
                    alive.Add(c.piece.id);
                    PieceView v;
                    if (!views.TryGetValue(c.piece.id, out v) || v == null)
                    {
                        v = PieceView.Create(boardRoot, c.piece, CellPos(x, y));
                        views[c.piece.id] = v;
                    }
                    v.transform.localPosition = CellPos(x, y);
                    v.Refresh();
                }
            var dead = new List<int>();
            foreach (var kv in views) if (!alive.Contains(kv.Key)) { if (kv.Value != null) Destroy(kv.Value.gameObject); dead.Add(kv.Key); }
            foreach (var d in dead) views.Remove(d);
        }

        private IEnumerator IntroDrop()
        {
            Busy = true;
            // Taşlar yukarıdan düşer
            foreach (var kv in views)
            {
                var v = kv.Value; if (v == null) continue;
                Vector3 target = v.transform.localPosition;
                v.transform.localPosition = target + Vector3.up * (model.H + 2f);
                StartCoroutine(Tween.Move(v.transform, target, 0.45f + 0.03f * (target.y + model.H), Ease.OutCubic));
            }
            yield return Tween.Delay(0.75f);
            Busy = false;
            idleTimer = 0f;
        }

        // ------------------------------------------------------------------ Girdi
        private void Update()
        {
            if (finished || model == null) return;
            if (Busy || !InputEnabled) { idleTimer = 0f; return; }

            idleTimer += Time.deltaTime;
            if (idleTimer > 4f && hintRoutine == null) hintRoutine = StartCoroutine(ShowHint());

            bool down = Input.GetMouseButtonDown(0), held = Input.GetMouseButton(0), up = Input.GetMouseButtonUp(0);
            Vector3 screen = Input.mousePosition;
            bool overUi = EventSystem.current != null && EventSystem.current.IsPointerOverGameObject();
            if (Input.touchCount > 0)
            {
                var t = Input.GetTouch(0);
                screen = t.position;
                down = t.phase == TouchPhase.Began; up = t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled; held = !up;
                overUi = EventSystem.current != null && EventSystem.current.IsPointerOverGameObject(t.fingerId);
            }
            if (down && overUi) return;

            Vector3 world = cam.ScreenToWorldPoint(new Vector3(screen.x, screen.y, 10f));
            Vector2Int? cell = CellAt(world);

            if (down)
            {
                ClearHint();
                if (boosterMode != null)
                {
                    if (cell != null) StartCoroutine(ApplyBooster(boosterMode.Value, cell.Value));
                    return;
                }
                if (cell == null) { Select(null); return; }
                var c = model.cells[cell.Value.x, cell.Value.y];
                if (!c.Movable) { Select(null); Sfx.Play(SfxKind.Invalid, 0.4f); return; }
                if (selected != null && IsAdjacent(selected.Value, cell.Value))
                {
                    StartCoroutine(DoSwap(selected.Value, cell.Value));
                    Select(null);
                    return;
                }
                dragStart = cell; dragStartWorld = world;
                Select(cell);
            }
            else if (held && dragStart != null)
            {
                Vector3 d = world - dragStartWorld;
                if (d.magnitude > CellSize * 0.35f)
                {
                    Vector2Int dir = Mathf.Abs(d.x) > Mathf.Abs(d.y) ? new Vector2Int(d.x > 0 ? 1 : -1, 0) : new Vector2Int(0, d.y > 0 ? 1 : -1);
                    Vector2Int target = dragStart.Value + dir;
                    if (model.In(target.x, target.y)) StartCoroutine(DoSwap(dragStart.Value, target));
                    dragStart = null; Select(null);
                }
            }
            else if (up && dragStart != null)
            {
                // Dokunup bırakma: güçlendiriciyse patlat
                var c = model.cells[dragStart.Value.x, dragStart.Value.y];
                if (c.Movable && c.piece.IsBooster) { StartCoroutine(DoTap(dragStart.Value)); Select(null); }
                dragStart = null;
            }
        }

        private bool IsAdjacent(Vector2Int a, Vector2Int b) { return Mathf.Abs(a.x - b.x) + Mathf.Abs(a.y - b.y) == 1; }

        private Vector2Int? CellAt(Vector3 world)
        {
            Vector3 local = boardRoot.InverseTransformPoint(world);
            int x = Mathf.RoundToInt(local.x / CellSize + (model.W - 1) * 0.5f);
            int y = Mathf.RoundToInt(local.y / CellSize + (model.H - 1) * 0.5f);
            if (!model.In(x, y) || !model.cells[x, y].exists) return null;
            return new Vector2Int(x, y);
        }

        private void Select(Vector2Int? c)
        {
            selected = c;
            selectRing.gameObject.SetActive(c != null);
            if (c != null) selectRing.transform.localPosition = CellPos(c.Value.x, c.Value.y);
        }

        public void BeginBoosterMode(InGameBooster b)
        {
            if (Busy) return;
            boosterMode = boosterMode == b ? (InGameBooster?)null : b;
            Select(null);
            listener.OnBoosterModeChanged(boosterMode);
            if (boosterMode == InGameBooster.JesterHat) StartCoroutine(ApplyBooster(InGameBooster.JesterHat, new Vector2Int(0, 0)));
        }

        public void CancelBoosterMode() { boosterMode = null; listener.OnBoosterModeChanged(null); }

        // ------------------------------------------------------------------ Tur akışı
        private IEnumerator DoSwap(Vector2Int a, Vector2Int b)
        {
            if (Busy) yield break;
            var ca = model.At(a.x, a.y); var cb = model.At(b.x, b.y);
            if (ca == null || cb == null || !ca.Movable || !cb.Movable) { Sfx.Play(SfxKind.Invalid, 0.5f); yield break; }
            Busy = true; ClearHint();
            PieceView va = views[ca.piece.id], vb = views[cb.piece.id];
            Sfx.Play(SfxKind.Swap);
            va.sr.sortingOrder = 21;
            StartCoroutine(Tween.Scale(va.transform, Vector3.one * 1.05f, 0.08f));
            StartCoroutine(Tween.Move(va.transform, CellPos(b.x, b.y), 0.16f, Ease.OutCubic));
            yield return Tween.Move(vb.transform, CellPos(a.x, a.y), 0.16f, Ease.OutCubic);
            va.sr.sortingOrder = 20;
            StartCoroutine(Tween.Scale(va.transform, Vector3.one * 0.92f, 0.08f));

            var result = model.TrySwap(a, b);
            if (result != BoardModel.SwapResult.Ok)
            {
                Sfx.Play(SfxKind.Invalid, 0.6f);
                StartCoroutine(Fx.Shake(va.transform, 0.06f, 0.16f));
                StartCoroutine(Fx.Shake(vb.transform, 0.06f, 0.16f));
                yield return Tween.Delay(0.16f);
                StartCoroutine(Tween.Move(va.transform, CellPos(a.x, a.y), 0.16f, Ease.OutCubic));
                yield return Tween.Move(vb.transform, CellPos(b.x, b.y), 0.16f, Ease.OutCubic);
                Busy = false; idleTimer = 0f;
                yield break;
            }
            listener.OnMoves(model.movesLeft);
            yield return ResolveAll();
        }

        private IEnumerator DoTap(Vector2Int p)
        {
            if (Busy) yield break;
            Busy = true; ClearHint();
            if (!model.TapBooster(p)) { Busy = false; yield break; }
            listener.OnMoves(model.movesLeft);
            yield return ResolveAll();
        }

        private IEnumerator ApplyBooster(InGameBooster b, Vector2Int cell)
        {
            if (Busy) yield break;
            if (Save.GetInGame(b) <= 0) { CancelBoosterMode(); yield break; }
            Busy = true; ClearHint();
            Save.AddInGame(b, -1);
            CancelBoosterMode();
            switch (b)
            {
                case InGameBooster.Hammer:
                    {
                        var h = Fx.Spawn(fxRoot, Art.Hammer(), CellPos(cell.x, cell.y) + new Vector3(0.5f, 0.9f, 0), Color.white, 50);
                        h.transform.localScale = Vector3.one * 1.1f;
                        float t = 0f;
                        while (t < 0.25f) { t += Time.deltaTime; h.transform.localEulerAngles = new Vector3(0, 0, Mathf.Lerp(40f, -50f, t / 0.25f)); yield return null; }
                        Destroy(h.gameObject);
                        model.UseHammer(cell);
                        Sfx.Play(SfxKind.Boom, 0.6f);
                        break;
                    }
                case InGameBooster.Arrow: model.UseArrow(cell.y); break;
                case InGameBooster.Cannon: model.UseCannon(cell.x); break;
                case InGameBooster.JesterHat:
                    model.UseJester();
                    Sfx.Play(SfxKind.Shuffle);
                    yield return AnimateShuffle();
                    model.events.Clear();
                    Busy = false; idleTimer = 0f;
                    yield break;
            }
            yield return AnimateEvents(model.events);
            yield return AnimateGravity();
            yield return ResolveAll();
        }

        /// <summary>Dalga dalga çözümleme; sonunda kazanma/kaybetme denetimi.</summary>
        private IEnumerator ResolveAll()
        {
            Busy = true;
            int guard = 0;
            while (guard++ < 200)
            {
                bool any = model.ResolveStep();
                if (!any) break;
                yield return AnimateEvents(model.events);
                yield return AnimateGravity();
            }
            if (finished) yield break;

            if (model.GoalsDone)
            {
                finished = true;
                int bonus = model.movesLeft;
                yield return BonusRound();
                listener.OnWon(bonus);
                yield break;
            }
            if (model.movesLeft <= 0)
            {
                Busy = false;
                listener.OnLost();
                yield break;
            }
            if (model.EnsureMoveExists(true))
            {
                listener.OnMessage("Hamle kalmadı, karıştırılıyor");
                Sfx.Play(SfxKind.Shuffle);
                yield return AnimateShuffle();
            }
            Busy = false; idleTimer = 0f;
        }

        /// <summary>Kaybedince devam edilirse çağrılır.</summary>
        public void AddMoves(int n)
        {
            model.movesLeft += n;
            listener.OnMoves(model.movesLeft);
            Busy = false; idleTimer = 0f;
        }

        /// <summary>Kalan hamleler güçlendiriciye dönüşüp patlar (Royal Match sonu bonusu).</summary>
        private IEnumerator BonusRound()
        {
            if (model.movesLeft > 0) listener.OnMessage("Kalan hamle bonusu!");
            yield return Tween.Delay(0.4f);
            while (model.movesLeft > 0)
            {
                model.movesLeft--;
                listener.OnMoves(model.movesLeft);
                Piece removed = model.ConvertRandomPieceToBooster();
                if (removed == null) break;
                var ev = model.events[0];
                PieceView oldView;
                if (views.TryGetValue(removed.id, out oldView) && oldView != null) { Destroy(oldView.gameObject); views.Remove(removed.id); }
                var tmp = PieceView.Create(boardRoot, ev.piece, CellPos(ev.x, ev.y));
                tmp.transform.localScale = Vector3.zero;
                Sfx.Play(SfxKind.Create, 0.7f);
                yield return Tween.Scale(tmp.transform, Vector3.one * 0.92f, 0.15f, Ease.OutBack);
                Destroy(tmp.gameObject);
                int guard = 0;
                while (guard++ < 100 && model.ResolveStep()) { yield return AnimateEvents(model.events); yield return AnimateGravity(); }
            }
            while (model.DetonateAnyBooster())
            {
                int guard = 0;
                while (guard++ < 100 && model.ResolveStep()) { yield return AnimateEvents(model.events); yield return AnimateGravity(); }
            }
            yield return Tween.Delay(0.3f);
        }

        // ------------------------------------------------------------------ Animasyon
        private IEnumerator AnimateEvents(List<BoardEvent> evs)
        {
            var handled = new HashSet<int>();
            float wait = 0.22f;
            bool boom = false, pop = false;

            // 1) güçlendirici oluşumu: taşlar merkeze toplanır
            foreach (var e in evs)
            {
                if (e.kind != EvKind.BoosterCreated || e.cells == null || e.cells.Count == 0) continue;
                Vector3 pivot = CellPos(e.x, e.y);
                foreach (var cpos in e.cells)
                {
                    foreach (var ev2 in evs)
                        if (ev2.kind == EvKind.PieceCleared && ev2.x == cpos.x && ev2.y == cpos.y && ev2.piece != null)
                        {
                            PieceView v;
                            if (views.TryGetValue(ev2.piece.id, out v) && v != null)
                            {
                                handled.Add(ev2.piece.id);
                                StartCoroutine(MergeInto(v, pivot));
                                views.Remove(ev2.piece.id);
                            }
                        }
                }
                StartCoroutine(SpawnBoosterView(e.piece, pivot, 0.16f));
                Sfx.Play(SfxKind.Create, 0.8f);
                wait = Mathf.Max(wait, 0.34f);
            }

            // 2) güçlendirici efektleri
            foreach (var e in evs)
            {
                switch (e.kind)
                {
                    case EvKind.RocketFired:
                        StartCoroutine(Fx.RocketTrail(boardRoot, CellPos(e.x, e.y), e.dir, e.dir == RocketDir.Horizontal ? model.W * 0.7f : model.H * 0.7f));
                        Sfx.Play(SfxKind.Rocket, 0.7f); wait = Mathf.Max(wait, 0.3f); break;
                    case EvKind.TntFired:
                        StartCoroutine(Fx.Ring(boardRoot, CellPos(e.x, e.y), new Color(1f, 0.6f, 0.2f, 1f), e.radius + 0.5f));
                        StartCoroutine(Fx.Burst(boardRoot, CellPos(e.x, e.y), new Color(1f, 0.5f, 0.1f, 1f), 14));
                        boom = true; wait = Mathf.Max(wait, 0.35f); break;
                    case EvKind.LightBallFired:
                        {
                            var targets = new List<Vector3>();
                            if (e.cells != null) foreach (var c in e.cells) targets.Add(CellPos(c.x, c.y));
                            StartCoroutine(Fx.Lightning(boardRoot, CellPos(e.x, e.y), targets, Art.Lighten(Art.PieceBase(e.color), 0.4f)));
                            StartCoroutine(Fx.Ring(boardRoot, CellPos(e.x, e.y), new Color(0.8f, 0.5f, 1f, 1f), 1.2f));
                            Sfx.Play(SfxKind.Whoosh); wait = Mathf.Max(wait, 0.38f); break;
                        }
                    case EvKind.PropellerFlight:
                        StartCoroutine(Fx.Fly(boardRoot, Art.Propeller(), CellPos(e.x, e.y), CellPos(e.tx, e.ty), 0.5f));
                        Sfx.Play(SfxKind.Whoosh, 0.7f); wait = Mathf.Max(wait, 0.55f); break;
                    case EvKind.BoardCleared:
                        StartCoroutine(Fx.Ring(boardRoot, CellPos(e.x, e.y), Color.white, model.W, 0.5f));
                        boom = true; wait = Mathf.Max(wait, 0.5f); break;
                }
            }
            if (boom) { Sfx.Play(SfxKind.Boom); StartCoroutine(Fx.Shake(cam.transform, 0.12f, 0.3f)); listener.OnFlash(); }

            // 3) taş, engel, çimen, zincir
            foreach (var e in evs)
            {
                switch (e.kind)
                {
                    case EvKind.PieceCleared:
                        {
                            if (e.piece == null || handled.Contains(e.piece.id)) break;
                            PieceView v;
                            if (views.TryGetValue(e.piece.id, out v) && v != null)
                            {
                                views.Remove(e.piece.id);
                                StartCoroutine(Tween.PopAndDestroy(v.gameObject));
                                StartCoroutine(Fx.Burst(boardRoot, CellPos(e.x, e.y), Art.Lighten(Art.PieceBase(e.color), 0.2f), 6));
                                pop = true;
                            }
                            break;
                        }
                    case EvKind.BlockerHit:
                        RefreshCell(e.x, e.y);
                        if (cellViews[e.x, e.y].blocker != null) StartCoroutine(Fx.Shake(cellViews[e.x, e.y].blocker.transform, 0.07f, 0.2f));
                        pop = true; break;
                    case EvKind.BlockerCleared:
                        {
                            var cv = cellViews[e.x, e.y];
                            if (cv.blocker != null) { StartCoroutine(Tween.PopAndDestroy(cv.blocker.gameObject)); cv.blocker = null; }
                            StartCoroutine(Fx.Burst(boardRoot, CellPos(e.x, e.y), new Color(0.9f, 0.8f, 0.6f, 1f), 9));
                            pop = true; break;
                        }
                    case EvKind.GrassCleared:
                        {
                            var cv = cellViews[e.x, e.y];
                            if (e.value <= 0 && cv.grass != null) { StartCoroutine(Tween.PopAndDestroy(cv.grass.gameObject, 0.22f)); cv.grass = null; }
                            else RefreshCell(e.x, e.y);
                            StartCoroutine(Fx.Burst(boardRoot, CellPos(e.x, e.y), new Color(0.5f, 0.9f, 0.4f, 1f), 6));
                            break;
                        }
                    case EvKind.ChainBroken:
                        {
                            var cv = cellViews[e.x, e.y];
                            if (cv.chain != null) { StartCoroutine(Tween.PopAndDestroy(cv.chain.gameObject, 0.2f)); cv.chain = null; }
                            break;
                        }
                    case EvKind.GoalProgress:
                        listener.OnGoal(e.goal, e.value, CellWorld(e.x, e.y));
                        break;
                    case EvKind.Shuffle:
                        break;
                }
            }
            if (pop) Sfx.Play(SfxKind.Pop);
            yield return Tween.Delay(wait);
        }

        private IEnumerator MergeInto(PieceView v, Vector3 pivot)
        {
            yield return Tween.Move(v.transform, pivot, 0.14f, Ease.InCubic);
            if (v != null) Destroy(v.gameObject);
        }

        private IEnumerator SpawnBoosterView(Piece p, Vector3 pos, float delay)
        {
            yield return Tween.Delay(delay);
            if (p == null) yield break;
            PieceView existing;
            if (views.TryGetValue(p.id, out existing) && existing != null) yield break;
            var v = PieceView.Create(boardRoot, p, pos);
            views[p.id] = v;
            v.transform.localScale = Vector3.zero;
            StartCoroutine(Fx.Ring(boardRoot, pos, Color.white, 0.9f, 0.25f));
            var tw = Fx.Spawn(boardRoot, Art.FxTwirl(), pos, new Color(1f, 0.95f, 0.7f, 0.9f), 41);
            StartCoroutine(Spin(tw, 0.4f));
            yield return Tween.Scale(v.transform, Vector3.one * 0.92f, 0.18f, Ease.OutBack);
        }

        private IEnumerator Spin(SpriteRenderer sr, float dur)
        {
            float t = 0f;
            while (t < dur && sr != null)
            {
                t += Time.deltaTime; float k = t / dur;
                sr.transform.localEulerAngles = new Vector3(0, 0, k * 240f);
                sr.transform.localScale = Vector3.one * (0.6f + k * 1.2f);
                sr.color = new Color(1f, 0.95f, 0.7f, 0.9f * (1f - k));
                yield return null;
            }
            if (sr != null) Destroy(sr.gameObject);
        }

        private IEnumerator AnimateGravity()
        {
            var moves = model.ApplyGravity();
            if (moves.Count == 0) yield break;
            float maxDur = 0f;
            foreach (var m in moves)
            {
                PieceView v;
                if (!views.TryGetValue(m.piece.id, out v) || v == null)
                {
                    v = PieceView.Create(boardRoot, m.piece, CellPos(m.fromX, m.fromY));
                    views[m.piece.id] = v;
                }
                float dist = Mathf.Abs(m.fromY - m.toY) + Mathf.Abs(m.fromX - m.toX);
                float dur = 0.12f + 0.055f * dist;
                maxDur = Mathf.Max(maxDur, dur);
                StartCoroutine(Fall(v.transform, CellPos(m.toX, m.toY), dur));
            }
            yield return Tween.Delay(maxDur + 0.05f);
            // Güvenlik: her şey yerinde mi
            SyncAll();
        }

        private IEnumerator Fall(Transform tr, Vector3 to, float dur)
        {
            yield return Tween.Move(tr, to, dur, Ease.InCubic);
            if (tr == null) yield break;
            // küçük sekme
            Vector3 s = tr.localScale;
            StartCoroutine(Tween.Scale(tr, new Vector3(s.x * 1.08f, s.y * 0.88f, 1f), 0.05f));
            yield return Tween.Delay(0.05f);
            if (tr != null) StartCoroutine(Tween.Scale(tr, s, 0.08f));
        }

        private IEnumerator AnimateShuffle()
        {
            // Taşlar merkeze toplanıp yeni yerlerine dağılır
            foreach (var kv in views) if (kv.Value != null) StartCoroutine(Tween.Move(kv.Value.transform, Vector3.zero, 0.25f, Ease.InCubic));
            yield return Tween.Delay(0.28f);
            for (int x = 0; x < model.W; x++)
                for (int y = 0; y < model.H; y++)
                {
                    var c = model.cells[x, y];
                    if (c.piece == null) continue;
                    PieceView v;
                    if (views.TryGetValue(c.piece.id, out v) && v != null) { v.Refresh(); StartCoroutine(Tween.Move(v.transform, CellPos(x, y), 0.3f, Ease.OutBack)); }
                }
            yield return Tween.Delay(0.35f);
            SyncAll();
        }

        // ------------------------------------------------------------------ İpucu
        private IEnumerator ShowHint()
        {
            var moves = model.FindMoves();
            if (moves.Count == 0) { hintRoutine = null; yield break; }
            var m = moves[Random.Range(0, moves.Count)];
            hintViews.Clear();
            foreach (var p in m)
            {
                var c = model.cells[p.x, p.y];
                PieceView v;
                if (c.piece != null && views.TryGetValue(c.piece.id, out v) && v != null) hintViews.Add(v);
            }
            float t = 0f;
            while (true)
            {
                t += Time.deltaTime;
                float s = 0.92f + Mathf.Sin(t * 6f) * 0.07f;
                foreach (var v in hintViews) if (v != null && !v.piece.IsBooster) v.transform.localScale = new Vector3(s, s, 1f);
                yield return null;
            }
        }

        private void ClearHint()
        {
            idleTimer = 0f;
            if (hintRoutine != null) { StopCoroutine(hintRoutine); hintRoutine = null; }
            foreach (var v in hintViews) if (v != null) v.transform.localScale = Vector3.one * 0.92f;
            hintViews.Clear();
        }

        /// <summary>Oyun dışı bir güçlendirici seçiliyse ipucunu durdur.</summary>
        public void Finish()
        {
            finished = true;
            ClearHint();
        }
    }
}
