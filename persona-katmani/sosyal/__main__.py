"""`cd persona-katmani && python3 -m sosyal ...` (-I ile çalıştırılacaksa doğrudan sosyal_cli.py kullanılır)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sosyal.sosyal_cli import main  # noqa: E402

main()
