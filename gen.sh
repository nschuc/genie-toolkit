genie compile-template languages/thingtalk/en/overnight.genie \
  && tsc --build languages/tsconfig.json \
  && genie generate -o overnight/synthesized.tsv \
        --template languages-dist/thingtalk/en/overnight.genie \
        --locale en-US \
        --thingpedia overnight/overnight.tt \
        --dataset overnight/emptydataset.tt \
        --entities overnight/entities.json \
        $@
