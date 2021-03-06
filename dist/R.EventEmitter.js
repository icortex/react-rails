module.exports = function(R) {
    var _ = require("lodash");
    var assert = require("assert");

    var EventEmitter = {
        createEventEmitter: function createEventEmitter(specs) {
            R.Debug.dev(function() {
                assert(_.isObject(specs), "R.EventEmitter.createEventEmitter(...): expecting an Object as specs.");
                assert(_.has(specs, "displayName") && _.isString(specs.displayName), "R.EventEmitter.createEventEmitter(...): requires displayName(String).");
                assert(_.has(specs, "addListener") && _.isFunction(specs.addListener), "R.EventEmitter.createEventEmitter(...): requires addListener(String, Function): R.EventEmitter.Listener.");
                assert(_.has(specs, "removeListener") && _.isFunction(specs.removeListener), "R.EventEmitter.createEventEmitter(...)");
            });
            /**
             * @class
             * @memberOf R.EventEmitter
             * @public
             */
            var EventEmitterInstance = function EventEmitterInstance() {};
            _.extend(EventEmitterInstance.prototype, specs, {
                /**
                 *  Type dirty-checking.
                 *  @private
                 *  @readOnly
                 */
                _isEventEmitterInstance_: true,
            });
            return EventEmitterInstance;
        },
        Listener: function Listener(event) {
            this.uniqueId = _.uniqueId("R.EventEmitter.Listener");
            this.event = event;
        },
        createMemoryEventEmitter: function createMemoryEventEmitter() {
            return function MemoryEventEmitter() {
                var listeners = {};
                var addListener = function addListener(event, fn) {
                    var listener = new R.EventEmitter.Listener(event);
                    if(!_.has(listeners, event)) {
                        listeners[event] = {};
                    }
                    listeners[event][listener.uniqueId] = fn;
                    return listener;
                };
                var removeListener = function removeListener(listener) {
                    R.Debug.dev(function() {
                        assert(listener instanceof R.EventEmitter.Listener, "R.EventEmitter.MemoryEventEmitter.removeListener(...): type R.EventEmitter.Listener expected.");
                        assert(_.has(listeners, listener.event), "R.EventEmitter.MemoryEventEmitter.removeListener(...): no listeners for this event.");
                        assert(_.has(listeners[listener.event], listener.uniqueId), "R.EventEmitter.MemoryEventEmitter.removeListener(...): no such listener.");
                    });
                    delete listeners[listener.event][listener.uniqueId];
                    if(_.size(listeners[listener.event]) === 0) {
                        delete listeners[listener.event];
                    }
                };
                var emit = function emit(event, params) {
                    params = params || {};
                    if(_.has(listeners, event)) {
                        _.each(listeners[event], function(fn) {
                            if(fn) {
                                fn(params);
                            }
                        });
                    }
                };
                return new (R.EventEmitter.createEventEmitter({
                    displayName: "MemoryEventEmitter",
                    addListener: addListener,
                    removeListener: removeListener,
                    emit: emit,
                }))();
            };
        },
        createUplinkEventEmitter: function createUplinkEventEmitter() {
            return function UplinkEventEmitter(uplink) {
                R.Debug.dev(function() {
                    assert(uplink.listenTo && _.isFunction(uplink.listenTo), "R.EventEmitter.createUplinkEventEmitter(...).uplink.listenTo: expecting Function.");
                    assert(uplink.unlistenFrom && _.isFunction(uplink.unlistenFrom), "R.EventEmitter.createUplinkEventEmitter(...).uplink.unlistenFrom: expecting Function.");
                });
                var listenTo = uplink.listenTo;
                var unlistenFrom = uplink.unlistenFrom;
                var listeners = {};
                var emitters = {};
                var addListener = function addListener(event, fn) {
                    var listener = new R.EventEmitter.Listener(event);
                    if(!_.has(listeners, event)) {
                        emitters[event] = listenTo(event, _.partial(emit, event));
                        listeners[event] = {};
                    }
                    listeners[event][listener.uniqueId] = fn;
                    return listener;
                };
                var removeListener = function removeListener(listener) {
                    R.Debug.dev(function() {
                        assert(listener instanceof R.EventEmitter.Listener, "R.EventEmitter.UplinkEventEmitter.removeListener(...): type R.EventEmitter.Listener expected.");
                        assert(_.has(listeners, listener.event), "R.EventEmitter.UplinkEventEmitter.removeListener(...): no listeners for this event.");
                        assert(_.has(listeners[listener.event], listener.uniqueId), "R.EventEmitter.UplinkEventEmitter.removeListener(...): no such listener.");
                    });
                    delete listeners[listener.event][listener.uniqueId];
                    if(_.size(listeners[listener.event]) === 0) {
                        unlistenFrom(listener.event, emitters[event]);
                        delete listeners[listener.event];
                        delete emitters[listener.event];
                    }
                };
                var emit = function emit(event, params) {
                    params = params || {};
                    if(_.has(listeners, event)) {
                        _.each(listeners[event], function(fn) {
                            if(fn) {
                                fn(params);
                            }
                        });
                    }
                };
                return new (R.EventEmitter.createEventEmitter({
                    displayName: "UplinkEventEmitter",
                    addListener: addListener,
                    removeListener: removeListener,
                }))();
            };
        },
    };

    _.extend(EventEmitter.Listener.prototype, /** @lends R.EventEmitter.Listener.prototype */ {
        /**
         * @type {String}
         * @public
         * @readOnly
         */
        uniqueId: null,
        /**
         * @type {String}
         * @public
         * @readOnly
         */
        event: null,
    });

    return EventEmitter;
};
