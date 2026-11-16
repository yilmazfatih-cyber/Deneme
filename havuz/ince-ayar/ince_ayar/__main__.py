"""`python -m ince_ayar …` giriş noktası. Bütün iş `ince_ayar/cli.py` içindedir.

Genişletme: bu dosyaya dokunmayın; yeni görev `ince_ayar/registry.py` dosyasına eklenir.
"""

from ince_ayar.cli import main

raise SystemExit(main())
