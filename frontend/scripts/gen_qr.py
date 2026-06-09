import sys, subprocess
from pathlib import Path
p = Path(__file__).resolve().parent.parent
url_file = p / 'expo-url.txt'
if not url_file.exists():
    print('expo-url.txt not found', file=sys.stderr); sys.exit(2)
url = url_file.read_text().strip().split('=',1)[1]
try:
    import qrcode
except Exception:
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--user', 'qrcode', 'pillow'])
    import qrcode
img = qrcode.make(url)
out = p / 'expo-qr.png'
img.save(out)
print('WROTE', out, '->', url)
