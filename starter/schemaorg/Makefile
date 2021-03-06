geniedir = ../..
developer_key =
thingpedia_cli = thingpedia
thingpedia_url = https://thingpedia.stanford.edu/thingpedia

-include ./config.mk

memsize := 15000
genie = node --experimental_worker --max_old_space_size=$(memsize) $(geniedir)/tool/genie.js

all_experiments = restaurants hotels people books movies music

experiment ?= restaurants

restaurants_class_name = org.schema.Restaurant
restaurants_white_list = Restaurant,Review
restaurants_paraphrase =

hotels_class_name = org.schema.Hotel
hotels_white_list = Hotel
hotels_paraphrase =

people_class_name = org.schema.Person
people_white_list = Person
people_paraphrase =

books_class_name = org.schema.Book
books_white_list = Book
books_paraphrase =

movies_class_name = org.schema.Movie
movies_white_list = Movie
movies_paraphrase =

music_class_name = org.schema.Music
music_white_list = MusicRecording
music_paraphrase =

eval_set ?= eval

template_file ?= thingtalk/en/thingtalk.genie
dataset_file ?= emptydataset.tt
synthetic_flags ?= \
	projection_with_filter \
	projection \
	aggregation \
	schema_org \
	filter_join \
	no_stream
generate_flags = $(foreach v,$(synthetic_flags),--set-flag $(v))

target_pruning_size ?= 500
maxdepth ?= 8

annotation ?= manual
paraphraser_options ?= --paraphraser-model ./models/paraphraser-bart-large-speedup-megabatch-5m

baseline_process_schemaorg_flags =
wikidata_process_schemaorg_flags = --wikidata-path ./wikidata-property-labels.json
bert_process_schemaorg_flags =
bart_process_schemaorg_flags =
manual_process_schemaorg_flags = --manual
manual+bart_process_schemaorg_flags = --manual

baseline_annotate_flags =
wikidata_annotate_flags =
bert_annotate_flags = --algorithms bert-property-synonyms bert-domain-synonyms bert-adjectives
bart_annotate_flags = --algorithms bart-paraphrase $(paraphraser_options)
manual_annotate_flags =
manual+bart_annotate_flags = --algorithms bart-paraphrase $(paraphraser_options)

process_schemaorg_flags ?= $($(annotation)_process_schemaorg_flags)
annotate_flags ?= $($(annotation)_annotate_flags)

model ?= 1
train_iterations ?= 100000
train_save_every ?= 2000
train_log_every ?= 100
train_nlu_flags ?= \
	--train_iterations=$(train_iterations) \
	--dimension=768 \
	--transformer_hidden=768 \
	--transformer_layers=0 \
	--rnn_layers=2 \
	--seq2seq_encoder=Identity \
	--rnn_zero_state=average \
	--context_embeddings=bert-base-uncased@0 \
	--question_embeddings=bert-base-uncased@1 \
	--trainable_encoder_embeddings=0 \
	--trainable_decoder_embeddings=25 \
	--train_context_embeddings \
	--train_context_embeddings_after=80000 \
	--decoder_embeddings= \
	--transformer_lr_multiply=0.5 \
	--train_batch_tokens=4000 \
	--val_batch_size=128
custom_train_nlu_flags ?=

.PHONY: all train evaluate
.SECONDARY:

models/paraphraser-bart-large-speedup-megabatch-5m:
	mkdir -p models
	wget --no-verbose https://almond-static.stanford.edu/test-data/paraphraser-bart-large-speedup-megabatch-5m.tar.xz
	tar -C models -xvf paraphraser-bart-large-speedup-megabatch-5m.tar.xz

common-words.txt:
	wget --no-verbose https://almond-static.stanford.edu/test-data/common-words.txt

%/schema.tt: $(geniedir)/tool/autoqa/schemaorg/process-schema.js
	$(genie) schemaorg-process-schema -o $@ $(process_schemaorg_flags) --domain $* --class-name $($(*)_class_name) --white-list $($(*)_white_list)

emptydataset.tt:
	echo 'dataset @empty {}' > $@

%/source-data.json:
	wget --no-verbose https://almond-static.stanford.edu/test-data/schemaorg-source-data/$(*).json -O $*/source-data.json

%/data.json : %/schema.tt %/source-data.json $(geniedir)/tool/autoqa/schemaorg/normalize-data.js
	$(genie) schemaorg-normalize-data --data-output $@ --thingpedia $*/schema.tt $*/source-data.json --class-name $($(*)_class_name)

%/schema.trimmed.tt : %/schema.tt %/data.json
	$(genie) schemaorg-trim-class --thingpedia $*/schema.tt -o $@ --data ./$*/data.json --entities $*/entities.json --domain $*

%/constants.tsv: %/parameter-datasets.tsv %/schema.trimmed.tt
	$(genie) sample-constants -o $@ --parameter-datasets $*/parameter-datasets.tsv --thingpedia $*/schema.trimmed.tt --devices $($(*)_class_name)
	cat $(geniedir)/data/en-US/constants.tsv >> $@

%/manifest.tt: %/constants.tsv %/schema.trimmed.tt %/parameter-datasets.tsv models/paraphraser-bart-large-speedup-megabatch-5m common-words.txt
	$(genie) auto-annotate -o $@.tmp --constants $*/constants.tsv --thingpedia $*/schema.trimmed.tt --functions $($(*)_white_list) $(annotate_flags) --parameter-datasets $*/parameter-datasets.tsv --dataset schemaorg
	mv $@.tmp $@

multidomain/manifest.tt: $(addsuffix /manifest.tt,$(all_experiments))
	cat $^ > $@

%/synthetic.tsv: %/manifest.tt $(dataset_file) $(geniedir)/languages/thingtalk/en/*.genie
	$(genie) generate \
	  --template $(geniedir)/languages/$(template_file) \
	  --thingpedia $*/manifest.tt --entities $*/entities.json --dataset $(dataset_file) \
	  --target-pruning-size $(target_pruning_size) \
	  -o $@.tmp --no-debug $(generate_flags) --maxdepth $(maxdepth) \
	  --random-seed $@ --id-prefix $*:
	mv $@.tmp $@

shared-parameter-datasets.tsv:
	$(thingpedia_cli) --url $(thingpedia_url) --developer-key $(developer_key) --access-token invalid \
	  download-entity-values --manifest $@ --append-manifest -d shared-parameter-datasets
	$(thingpedia_cli) --url $(thingpedia_url) --developer-key $(developer_key) --access-token invalid \
	  download-string-values --manifest $@ --append-manifest -d shared-parameter-datasets

%/parameter-datasets.tsv : %/schema.trimmed.tt %/data.json shared-parameter-datasets.tsv
	sed -e "s|$(echo -e '\t')shared-parameter-datasets|$(echo -e '\t')../shared-parameter-datasets|g" shared-parameter-datasets.tsv > $@
	$(genie) make-string-datasets --manifest $@.local -d $*/parameter-datasets --thingpedia $*/schema.trimmed.tt --data $*/data.json --class-name $($(*)_class_name) --dataset schemaorg
	cat $@.local >> $@
	rm $@.local

%/augmented.tsv : %/synthetic.tsv %/parameter-datasets.tsv
	$(genie) augment -o $@.tmp -l en-US --thingpedia $*/manifest.tt --parameter-datasets $*/parameter-datasets.tsv \
	  --synthetic-expand-factor 1 --quoted-paraphrasing-expand-factor 60 --no-quote-paraphrasing-expand-factor 20 --quoted-fraction 0.0 \
	  --debug $($(*)_paraphrase) $*/synthetic.tsv
	mv $@.tmp $@

multidomain/augmented.tsv: $(addsuffix /augmented.tsv,$(all_experiments))
	cat $^ > $@

multidomain/${eval_set}/annotated.tsv: $(addsuffix /${eval_set}/annotated.tsv,$(all_experiments))
	cat $^ > $@

datadir: $(experiment)/augmented.tsv $(experiment)/${eval_set}/annotated.tsv
	mkdir -p $@
	if test -s $(experiment)/${eval_set}/annotated.tsv ; then \
	  cp $(experiment)/augmented.tsv $@/train.tsv ; \
	  cut -f1-3 $(experiment)/${eval_set}/annotated.tsv > $@/eval.tsv ; \
	else \
	  $(genie) split-train-eval --train $@/train.tsv --eval $@/eval.tsv \
	    --eval-probability 0.1 --split-strategy sentence \
	    --eval-on-synthetic $(experiment)/augmented.tsv ; \
	    cp $@/eval.tsv $(experiment)/${eval_set}/annotated.tsv; \
	fi
	touch $@

train:
	mkdir -p $(experiment)/models/$(model)
	-rm datadir/almond
	ln -sf . datadir/almond
	genienlp train \
	  --no_commit \
	  --data datadir \
	  --embeddings .embeddings \
	  --save $(experiment)/models/$(model) \
	  --tensorboard_dir $(experiment)/models/$(model) \
	  --cache datadir/.cache \
	  --train_tasks almond \
	  --preserve_case \
	  --save_every $(train_save_every) \
	  --log_every $(train_log_every) \
	  --val_every $(train_save_every) \
	  --exist_ok \
	  --skip_cache \
	  $(train_nlu_flags) \
	  $(custom_train_nlu_flags)

evaluate: $(experiment)/$(eval_set)/annotated.tsv $(experiment)/manifest.tt
	$(genie) evaluate-server --url "file://$(abspath $(experiment)/models/$(model))" --thingpedia $(experiment)/manifest.tt $(experiment)/$(eval_set)/annotated.tsv --debug --csv-prefix $(eval_set) --csv $(evalflags) --min-complexity 1 --max-complexity 3 -o $(experiment)/$(eval_set)/$(model).results.tmp | tee $(experiment)/$(eval_set)/$(model).debug
	mv $(experiment)/$(eval_set)/$(model).results.tmp $(experiment)/$(eval_set)/$(model).results

clean:
	rm -rf datadir bert-canonical-annotator-in.json bert-canonical-annotator-out.json gpt2-paraphraser-in.tsv gpt2-paraphraser-out.json synthetic-test.tsv
	rm -rf multidomain/manifest.tt multidomain/augmented.tsv
	for exp in $(all_experiments) ; do \
		rm -rf $$exp/synthetic* $$exp/data.json $$exp/entities.json $$exp/parameter-datasets* $$exp/schema.tt $$exp/manifest.tt $$exp/schema.trimmed.tt $$exp/augmented.tsv $$exp/constants.tsv ; \
	done
