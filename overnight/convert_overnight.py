from pathlib import Path
import collections
import sexpdata

Instance = collections.namedtuple('Instance', 'utterance original lf')
domains = 'basketball blocks calendar housing publications recipes restaurants socialnetwork'.split()
overnight_data = Path('~/Downloads/overnightData').expanduser()


def load_ds(path):
    instances = path.open().read()
    parsed = sexpdata.loads('(' + instances + ')')
    return [ Instance(p[1][1], p[2][1], sexpdata.dumps(p[3][1]).replace("\\.", ".")) for p in parsed ]

def convert(in_path, out_path):
    ds = load_ds(in_path)
    with out_path.open('w') as f:
        for i in ds:
            f.write('\t'.join(i))
            f.write('\n')

def main():

    for domain in domains:
        test_path = overnight_data / f'{domain}.paraphrases.test.examples'
        train_path = overnight_data / f'{domain}.paraphrases.train.examples'

        out_test_path = overnight_data / f'{domain}.paraphrases.test.tsv'
        out_train_path = overnight_data / f'{domain}.paraphrases.train.tsv'

        convert(test_path, out_test_path)
        convert(train_path, out_train_path)

if __name__ == '__main__':
    main()
