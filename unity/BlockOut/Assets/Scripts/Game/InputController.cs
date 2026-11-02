using BlockOut.Core;
using UnityEngine;
using UnityEngine.EventSystems;

namespace BlockOut.Game
{
    /// <summary>
    /// Dokunma/fare ile blok sürükleme. Blok parmağı izler; hedef hücreye doğru adım adım kayar,
    /// engele çarpınca durur, kenardan öteye itilince uygun kapıdan çıkar.
    /// </summary>
    public class InputController : MonoBehaviour
    {
        public Camera Cam;
        public BoardView BoardView;
        public GameManager Game;

        Block dragging;
        Vector3 startPoint;
        Vector2Int startOffset;
        readonly Plane plane = new Plane(Vector3.up, new Vector3(0f, 0.3f, 0f));

        void Update()
        {
            if (Cam == null || Game == null || Game.Board == null) return;

            if (Input.GetMouseButtonDown(0))
            {
                if (IsOverUi()) return;
                Vector3 p;
                Block b = PickBlock(Input.mousePosition, out p);
                if (b == null) return;
                if (Game.HammerMode)
                {
                    Game.UseHammer(b);
                    return;
                }
                if (!Game.Running) return;
                dragging = b;
                startPoint = p;
                startOffset = b.Offset;
                Game.BeginDrag(b);
            }
            else if (Input.GetMouseButton(0) && dragging != null)
            {
                Vector3 p;
                if (!PlanePoint(Input.mousePosition, out p)) return;
                Vector3 delta = p - startPoint;
                Vector2Int target = startOffset + new Vector2Int(Mathf.RoundToInt(delta.x), Mathf.RoundToInt(-delta.z));
                Follow(target);
            }
            else if (Input.GetMouseButtonUp(0) && dragging != null)
            {
                dragging = null;
                Game.EndDrag();
            }
        }

        /// <summary>Bloğu hedef kaydırmaya doğru, önce büyük eksende olmak üzere adım adım götürür.</summary>
        void Follow(Vector2Int target)
        {
            for (int i = 0; i < 12 && dragging != null; i++)
            {
                Vector2Int diff = target - dragging.Offset;
                if (diff == Vector2Int.zero) break;
                bool xFirst = Mathf.Abs(diff.x) >= Mathf.Abs(diff.y);
                StepResult r = StepResult.Blocked;
                if (xFirst && diff.x != 0) r = Step(diff.x > 0 ? Dir.Right : Dir.Left);
                if (r == StepResult.Blocked && diff.y != 0) r = Step(diff.y > 0 ? Dir.Down : Dir.Up);
                if (r == StepResult.Blocked && !xFirst && diff.x != 0) r = Step(diff.x > 0 ? Dir.Right : Dir.Left);
                if (r == StepResult.Blocked) break;
            }
        }

        StepResult Step(Dir d)
        {
            StepResult r = Game.TryStep(dragging, d);
            if (r == StepResult.Exited)
            {
                dragging = null;
                Game.EndDrag();
            }
            return r;
        }

        Block PickBlock(Vector3 screenPos, out Vector3 planePoint)
        {
            planePoint = Vector3.zero;
            Ray ray = Cam.ScreenPointToRay(screenPos);
            RaycastHit hit;
            if (!Physics.Raycast(ray, out hit, 200f)) return null;
            BlockView v = hit.collider.GetComponentInParent<BlockView>();
            if (v == null || v.Block == null) return null;
            PlanePoint(screenPos, out planePoint);
            return v.Block;
        }

        bool PlanePoint(Vector3 screenPos, out Vector3 point)
        {
            Ray ray = Cam.ScreenPointToRay(screenPos);
            float enter;
            if (plane.Raycast(ray, out enter))
            {
                point = ray.GetPoint(enter);
                return true;
            }
            point = Vector3.zero;
            return false;
        }

        static bool IsOverUi()
        {
            if (EventSystem.current == null) return false;
            if (Input.touchCount > 0) return EventSystem.current.IsPointerOverGameObject(Input.GetTouch(0).fingerId);
            return EventSystem.current.IsPointerOverGameObject();
        }
    }
}
