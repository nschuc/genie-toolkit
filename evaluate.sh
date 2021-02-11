schemaorg_args="--template languages-dist/thingtalk/en/thingtalk.genie --set-flag projection_with_filter --set-flag projection --set-flag aggregation --set-flag schema_org --set-flag filter_join --set-flag no_stream --thingpedia starter/schemaorg/restaurants/manifest.tt --entities starter/schemaorg/restaurants/entities.json --dataset starter/schemaorg/emptydataset.tt"

echo $schemaorg_args
python overnight/build_dataset.py --evaluate --eval-path ../schema2qa/restaurants/eval/annotated.tsv --genie-args "$schemaorg_args" $@
