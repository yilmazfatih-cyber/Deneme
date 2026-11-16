"""Örnek uygulamanın veri modelleri (orm ile): kullanıcılar ve notlar.

`oturum_surumu`: çıkışta artırılır; oturum çerezindeki sürüm tutmazsa çerez geçersiz sayılır.
Böylece imzalı (sunucuda saklanmayan) çerezlerde de "tüm cihazlardan çıkış" mümkün olur.
Genişletme: yeni alan → buraya ekleyin; `Database.migrate` başlangıçta sütunu kendisi ekler
(`null=True` ya da sabit `default` verin).
"""

from __future__ import annotations

import datetime

from orm import DateTimeField, ForeignKey, IntegerField, Model, Reverse, TextField


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


class Kullanici(Model):
    table = "kullanicilar"
    ad = TextField(unique=True, max_length=32)
    parola_ozeti = TextField()
    oturum_surumu = IntegerField(default=1)
    notlar = Reverse("Not", "sahip")


class Not(Model):
    table = "notlar"
    baslik = TextField(max_length=200)
    metin = TextField(default="")
    sahip = ForeignKey("Kullanici", on_delete="CASCADE")
    olusturma = DateTimeField(default=_now)
