genie_path=../
genie generate --locale en-US --template ${genie_path}/languages/thingtalk/en/sempre.genie \
  --thingpedia overnight.tt --dataset emptydataset.tt --entities entities.json -o synthesized.tsv "$@"
