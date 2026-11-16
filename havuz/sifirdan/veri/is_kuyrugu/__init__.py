"""is_kuyrugu: SQLite üstünde kalıcı iş kuyruğu (en az bir kez, geri çekilme, ölü mektup, cron).

Kullanım:
    from is_kuyrugu import JobQueue, Worker
    q = JobQueue("isler.db")
    q.enqueue("eposta", {"kime": "ayse@ornek.tr"}, idempotency_key="hosgeldin-42")
    Worker(q, "isci-1", "eposta", lambda job: print(job.payload)).drain()

Genişletme: yeni genel API'yi buraya ve README'deki "Dosya haritası"na ekleyin.
"""

from .cron import Cron, CronError
from .queue import Job, JobQueue, LeaseLostError
from .worker import Worker

__all__ = ["Cron", "CronError", "Job", "JobQueue", "LeaseLostError", "Worker"]
