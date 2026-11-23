"""`python -m goruntu …` giriş noktası. Bütün iş `goruntu/cli.py` içindedir.

Genişletme: bu dosyaya dokunmayın; yeni komut `goruntu/commands.py` dosyasına eklenir.
"""

from goruntu.cli import main

raise SystemExit(main())
