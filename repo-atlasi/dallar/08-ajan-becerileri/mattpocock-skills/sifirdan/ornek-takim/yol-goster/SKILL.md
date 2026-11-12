---
name: yol-goster
description: Hangi becerinin ya da akışın durumuna uyduğunu söyleyen yönlendirici.
disable-model-invocation: true
---

Kullanıcının durumunu dinle ve ona uygun komutu öner. Bu becerinin işi önermek; becerileri kendisi çağırmaz.

| Durum                                   | Öneri               |
| --------------------------------------- | ------------------- |
| Depoda ilk kez çalışıyorsun             | `/kurulum`          |
| Bir planın var, sınamak istiyorsun      | `/beni-sorgula`     |
| Sınarken sözlük ve kararlar da yazılsın | `/belgeyle-sorgula` |
| Plan hazır, koda dökülecek              | `/uygula`           |
