import csv
from typing import NamedTuple, List, Dict
from types import SimpleNamespace
from pathlib import Path
import json

def build_utterance(derivation: List[Dict[str, str]]):
    for d in derivation:
        if 'nonTerminal' in d and d['nonTerminal']:
            yield f"NT[{d['nonTerminal']}]"
        elif 'terminal' in d:
            yield d['terminal']

class Example(NamedTuple):
    id: str
    canonical: str
    program: str
    derivation: str

    def flattened(self) -> str:
        tree = json.loads(self.derivation)
        sentences = []
        queue = [[tree]]
        while queue:
            deriv = queue.pop()
            yield list(t for t in build_utterance(deriv) if t)
            for index, child in enumerate(deriv):
                if 'children' in child:
                    queue.append(deriv[:index] + child['children'] + deriv[index+1:])
                    break

def load_flattened(path: Path) -> List[Example]:
    tsv_file = path.open()
    read_tsv = csv.reader(tsv_file, delimiter="\t")
    examples = [ Example(*row) for row in read_tsv ]
    return examples

