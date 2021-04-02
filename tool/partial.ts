// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Genie
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import * as argparse from 'argparse';
import seedrandom from 'seedrandom';
import * as ThingTalk from 'thingtalk';
import * as Tp from 'thingpedia';

import SentenceGenerator, { SentenceGeneratorOptions } from "../lib/sentence-generator/generator";
import { ActionSetFlag } from './lib/argutils';
import JsonDatagramSocket from '../lib/utils/json_datagram_socket';
import * as Utils from '../lib/utils/entity-utils';
import { ThingTalkUtils } from '../lib';

export function initArgparse(subparsers : argparse.SubParser) {
    const parser = subparsers.add_parser("partial-completions", {
      add_help: true,
      description: "Generate a new synthetic dataset, given a template file.",
    });
    parser.add_argument("-l", "--locale", {
      required: false,
      default: "en-US",
      help: `BGP 47 locale tag of the language to generate (defaults to 'en-US', English)`,
    });
    parser.add_argument("--thingpedia", {
      required: false,
      help: "Path to ThingTalk file containing class definitions.",
    });
    parser.add_argument("--entities", {
      required: false,
      help: "Path to JSON file containing entity type definitions.",
    });
    parser.add_argument("--dataset", {
      required: false,
      help: "Path to file containing primitive templates, in ThingTalk syntax.",
    });
    parser.add_argument("--template", {
      required: true,
      nargs: "+",
      help: "Path to file containing construct templates, in Genie syntax.",
    });
    parser.add_argument("--set-flag", {
      required: false,
      nargs: 1,
      action: ActionSetFlag,
      const: true,
      metavar: "FLAG",
      help: "Set a flag for the construct template file.",
    });
    parser.add_argument("--unset-flag", {
      required: false,
      nargs: 1,
      action: ActionSetFlag,
      const: false,
      metavar: "FLAG",
      help: "Unset (clear) a flag for the construct template file.",
    });
    parser.add_argument("--maxdepth", {
      required: false,
      type: Number,
      default: 5,
      help: "Maximum depth of sentence generation",
    });
    parser.add_argument("--target-pruning-size", {
      required: false,
      type: Number,
      default: 100000,
      help:
        "Approximate target size of the generate dataset, for each $root rule and each depth",
    });

    parser.add_argument("--debug", {
      nargs: "?",
      const: 1,
      default: 0,
      help:
        "Enable debugging. Can be specified with an argument between 0 and 5 to choose the verbosity level.",
    });
    parser.add_argument("--no-debug", {
      const: 0,
      action: "store_const",
      dest: "debug",
      help: "Disable debugging.",
    });
    parser.add_argument("--no-progress", {
      action: "store_false",
      dest: "progress",
      default: true,
      help: "Disable the progress bar (implied if --debug is passed).",
    });
    parser.add_argument("--random-seed", {
      default: "almond is awesome",
      help: "Random seed",
    });
    parser.add_argument("--white-list", {
      required: false,
      help: `List of functions to include, split by comma (no space).`,
    });
    parser.add_argument("--id-prefix", {
      required: false,
      default: "",
      help:
        "Prefix to add to all sentence IDs (useful to combine multiple datasets).",
    });
  }

export async function execute(args: any) {
    const tpClient = new Tp.FileClient(args);

    const options = {
      rng: seedrandom.alea(args.random_seed),
      locale: args.locale,
      flags: args.flags || {},
      templateFiles: args.template,
      thingpediaClient: tpClient,
      targetPruningSize: args.target_pruning_size,
      maxDepth: args.maxdepth,
      debug: args.debug,
      whiteList: args.white_list,
      contextual: false,
    };

    const generator = new SentenceGenerator({
            locale: options.locale,
            timezone: undefined,
            templateFiles: options.templateFiles,
            forSide: 'user',
            contextual: false,
            flags: options.flags,
            targetPruningSize: options.targetPruningSize,
            maxDepth: options.maxDepth,
            maxConstants: 5,
            debug: options.debug,
            rng: options.rng,

            thingpediaClient: options.thingpediaClient,
            entityAllocator: new ThingTalk.Syntax.SequentialEntityAllocator({}),
            whiteList: options.whiteList
        });

    await generator.initialize();
    generator.finalize();

    let _stream = new JsonDatagramSocket(process.stdin!, process.stdout!, 'utf8');

    generator.nextStepExpansion(['search for', 'a', {'nt': 'with_filtered_table'}])

    _stream.on('error', (e: any) => {
      console.error('Genie Error:', e)
    });

    _stream.on('data', (msg: any) => {
      if(msg.partial){
        let expansions = generator.nextStepExpansion(msg.partial);
          _stream.write({
            candidates: expansions,
          });
      } else {
        let { derivation, sentence } = msg
        try {
          // console.warn("Attempting to serialize program:", JSON.stringify(derivation))
          let program = generator.programFromAST(derivation);
          program = program.optimize()
          const tokens = sentence.split(' ');
          const entities = Utils.makeDummyEntities(sentence);
          program = ThingTalkUtils.serializePrediction(program, [], entities, {
              locale: options.locale
          });
          program = program.join(' ')
          _stream.write({ program });
        }
        catch(err) {
          console.error("failed to parse program:", err)
          _stream.write({ err });
        }
      }
    });

    await new Promise((resolve, reject) => {
      process.on('SIGINT', resolve);
      process.on('SIGTERM', resolve);
    });
  }