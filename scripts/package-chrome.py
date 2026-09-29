"""Build the auditable preproduction-only extension ZIP (standard library only)."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1]
source = root / 'apps/chrome-extension'
manifest = json.loads((source / 'manifest.json').read_text())
assert manifest['host_permissions'] == ['https://stack32-agent-api-preprod-spxecrm6bq-ew.a.run.app/*']
assert set(manifest['permissions']) == {'activeTab', 'scripting'}
assert manifest['manifest_version'] == 3
output = root / f'apps/web/public/downloads/stack32-chrome-preprod-{manifest["version"]}.zip'
output.parent.mkdir(parents=True, exist_ok=True)
files = ['manifest.json', 'background.js', 'control.html', 'control.css', 'control.js', 'page.js', 'icons/16.png', 'icons/48.png', 'icons/128.png']
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in files:
        info = ZipInfo(name, date_time=(2026, 9, 28, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (source / name).read_bytes())
print(output)
