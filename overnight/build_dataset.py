import subprocess
import json
import random
import typer
from pathlib import Path
from typing import Optional, List, Dict
import csv
import tqdm
import itertools
import sklearn.model_selection


class PartialDerivationSampler:
    def __init__(self, args: List[str]):
        self.proc = subprocess.Popen(
            ["node", "dist/tool/genie.js", "partial-completions", *args],
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


def to_utter(derivation: List[Dict[str, str]]):
    for d in derivation:
        if isinstance(d, dict):
            id = d.get("id")
            if id:
                yield f"NT[{id}]"
        else:
            yield d


def flatten(derivation):
    if not isinstance(derivation, list):
        deriv = list(derivation)
    else:
        deriv = derivation

    yield list(t for t in to_utter(deriv) if t)

    try:
        index, child = next(
            (
                (i, c)
                for i, c in enumerate(deriv)
                if isinstance(c, dict) and "children" in c
            )
        )
        yield from flatten(deriv[:index] + child["children"] + deriv[index + 1 :])
    except StopIteration:
        pass


def convert_to_flat(rows: List[List[str]]):
    flattened_ds = []

    for row in tqdm.tqdm(rows):
        _, canonical, _, deriv_str = row
        derivation = json.loads(deriv_str)
        flat = list(zip(itertools.repeat(canonical), flatten([derivation])))
        flattened_ds.extend(flat)

    return flattened_ds


def run_sample_negatives(grammar, partials):
    samples = []
    for idx, sample in enumerate(tqdm.tqdm(partials, desc="sampling negatives")):
        canonical, flat = sample
        candidates = grammar.next_step_candidates(flat)
        if candidates:
            negative = random.choice(candidates)
            positive = partials[idx + 1][1]
            samples.append(dict(utter=canonical, deriv=" ".join(positive), label=1))
            samples.append(dict(utter=canonical, deriv=" ".join(negative), label=0))

    return samples


def main(
    synth_path: Optional[Path] = None,
    output_dir: Path = Path(__file__).parent,
    validate: bool = False,
    sample_negatives: bool = False,
    genie_args: str = "",
):
    grammar = PartialDerivationSampler(genie_args.split())

    if sample_negatives and synth_path and synth_path.exists():

        with synth_path.open() as tsv_file:
            rows = list(csv.reader(tsv_file, delimiter="\t"))

        train, val = sklearn.model_selection.train_test_split(rows, test_size=0.2, shuffle=True)

        for split, rows in dict(train=train, val=val).items():
            flat_ds = convert_to_flat(rows)
            samples = run_sample_negatives(grammar, flat_ds)

            out_path = output_dir / f"guided-dataset.{split}.jsonl"

            with out_path.open("w") as f:
                f.writelines(json.dumps(line) + "\n" for line in samples)

        print(f"Wrote dataset to {output_dir}")

    if validate:
        with output_path.open("r") as f:
            for line in f.readlines():
                d = json.loads(line)
                utt = d["pos"].split()
                candidates = grammar.next_step_candidates(utt)

                if not candidates:
                    print(d["canonical"])
                    print(d["pos"])


if __name__ == "__main__":
    typer.run(main)
