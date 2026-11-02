using UnityEngine;
using UnityEngine.UI;

namespace RoyalMatch
{
    public class RoomTask { public string name; public string kind; public Vector2 pos; public float scale; }
    public class RoomDef { public string name; public RoomTask[] tasks; }

    /// <summary>Şato odaları: her görev 1 yıldız, 3 stil seçeneği (Royal Match dekorasyon döngüsü).</summary>
    public static class Rooms
    {
        private static RoomDef[] defs;

        public static RoomDef[] All
        {
            get
            {
                if (defs != null) return defs;
                defs = new[]
                {
                    new RoomDef { name = "Kral Salonu", tasks = new[] {
                        T("Halı", "carpet", 0.5f, 0.2f, 2.4f), T("Kanepe", "sofa", 0.5f, 0.33f, 1.9f), T("Tablo", "painting", 0.72f, 0.72f, 1.3f),
                        T("Lamba", "lamp", 0.14f, 0.42f, 1.3f), T("Bitki", "plant", 0.88f, 0.4f, 1.3f) } },
                    new RoomDef { name = "Yatak Odası", tasks = new[] {
                        T("Yatak", "bed", 0.5f, 0.3f, 2.2f), T("Halı", "carpet", 0.5f, 0.14f, 1.8f), T("Kitaplık", "bookshelf", 0.14f, 0.5f, 1.5f),
                        T("Lamba", "lamp", 0.86f, 0.42f, 1.2f), T("Tablo", "painting", 0.5f, 0.78f, 1.2f) } },
                    new RoomDef { name = "Kraliyet Bahçesi", tasks = new[] {
                        T("Çeşme", "fountain", 0.5f, 0.32f, 2.2f), T("Bank", "bench", 0.2f, 0.26f, 1.5f), T("Bank", "bench", 0.8f, 0.26f, 1.5f),
                        T("Çiçek", "plant", 0.14f, 0.55f, 1.3f), T("Çiçek", "plant", 0.86f, 0.55f, 1.3f) } },
                    new RoomDef { name = "Kütüphane", tasks = new[] {
                        T("Kitaplık", "bookshelf", 0.2f, 0.52f, 1.7f), T("Kitaplık", "bookshelf", 0.8f, 0.52f, 1.7f), T("Masa", "table", 0.5f, 0.28f, 1.8f),
                        T("Lamba", "lamp", 0.5f, 0.6f, 1.1f), T("Halı", "carpet", 0.5f, 0.12f, 2.0f) } },
                    new RoomDef { name = "Yemek Salonu", tasks = new[] {
                        T("Masa", "table", 0.5f, 0.3f, 2.4f), T("Tablo", "painting", 0.25f, 0.75f, 1.2f), T("Tablo", "painting", 0.75f, 0.75f, 1.2f),
                        T("Bitki", "plant", 0.1f, 0.4f, 1.3f), T("Halı", "carpet", 0.5f, 0.12f, 2.2f) } },
                    new RoomDef { name = "Taht Odası", tasks = new[] {
                        T("Halı", "carpet", 0.5f, 0.16f, 2.6f), T("Taht", "sofa", 0.5f, 0.42f, 1.6f), T("Lamba", "lamp", 0.16f, 0.5f, 1.4f),
                        T("Lamba", "lamp", 0.84f, 0.5f, 1.4f), T("Tablo", "painting", 0.5f, 0.8f, 1.4f) } },
                };
                return defs;
            }
        }

        private static RoomTask T(string n, string k, float x, float y, float s) { return new RoomTask { name = n, kind = k, pos = new Vector2(x, y), scale = s }; }

        public static RoomDef Get(int index) { return All[index % All.Length]; }

        public static int Choice(int task)
        {
            var l = Save.Data.taskChoices;
            return task < l.Count ? l[task] : -1;
        }

        public static void SetChoice(int task, int style)
        {
            var l = Save.Data.taskChoices;
            while (l.Count <= task) l.Add(-1);
            l[task] = style;
            Save.Store();
        }

        public static bool RoomComplete(int index)
        {
            var r = Get(index);
            for (int i = 0; i < r.tasks.Length; i++) if (Choice(i) < 0) return false;
            return true;
        }
    }

    public static class RoomScreen
    {
        public static void Build(RectTransform parent)
        {
            var root = Ui.Node(parent, "Rooms");
            Ui.Stretch(root);
            var d = Save.Data;
            var room = Rooms.Get(d.roomIndex);

            var bgFill = Ui.Img(root, Art.White(), Art.Hex("#1D2B53"), Vector2.zero, Vector2.zero, null, false, "Fill");
            Ui.Stretch(bgFill.rectTransform);

            // Oda görüntüsü (kare, üstte)
            var area = Ui.Img(root, Art.RoomBackdrop(d.roomIndex), Color.white, new Vector2(1080f, 1080f), new Vector2(0f, -150f), new Vector2(0.5f, 1f), false, "Room");
            area.preserveAspect = false;
            for (int i = 0; i < room.tasks.Length; i++)
            {
                var t = room.tasks[i];
                int style = Rooms.Choice(i);
                Vector2 pos = new Vector2((t.pos.x - 0.5f) * 1080f, (t.pos.y - 0.5f) * 1080f);
                float size = 128f * t.scale;
                if (style >= 0) Ui.Img(area.rectTransform, Art.Furniture(t.kind, style), Color.white, new Vector2(size, size), pos);
                else Ui.Img(area.rectTransform, Art.FurnitureGhost(t.kind), new Color(1f, 1f, 1f, 0.55f), new Vector2(size * 0.6f, size * 0.6f), pos);
            }

            // Üst şerit
            Ui.IconBtn(root, Art.Back(), Art.Hex("#2F6FD0"), 120f, new Vector2(30f, -30f), () => GameManager.I.ShowMap(), new Vector2(0f, 1f));
            Ui.Pill(root, Art.StarIcon(), d.stars.ToString(), new Vector2(-30f, -40f), new Vector2(280f, 90f), new Vector2(1f, 1f));
            var title = Ui.Panel(root, Art.Hex("#F7E7C6"), new Vector2(520f, 100f), new Vector2(0f, -40f), new Vector2(0.5f, 1f));
            Ui.Txt(title.rectTransform, room.name, 44, Art.Hex("#2B1B10"), Vector2.zero, new Vector2(500f, 100f), null, TextAnchor.MiddleCenter, false);
            Ui.Txt(root, "Oda " + (d.completedRooms + 1), 30, Color.white, new Vector2(0f, -150f), new Vector2(400f, 40f), new Vector2(0.5f, 1f));

            // Görev listesi
            float y = 560f;
            for (int i = 0; i < room.tasks.Length; i++)
            {
                int idx = i;
                var t = room.tasks[i];
                bool done = Rooms.Choice(i) >= 0;
                var row = Ui.Panel(root, done ? Art.Hex("#CFE8C9") : Art.Hex("#F7E7C6"), new Vector2(900f, 96f), new Vector2(0f, y), new Vector2(0.5f, 0f), true);
                Ui.Img(row.rectTransform, done ? Art.Furniture(t.kind, Rooms.Choice(i)) : Art.FurnitureGhost(t.kind), done ? Color.white : Art.Hex("#8B5A2B"), new Vector2(80f, 80f), new Vector2(16f, 0f), new Vector2(0f, 0.5f));
                Ui.Txt(row.rectTransform, t.name, 36, Art.Hex("#2B1B10"), new Vector2(110f, 0f), new Vector2(400f, 90f), new Vector2(0f, 0.5f), TextAnchor.MiddleLeft, false);
                if (done)
                    Ui.Img(row.rectTransform, Art.Check(), Art.Hex("#2A8A2A"), new Vector2(64f, 64f), new Vector2(-30f, 0f), new Vector2(1f, 0.5f));
                else
                {
                    var b = Ui.Btn(row.rectTransform, "1", d.stars >= 1 ? Art.GreenBtn : Art.Hex("#8A94A6"), new Vector2(170f, 74f), new Vector2(-16f, 0f), () =>
                    {
                        if (Save.Data.stars < 1) { Sfx.Play(SfxKind.Invalid); return; }
                        ShowChoice(root, idx, t);
                    }, new Vector2(1f, 0.5f), 36);
                    Ui.Img(b.transform, Art.StarIcon(), Color.white, new Vector2(44f, 44f), new Vector2(-40f, 4f));
                }
                y -= 106f;
            }

            if (Rooms.RoomComplete(d.roomIndex))
            {
                var p = Ui.Popup(root, "ODA TAMAMLANDI!", new Vector2(760f, 640f), Art.Hex("#4CC94A"));
                Ui.Img(p, Art.Trophy(), Color.white, new Vector2(220f, 220f), new Vector2(0f, 90f));
                Ui.Txt(p, room.name + " hazır. Kral çok memnun!", 38, Art.Hex("#2B1B10"), new Vector2(0f, -70f), new Vector2(640f, 60f), null, TextAnchor.MiddleCenter, false);
                Ui.Btn(p, "SONRAKİ ODA", Art.GreenBtn, new Vector2(460f, 120f), new Vector2(0f, -200f), () =>
                {
                    d.roomIndex++; d.completedRooms++; d.taskChoices.Clear(); Save.Store();
                    GameManager.I.ShowRooms();
                });
                Sfx.Play(SfxKind.Win);
            }
        }

        private static void ShowChoice(RectTransform root, int taskIndex, RoomTask t)
        {
            var p = Ui.Popup(root, t.name.ToUpper(new System.Globalization.CultureInfo("tr-TR")) + " SEÇ", new Vector2(900f, 640f));
            Ui.CloseButton(p);
            for (int s = 0; s < 3; s++)
            {
                int style = s;
                float x = (s - 1) * 270f;
                var slot = Ui.Panel(p, Art.Hex("#FFF3D6"), new Vector2(240f, 300f), new Vector2(x, -10f), null, true);
                Ui.Img(slot.rectTransform, Art.Furniture(t.kind, style), Color.white, new Vector2(200f, 200f), new Vector2(0f, 30f));
                Ui.Btn(slot.rectTransform, "Seç", Art.GreenBtn, new Vector2(180f, 70f), new Vector2(0f, -100f), () =>
                {
                    if (Save.Data.stars < 1) return;
                    Save.Data.stars--; Save.Store();
                    Rooms.SetChoice(taskIndex, style);
                    Sfx.Play(SfxKind.Star);
                    GameManager.I.ShowRooms();
                }, null, 34);
            }
        }
    }
}
