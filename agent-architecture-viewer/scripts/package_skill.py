#!/usr/bin/env python3
"""Package only this portable skill; never discover or include project files."""
import argparse
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

FILES = ('SKILL.md', 'agents/openai.yaml', 'references/architecture-contract.md',
         'assets/example-architecture.json', 'assets/interactive-canvas.js',
         'assets/canvas-state.js', 'assets/architecture-layout.js',
         'assets/canvas-gestures.js', 'scripts/package_skill.py')

def package(output: Path) -> list[str]:
    root = Path(__file__).resolve().parents[1]
    if output.exists():
        raise FileExistsError('Архив уже существует; выберите новое имя.')
    files = []
    for name in FILES:
        source = root / name
        if source.is_symlink() or not source.is_file() or source.resolve() != root / name:
            raise ValueError('Файл навыка отсутствует или заменён ссылкой: ' + name)
        files.append((name, source))
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, 'x', compression=ZIP_DEFLATED) as archive:
        for name, source in files:
            archive.write(source, root.name + '/' + name)
    return [root.name + '/' + name for name, _ in files]

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    names = package(args.output)
    print(str(args.output))
    print('Упаковано файлов:', len(names))
