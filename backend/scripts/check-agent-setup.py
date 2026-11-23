"""Validate checked-in agent links and metadata without network or app startup."""
from pathlib import Path
import re
import tomllib

root = Path(__file__).resolve().parents[2]
count = 0
for base in (root / '.agents', root / '.codex', root / 'backend/.agents', root / 'backend/.codex', root / 'frontend/.agents', root / 'frontend/.codex'):
    for path in base.rglob('*'):
        if path.is_symlink():
            assert path.exists(), f'Broken link: {path.relative_to(root)}'
            assert path.resolve().is_relative_to(root), f'External link: {path.relative_to(root)}'
        if path.suffix == '.toml':
            tomllib.loads(path.read_text())
            count += 1
        if path.name == 'SKILL.md':
            text = path.read_text()
            assert text.startswith('---\n') and re.search(r'^name: .+', text, re.M) and re.search(r'^description: .+', text, re.M), f'Invalid skill metadata: {path.relative_to(root)}'
            count += 1
print(f'PASS: agent links and {count} metadata files')
