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

/*eslint no-misleading-character-class: off */

import assert from 'assert';
import { Inflectors } from 'en-inflectors';
import { Tag } from 'en-pos';

import { coin } from '../utils/random';
import EnglishTokenizer from './tokenizer/english';
import DefaultLanguagePack from './default';

// nltk stop words
const STOPWORDS = ['i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', "you're", "you've", "you'll",
    "you'd", 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', "she's", 'her', 'hers',
    'herself', 'it', "it's", 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who',
    'whom', 'this', 'that', "that'll", 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or',
    'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off',
    'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
    'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', "n't", 'should', "should've", 'now', 'd', 'll',
    'm', 'o', 're', 've', 'y', 'ain', 'aren', "aren't", 'couldn', "couldn't", 'didn', 'doesn',
    'hadn', 'hasn', 'haven', 'isn', 'ma', 'mightn', 'mustn', 'needn','shan', 'shouldn', 'wasn', 'weren',
    'won', 'wouldn'];

const PUNCTUATIONS = [
    ',', '.', ':', ';', '(', ')', '[', ']', '{', '}', '"', '\'', '-', '!', '?'
];

function replaceMeMy(sentence : string) : string {
    sentence = sentence.replace(/\b((?!(?:let|inform|notify|alert|send)\b)[a-zA-Z0-9]+) me\b/g, '$1 them');

    return sentence.replace(/\b(my|i|mine)\b/g, (what : string) => {
        switch (what) {
        case 'me':
            return 'them';
        case 'my':
            return 'their';
        case 'mine':
            return 'theirs';
        case 'i':
            return 'they';
        default:
            return what;
        }
    });
}

// tokens that are treated specially by the PTB tokenizer for English
// (and what they map to in properly punctuated English)
//
// we still handle these, even if we switched away from the PTB tokenizer,
// because it helps with migrating the datasets
const SPECIAL_TOKENS : { [key : string] : string } = {
    '.': '.',
    ',': ',',
    '?': '?',
    '!': '!',
    ':': ':',
    'n\'t': 'n\'t',

    // right/left round/curly/square bracket
    '-rrb-': ')',
    '-lrb-': ' (',
    '-rcb-': '}',
    '-lcb-': ' {',
    '-rsb-': ']',
    '-lsb-': ' [',
};

function capitalize(word : string) : string {
    return word[0].toUpperCase() + word.substring(1);
}

const MUST_CAPITALIZE_TOKEN = new Set([
    'i',

    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
    'october', 'november', 'december',

    // HACK
    'chinese', 'italian', 'french', 'english', 'american',

    'spotify', 'twitter', 'yelp'
]);


function isNumber(word : string) : boolean {
    // numbers with optional "," every 3 digits, cannot start with "."
    return /^\d{1,3}(,?\d{3})*(\.\d+)?$/.test(word);
}

function isZipcode(word : string) : boolean {
    if (word.length !== 5)
        return false;
    for (const char of word) {
        if (isNaN(Number(char)))
            return false;
    }
    return true;
}

/**
 * Implementation of a language pack for English, primarily optimized for
 * American English.
 */
export default class EnglishLanguagePack extends DefaultLanguagePack {
    protected _tokenizer : EnglishTokenizer|undefined;

    getTokenizer() : EnglishTokenizer {
        if (this._tokenizer)
            return this._tokenizer;
        return this._tokenizer = new EnglishTokenizer();
    }

    postprocessSynthetic(sentence : string, program : any, rng : () => number, forTarget = 'user') : string {
        assert(rng);
        if (program.isProgram && program.principal !== null)
            sentence = replaceMeMy(sentence);

        // if (!sentence.endsWith(' ?') && !sentence.endsWith(' !') && !sentence.endsWith(' .')) {
        //     if ((forTarget === 'user' && coin(0.5, rng)) || forTarget === 'agent')
        //         sentence = sentence.trim() + ' .';
        // }
        if (forTarget === 'user' && sentence.endsWith(' ?') && coin(0.5, rng))
            sentence = sentence.substring(0, sentence.length-2);

        sentence = sentence.replace(/ (1|one|a) ([a-z]+)s /g, ' $1 $2 ');

        if (forTarget === 'agent' || coin(0.5, rng))
            sentence = sentence.replace(/ with (no|zero) /g, ' without ');

        if (forTarget === 'user' && coin(0.5, rng))
            sentence = sentence.replace(/ has no /g, ' does not have ');
        if (forTarget === 'user' && coin(0.5, rng))
            sentence = sentence.replace(/ have no /g, ' do not have ');

        // contractions
        if (forTarget === 'agent' || coin(0.5, rng))
            sentence = sentence.replace(/\b(does|do) not /g, '$1 n\'t ');
        if (forTarget === 'user' && coin(0.5, rng))
            sentence = sentence.replace(/\b(he|she|it|what|who|where|when) (is|has) /g, '$1 \'s ');
        if (forTarget === 'agent' || coin(0.5, rng))
            sentence = sentence.replace(/\bi am /g, 'i \'m ');
        if (forTarget === 'agent' || coin(0.5, rng))
            sentence = sentence.replace(/\b(you|we|they) are /g, '$1 \'re ');
        if (forTarget === 'user' && coin(0.5, rng))
            sentence = sentence.replace(/\b(i|you|he|she|we|they) (had|would) /g, '$1 \'d ');

        // adjust the grammar to resolve some edge cases introduced by the templates

        sentence = sentence.replace(/\b(a|the) something\b/g, 'something');

        sentence = sentence.replace(/\b(a|the) my\b/g, 'my');

        //sentence = sentence.replace(/ a ([a-z]+) -s /g, ' $1 -s ');

        sentence = sentence.replace(/\b([a-z]+) -ly\b/g, '$1ly');

        sentence = sentence.replace(/\ba (?!one )(?=[aeiou])\b/g, 'an ');

        sentence = sentence.replace(/\bnew (their|my|the|a)\b/, '$1 new');

        sentence = sentence.replace(/\b's (my|their|his|her)\b/, `'s`); //'

        if (forTarget === 'user' && coin(0.5, rng))
            sentence = sentence.replace(/\bin here\b/, 'here'); //'

        sentence = sentence.replace(/\bin (home|work)\b/, 'at $1');

        sentence = sentence.replace(/\bon (today|tomorrow|(?:(this|last|next) (?:week|month|year)))\b/, '$1');

        sentence = sentence.replace(/\bon (jan(?:uary)|feb(?:ruary)?|mar(?:ch)?|apr(?:il)|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/, 'in $1');

        // apply some very loose grammar fixes
        sentence = sentence.replace(/\b(they(?: 're| are)) ([a-z]+)\b/, (_, pre, word) => {
            const inflected = new Inflectors(word).toPlural();
            return pre + ' ' + inflected;
        });
        sentence = sentence.replace(/\b(it(?: 's| is)) an? ([a-z]+)\b/, (_, pre, word) => {
            const inflected = new Inflectors(word).toSingular();
            return pre + ' ' + inflected;
        });
        sentence = sentence.replace(/\b(they(?: 're| are) [a-zA-Z' ]+?) (which|that) is\b/, '$1 $2 are');
        sentence = sentence.replace(/\b(they(?: 're| are) [a-zA-Z' ]+?) (which|that) has\b/, '$1 $2 have');

        // remove extra # introduced by annotations, and not yet been replaced by value
        sentence = sentence.replace(/#/g, '');

        return sentence.trim();
    }

    detokenize(sentence : string, prevtoken : string|null, token : string) : string {
        if (token === '.' && prevtoken && /[.!?]$/.test(prevtoken))
            return sentence;
        if (!token)
            return sentence;
        if (token.startsWith("'")) {
            sentence += token;
        } else if (token in SPECIAL_TOKENS) {
            sentence += SPECIAL_TOKENS[token];
        } else if ((token === 'not' && prevtoken === 'can') ||
            ((token === 'na' || token === 'ta') && prevtoken === 'gon')) {
            // PTB tokenizer does the following
            // cannot -> can not
            // gonna -> gon na
            // gotta -> got ta
            // invert it here
            //
            // note the absence of a space
            sentence += token;
        } else {
            if (sentence)
                sentence += ' ';
            sentence += token;
        }
        return sentence;
    }

    postprocessNLG(answer : string, entities : { [key : string] : any }) : string {
        // simple true-casing: uppercase all letters at the beginning of the sentence
        // and after a period, question or exclamation mark
        answer = answer.replace(/(^| [.?!] )([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());

        const tokens = answer.split(' ').map((token) => {
            if (token in entities) {
                if (token.startsWith('GENERIC_ENTITY_'))
                    return (entities[token].display || entities[token].value);
                return String(entities[token]);
            }

            // capitalize certain tokens that should be capitalized in English
            if (MUST_CAPITALIZE_TOKEN.has(token))
                return capitalize(token);
            return token;
        });
        answer = this.detokenizeSentence(tokens);

        // remove duplicate spaces
        answer = answer.replace(/\s+/g, ' ');

        // sometimes, we end up with two periods at the end of a sentence, because
        // a #[result] phrase includes a period, or because a value includes a period
        // (this happens with jokes)
        // clean that up
        answer = answer.replace(/\.\.$/, '.');

        return answer;
    }

    pluralize(name : string) : string {
        if (!name.includes(' ')) {
            if (new Tag([name]).initial().tags[0] === 'NN')
                return new Inflectors(name).toPlural();
            return name;
        } else {
            const words = name.split(' ');
            const tags = new Tag(words).initial().tags;
            if (tags[tags.length - 1] !== 'NN')
                return name;
            else if (['VB', 'VBP', 'VBZ', 'VBD'].includes(tags[0]))
                return name;
            words[words.length - 1] = this.pluralize(words[words.length - 1]);
            return words.join(' ');
        }
    }

    /**
     * Turn a verb phrase into its past form
     * @param phrase
     * @returns {string|undefined}
     */
    toVerbPast(phrase : string) : string|undefined {
        const words = phrase.split(' ');
        if (words[0].startsWith('$')) // the phrase starts with a placeholder
            return undefined;
        if (['i', 'you', 'there'].includes(words[0]))
            return undefined;

        const inflected = new Inflectors(words[0]).toPast();
        return [inflected, ...words.slice(1)].join(' ');
    }

    toAgentSideUtterance(phrase : string) : string {
        return phrase.replace(/\b(i|me|my|mine)\b/g, (what) => {
            switch (what) {
            case 'me':
            case 'i':
                return 'you';
            case 'my':
                return 'your';
            case 'mine':
                return 'yours';
            default:
                return what;
            }
        });
    }

    /**
     * Turn a verb phrase into its base form
     * @param phrase
     * @returns {string|undefined}
     */
    toVerbBase(phrase : string) : string|undefined {
        const words = phrase.split(' ');
        if (words[0].startsWith('$')) // the phrase starts with a placeholder
            return undefined;

        const inflected = new Inflectors(words[0]).toPresent();
        return [inflected, ...words.slice(1)].join(' ');
    }

    /**
     * Turn a verb phrase into its 3rd person singular present form
     * @param phrase
     * @returns {string|undefined}
     */
    toVerbSingular(phrase : string) : string|undefined {
        const words = phrase.split(' ');
        if (words[0].startsWith('$')) // the phrase starts with a placeholder
            return undefined;

        const inflected = new Inflectors(words[0]).toPresentS();
        return [inflected, ...words.slice(1)].join(' ');
    }

    isGoodWord(word : string) : boolean {
        // filter out words that cannot be in the dataset,
        // because they would be either tokenized/preprocessed out or
        // they are unlikely to be used with voice
        return /^([a-zA-Z0-9-][a-zA-Z0-9.&'-_\u00C0-\u00D6\u00D8\u00F6\u00F8-\u01BA\u01BB\u01BC-\u01BF\u01C0-\u01C3\u01C4-\u0293\u0294\u0295\u02AF\u02EE\u0300-\u036f]+|,|\?)$/.test(word);
    }

    hasPunctuation(sentence : string) : boolean {
        for (const char of sentence) {
            if (PUNCTUATIONS.includes(char))
                return true;
        }
        return false;
    }

    isGoodSentence(sentence : string) : boolean {
        if (sentence.length < 3)
            return false;
        // if sentence contains punctuation, first drop anything after comma;
        // then filter out the sentence if still has punctuations
        const has_punctuation = this.hasPunctuation(sentence);
        if (has_punctuation) {
            const comma_index = sentence.indexOf(',');
            if (comma_index !== -1)
                sentence = sentence.slice(0, comma_index).trim();
            if (this.hasPunctuation(sentence))
                return false;
        }

        // filter out any sentence starts/ends with stop words
        const words = sentence.split(' ');
        if (STOPWORDS.includes(words[0]) || STOPWORDS.includes(words[words.length-1]))
            return false;
        if (['has', 'have', 'having'].includes(words[0]))
            return false;

        // filter out sentences containing only numbers
        let allNumber = true;
        for (const word of words) {
            if (!isNumber(word) || isZipcode(word))
                allNumber = false;
        }
        if (allNumber)
            return false;

        return true;
    }

    isGoodNumber(number : string) : boolean {
        return /^([0-9]+)$/.test(number);
    }

    isGoodPersonName(word : string) : boolean {
        return this.isGoodWord(word) || /^(\w+\s\w\s?\.)$/.test(word);
    }

    addDefiniteArticle(phrase : string) : string {
        return 'the ' + phrase;
    }

    posTag(tokens : string[]) : string[] {
        return new Tag(tokens)
            .initial() // initial dictionary and pattern based tagging
            .smooth() // further context based smoothing
            .tags;
    }
}

EnglishLanguagePack.prototype.ARGUMENT_NAME_OVERRIDES = {
    'updated': ['update time'],

    'picture_url': ['picture', 'image', 'photo'],

    'title': ['headline', 'title'],

    'file_name': ['file name', 'name'],
    'file_size': ['file size', 'size', 'disk usage'],
    // not even silei knows about mime types, so definitely no mime type here!
    'mime_type': ['file type', 'type'],
};

EnglishLanguagePack.prototype.IGNORABLE_TOKENS = {
    'sportradar': ['fc', 'ac', 'us', 'if', 'as', 'rc', 'rb', 'il', 'fk', 'cd', 'cf'],
    'imgflip:meme_id': ['the'],
    'tt:currency_code': ['us'],
    'tt:stock_id': ['l.p.', 's.a.', 'plc', 'n.v', 's.a.b', 'c.v.'],
    'org:freedesktop:app_id': ['gnome']
};

const ABBREVIATIONS = [
    ['ltd', 'ltd.', 'limited'],
    ['corp', 'corp.', 'corporation'],
    ['l.l.c', 'llc'],
    ['&', 'and'],
    ['inc.', 'inc', 'incorporated'],
];
const PROCESSED_ABBREVIATIONS : { [key : string] : string[] } = {};
for (const abbr of ABBREVIATIONS) {
    for (const variant of abbr)
        PROCESSED_ABBREVIATIONS[variant] = abbr;
}
EnglishLanguagePack.prototype.ABBREVIATIONS = PROCESSED_ABBREVIATIONS;

EnglishLanguagePack.prototype.NO_IDEA = [
    'no idea', 'don\'t know', 'dont know', 'don\'t understand',
    'dont understand', 'no clue',
    'doesn\'t make sense', 'doesn\'t make any sense',
    'doesnt make sense', 'doesnt make any sense'
];

EnglishLanguagePack.prototype.CHANGE_SUBJECT_TEMPLATES = [
    'ok , how about {}',
    'how about {} instead',
    'no {}',
    'no i said {}',
    'no , i said {}',
    'i said {}',
    'i want {} instead',
    'no instead {}',
];

EnglishLanguagePack.prototype.SINGLE_DEVICE_TEMPLATES = [
    ['ask $device to $command', /^(?!(?:what|when|how|who) )/],
    ['ask $device about $command', /^(?:what|when|how|who) /],
    ['ask $device for $command', /^the /],
    ['ask $device $command', /^(?:what|when|how|who) /],
    ['tell $device to $command', /^(?!(?:what|when|how|who) )/],
    ['tell $device that $command', /^(?!(?:what|when|how|who) )/],
    ['use $device to $command', /^(?!(?:what|when|how|who) )/],
    ['use $device and $command', /^(?!(?:what|when|how|who) )/],
    ['order $device to $command', /^(?!(?:what|when|how|who) )/],
    ['$command from $device', null],
    ['$command using $device', null],
    ['$command in $device', null],
    ['$command by $device', null],
    ['$command with $device', null],
    ['talk to $device and $command', /^(?!(?:what|when|how|who) )/],
    ['open $device and $command', /^(?!(?:what|when|how|who) )/],
    ['launch $device and $command', /^(?!(?:what|when|how|who) )/],
];

EnglishLanguagePack.prototype.DEFINITE_ARTICLE_REGEXP = /^the /;
