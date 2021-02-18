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

import List from './list';
import { uniform } from '../utils/random';

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

export type DerivationChild<T> = string | Derivation<T>;

export type DerivationChildTuple<ArgTypes extends unknown[]> = { [K in keyof ArgTypes] : DerivationChild<ArgTypes[K]> };

// A Derivation represents a sentence, possibly with placeholders,
// and a value, possibly with unspecified input parameters, that
// was computed at a certain point in the derivation tree
class Derivation<ValueType> {
    readonly key : DerivationKey;
    readonly value : ValueType;
    readonly context : Context|null;
    sentence : List<string>;
    priority : number;
    children: DerivationChild<unknown>[];
    rule?: Rule<unknown[], unknown>;

    private _flatSentence : string|null;

    constructor(key : DerivationKey,
                value : ValueType,
                sentence : List<string>,
                context : Context|null = null,
                priority = 0,
                children: DerivationChild<unknown>[], 
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
        assert(sentence instanceof List);

        this._flatSentence = null;
        this.children = children;
        this.rule = rule
    }

    toString() : string {
        if (this._flatSentence)
            return this._flatSentence;

        const flattened : string[] = [];
        this.sentence.traverse((el : DerivationChild<unknown>) => flattened.push(String(el)));
        return this._flatSentence = flattened.join(' ');
    }

    clone() : Derivation<ValueType> {
        return new Derivation(this.key, this.value, this.sentence, this.context, this.priority, this.children, this.rule);
    }

    static combine<ArgTypes extends unknown[], ResultType>(children : DerivationChildTuple<ArgTypes>,
                                                           semanticAction : SemanticAction<ArgTypes, ResultType>,
                                                           keyFunction : KeyFunction<ResultType>,
                                                           rulePriority : number,
                                                           rule?: Rule<any, any>) : Derivation<ResultType>|null {
        if (children.length === 1) {
            assert(!(children[0] instanceof Context));
            if (children[0] instanceof Derivation) {
                const newValue = semanticAction(... ([children[0].value] as ArgTypes));
                assert(newValue !== undefined);
                if (newValue === null)
                    return null;
                const newKey = keyFunction(newValue);
                const newDerivation = new Derivation(newKey, newValue, children[0].sentence, children[0].context, children[0].priority, children, rule);
                newDerivation.priority += rulePriority;
                return newDerivation;
            } else { // constant or terminal
                const newValue = semanticAction(... ([undefined] as ArgTypes));
                assert(newValue !== undefined);
                if (newValue === null)
                    return null;
                const newKey = keyFunction(newValue);
                return new Derivation(newKey, newValue, List.singleton(children[0]), null, rulePriority, children, rule);
            }
        }

        let newSentence : List<string> = List.Nil;
        const values : unknown[] = [];
        let newContext : Context|null = null;
        let newPriority = rulePriority;

        for (const child of children) {
            if (typeof child === 'string') { // terminal
                values.push(undefined);
                newSentence = List.append(newSentence, child);
            } else {
                assert(Context.compatible(newContext, child.context));
                newContext = Context.meet(newContext, child.context);
                newPriority += child.priority;
                values.push(child.value);
                newSentence = List.join(newSentence, child.sentence);
            }
        }

        // console.log('combine: ' + children.join(' ++ '));
        //console.log('values: ' + values.join(' , '));

        const newValue = semanticAction(...(values as ArgTypes));
        assert(newValue !== undefined);
        if (newValue === null)
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
    index : number;

    relativeKeyConstraint : RelativeKeyConstraint|undefined = undefined;
    constantKeyConstraint : ConstantKeyConstraint|undefined = undefined;

    constructor(symbol : string, constraint : RelativeKeyConstraint|ConstantKeyConstraint|undefined = undefined) {
        this.symbol = symbol;
        this.index = -1;

        if (constraint) {
            if (constraint.length === 3)
                this.relativeKeyConstraint = constraint;
            else
                this.constantKeyConstraint = constraint;
        }
    }

    toString() : string {
        return `NT[${this.symbol}]`;
    }
}

type RNG = () => number;

class Choice {
    choices : string[];

    constructor(choices : string[]) {
        this.choices = choices;
    }

    choose(rng : RNG) : string {
        return uniform(this.choices, rng);
    }

    toString() : string {
        return `C[${this.choices.join('|')}]`;
    }
}

//const everything = new Set;

export {
    LogLevel,

    Derivation,
    Context,
    NonTerminal,
    Choice,
};
