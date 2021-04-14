// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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


import assert from 'assert';

import {
    Phrase,
    Concatenation,
    Placeholder,
    Replaceable,
    PlaceholderReplacement,
    ReplacedResult,
    ReplacedConcatenation,
    ReplacedChoice,
    ReplacedList,
} from '../utils/template-string';
export {
    Phrase,
    Concatenation,
    Placeholder,
    PlaceholderReplacement,
    Replaceable,
    ReplacedResult,
    ReplacedConcatenation,
    ReplacedChoice,
    ReplacedList,
};

export { importGenie as import } from './compiler';

import {
    DerivationKeyValue,
    DerivationKey,
    SemanticAction,
    KeyFunction
} from './types';
import { ValidationHITCreator } from '../dataset-tools/mturk';
import { Rule } from './generator';

const LogLevel = {
    NONE: 0,

    // log at the beginning and at the end of the generation for each depth, and notable events
    // such as particularly slow templates
    INFO: 1,

    // log each non-empty non terminal
    GENERATION: 2,

    // log each non-empty non terminal, and additional verbose information
    VERBOSE_GENERATION: 3,

    // log all templates before generation
    DUMP_TEMPLATES: 4,

    // log information derived from the templates (such as the distance from the root)
    DUMP_DERIVED: 5,

    // log a lot of very redundant information during generation (can cause slowdowns)
    EVERYTHING: 6
};

/**
 * A reference to a context.
 *
 * A context is an object that is passed as extra input to a semantic function
 * to affect its behavior. Grammar rules are only applied between identical (===) contexts.
 *
 * The "context" in this definition roughly corresponds to a dialogue context
 * (either a C: state, or a more general notion) but it need not be.
 *
 * "value" is a value associated with the context that is only meaningful to the API caller
 * (DialogueGenerator).
 */
class Context {
    private static _nextId = 0;
    private _id;

    constructor(public value : unknown) {
        // NOTE: this assumes that no more than ~4B contexts exists, otherwise
        // this will overflow
        this._id = Context._nextId ++;
    }

    toString() : string {
        return `CTX[${this.value}]`;
    }

    hash() : number {
        return this._id;
    }

    equals(other : Context) {
        return this === other;
    }

    static compatible(c1 : Context|null, c2 : Context|null) : boolean {
        return c1 === null || c2 === null || c1 === c2;
    }
    static meet(c1 : Context|null, c2 : Context|null) : Context|null {
        if (c1 === null)
            return c2;
        else
            return c1;
    }
}

export type DerivationChildTuple<ArgTypes extends unknown[]> = { [K in keyof ArgTypes] : Derivation<ArgTypes[K]> };

/**
 * A Derivation represents a sentence fragment and an intermediate value
 * that were computed at some point during the generation process.
 */
class Derivation<ValueType> {
    readonly key : DerivationKey;
    readonly value : ValueType;
    readonly context : Context|null;
    sentence : ReplacedResult;
    priority : number;
    children: Derivation<unknown>[];
    rule?: Rule<unknown[], unknown>;

    constructor(key : DerivationKey,
                value : ValueType,
                sentence : ReplacedResult,
                context : Context|null = null,
                priority = 0,
                children: Derivation<unknown>[], 
                rule?: Rule<any, unknown>) {
        this.key = key;
        this.value = value;
        if (value === undefined)
            throw new TypeError('Invalid value');
        this.context = context;
        assert(typeof this.context === 'object'); // incl. null
        this.sentence = sentence;
        this.priority = priority;
        assert(Number.isFinite(this.priority));

        this.children = children.map(c => c instanceof Derivation ? c.clone() : c);
        this.rule = rule
    }

    chooseBestSentence() : string {
        return this.sentence.chooseBest();
    }

    sampleSentence(rng : () => number) : string {
        return this.sentence.chooseSample(rng);
    }

    clone() : Derivation<ValueType> {
        return new Derivation(this.key, this.value, this.sentence, this.context, this.priority, this.children, this.rule);
    }

    static combine<ArgTypes extends unknown[], ResultType>(children : DerivationChildTuple<ArgTypes>,
                                                           template : Replaceable,
                                                           semanticAction : SemanticAction<ArgTypes, ResultType>,
                                                           keyFunction : KeyFunction<ResultType>,
                                                           rulePriority : number,
                                                           rule?: Rule<any, any>) : Derivation<ResultType>|null {
        const phrases : PlaceholderReplacement[] = [];
        const values : unknown[] = [];
        let newContext : Context|null = null;
        let newPriority = rulePriority;

        for (const child of children) {
            assert(Context.compatible(newContext, child.context));
            newContext = Context.meet(newContext, child.context);
            newPriority += child.priority;
            values.push(child.value);
            phrases.push({ text: child.sentence, value: child.key });
        }

        const newValue = semanticAction(...(values as ArgTypes));
        assert(newValue !== undefined);
        if (newValue === null)
            return null;

        const newSentence = template.replace({ replacements: phrases, constraints: {} });
        if (newSentence === null)
            return null;

        const newKey = keyFunction(newValue);
        return new Derivation(newKey, newValue, newSentence, newContext, newPriority, children, rule);
    }
}

/**
 * Equality of key compared to another non-terminal.
 *
 * The values are [our index name, the 0-based position of the other non-terminal, the other index name].
 */
type RelativeKeyConstraint = [string, number, string];

/**
 * Equality of key compared to a constant value.
 *
 * The constraint store [our index name, the comparison value].
 */
type ConstantKeyConstraint = [string, DerivationKeyValue];

class NonTerminal {
    symbol : string;
    name : string|undefined;
    index : number;

    relativeKeyConstraint : RelativeKeyConstraint|undefined = undefined;
    constantKeyConstraint : ConstantKeyConstraint|undefined = undefined;

    constructor(symbol : string, name ?: string, constraint ?: RelativeKeyConstraint|ConstantKeyConstraint) {
        this.symbol = symbol;
        this.name = name;
        this.index = -1;

        if (constraint) {
            if (constraint.length === 3)
                this.relativeKeyConstraint = constraint;
            else
                this.constantKeyConstraint = constraint;
        }
    }

    toString() : string {
        if (this.name !== undefined)
            return `NT[${this.name} : ${this.symbol}]`;
        else
            return `NT[${this.symbol}]`;
    }
}

//const everything = new Set;

export {
    LogLevel,

    Derivation,
    Context,
    NonTerminal,
};
