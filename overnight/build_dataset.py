import subprocess
import json
import random
import typer
from pathlib import Path
from typing import Optional, List
import flatten
import tqdm
import itertools

class PartialDerivationSampler:
    def __init__(self, args: List[str]):
        self.proc = subprocess.Popen(
            [
                "node",
                "dist/tool/genie.js",
                "partial-completions",
                *args
            ],
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


def rebuild_dataset(genie_args: List[str]):
    process = subprocess.Popen(
        [
            "node",
            "dist/tool/genie.js",
            "generate",
            "-o",
            "overnight/synthesized.tsv",
            "--save-history",
            *genie_args,
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


def main(
    synth_path: Optional[Path] = None,
    validate: bool = False,
    sample_negatives: bool = False,
    genie_args: str = "",
):
    output_path = Path(__file__).parent / "guided-dataset.jsonl"

    neg_sampler = PartialDerivationSampler(genie_args.split())

    if sample_negatives and synth_path and synth_path.exists():
        flat_ds = load_dataset(synth_path)
        print(f"there are {len(flat_ds)} partial derivations")

        samples = []
        for idx, sample in enumerate(
            tqdm.tqdm(flat_ds, desc="Sampling negatives from grammar")
        ):
            canonical, flat = sample
            candidates = neg_sampler.next_step_candidates(flat)
            if candidates:
                negative = random.choice(candidates)
                positive = flat_ds[idx + 1][1]

                samples.append(dict(canonical=canonical, pos=" ".join(positive), neg=" ".join(negative)))

        output_path = Path(__file__).parent / "guided-dataset.jsonl"

        with output_path.open("w") as f:
            for line in samples:
                f.write(json.dumps(line) + "\n")

        print(f"Wrote dataset to {output_path}")

    if validate:
        with output_path.open("r") as f:
            for line in f.readlines():
                d = json.loads(line)
                utt = d['pos'].split()
                candidates = neg_sampler.next_step_candidates(utt)

                if not candidates:
                    print(d['canonical'])
                    print(d['pos'])


if __name__ == "__main__":
    typer.run(main)
