// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const events = require('events');
const lang = require('lang');
const adt = require('adt');

const AppCompiler = require('./app_compiler');
const AppGrammar = require('./app_grammar');
const ExecEnvironment = require('./exec_environment');
const DeviceSelector = require('./device_selector');

module.exports = new lang.Class({
    Name: 'QueryRunner',
    Extends: events.EventEmitter,

    _init: function(engine) {
        this.engine = engine;
        this._running = true;
        this._inputs = null;
        this._state = null;
    },

    _onData: function(data) {
        try {
            var env = new ExecEnvironment(this.engine.devices, this._state);

            this._blocks[0].update(this._blocks, 0, env, function() {
                this.emit('triggered', env);
            }.bind(this));
        } catch(e) {
            console.log('Error during query run: ' + e.message);
            console.log(e.stack);
        }
    },

    _channelAdded: function(ch) {
        ch.on('data', this._dataListener);
    },

    _channelRemoved: function(ch) {
        ch.removeListener('data', this._dataListener);
    },

    stop: function() {
        if (!this._running)
            throw new Error('QueryRunner is not running');

        return Q.all(this._inputs.map(function(input) {
            return input.stop();
        }));
    },

    runQuery: function(state) {
        var compiler = new AppCompiler();
        var ast = AppGrammar.parse(code, { startRule: 'query' });

        return this.runCompiled(state, compiler.compileInputs(ast));
    },

    runCompiled: function(state, inputBlocks) {
        this._state = state;
        this._blocks = inputBlocks;
        this._inputs = inputBlocks.map(function(input) {
            return new DeviceSelector(this.engine, 'r', input);
        }.bind(this));
    },

    start: function() {
        this._running = true;
        this._dataListener = this._onData.bind(this);

        this._inputs.forEach(function(input) {
            input.on('channel-added', this._channelAdded.bind(this));
            input.on('channel-removed', this._channelRemoved.bind(this));

            input.start().done();
        }, this);
    },
});
