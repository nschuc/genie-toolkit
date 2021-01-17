import subprocess
import json
import random
import typer
from pathlib import Path
from typing import Optional, List
import flatten
import tqdm
import itertools

run_args = [
    "--locale",
    "en-US",
    "--template",
    "languages-dist/thingtalk/en/sempre.genie",
    "--thingpedia",
    "tutorial/overnight.tt",
    "--dataset",
    "tutorial/emptydataset.tt",
    "--entities",
    "tutorial/entities.json",
    "--target-pruning-size",
    "500",
]


def sample_random_utterance():
    process = subprocess.Popen(
        ["node", "dist/tool/genie.js", "partial-completions", *run_args],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
    )

    candidate = "NT[$root]"

    while True:
        # Send
        req = dict(derivation=candidate)
        process.stdin.write(json.dumps(req).encode("utf-8"))
        process.stdin.flush()

        # Recv
        stdout_data = process.stdout.readline()
        resp = json.loads(stdout_data.decode())
        candidates = resp["candidates"]

        if not candidates:
            print("Fully expanded!")
            return

        candidate = random.choice(candidates)
        print(candidate)


class PartialDerivationSampler:
    def __init__(self):
        self.proc = subprocess.Popen(
            ["node", "dist/tool/genie.js", "partial-completions", *run_args],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
        )

    def next_step_candidates(self, derivation) -> List[str]:
        # Send
        req = dict(derivation=derivation)
        self.proc.stdin.write(json.dumps(req).encode("utf-8"))
        self.proc.stdin.flush()

        # Recv
        stdout_data = self.proc.stdout.readline()
        resp = json.loads(stdout_data.decode())
        candidates = resp["candidates"] if "candidates" in resp else []
        return candidates


def run_genie():
    process = subprocess.Popen(
        [
            "node",
            "dist/tool/genie.js",
            "generate",
            "-o",
            "tutorial/synthesized.tsv",
            "--save-history",
            *run_args,
        ],
    )
    process.wait()


def load_dataset(path: Path):
    ds = flatten.load_flattened(path)
    flattened_ds = []

    for line in tqdm.tqdm(ds):
        flat = list(zip(itertools.repeat(line.canonical), line.flattened()))
        flattened_ds.extend(flat)

    return flattened_ds


def main(path: Optional[Path] = None, build_ds: bool = False):
    if build_ds:
        run_genie()

    if path and path.exists():
        flat_ds = load_dataset(path)
        print(f"there are {len(flat_ds)} partial derivations")

        ds_neg = []
        ds_pos = []
        neg = PartialDerivationSampler()
        for idx, sample in enumerate(tqdm.tqdm(flat_ds, desc="Sampling negatives from grammar")):
            canonical, flat = sample
            candidates = neg.next_step_candidates(flat)
            if candidates:
                negative = random.choice(candidates)
                positive = flat_ds[idx+1][1]

                ds_neg.append((canonical, ' '.join(flat), ' '.join(negative)))
                ds_pos.append((canonical, ' '.join(flat), ' '.join(positive)))

        pos_file = path.parent / "partials.pos.tsv"
        neg_file = path.parent / "partials.neg.tsv"

        with pos_file.open('w') as f:
            for line in ds_pos:
                f.write('\t'.join(line) + '\n')

        with neg_file.open('w') as f:
            for line in ds_neg:
                f.write('\t'.join(line) + '\n')

if __name__ == "__main__":
    typer.run(main)
