module.exports = function(R) {
    var _ = require("lodash");
    var assert = require("assert");
    var co = require("co");
    var Promise = require("bluebird");
    var React = R.React;

    var count = 0;

    var abstractLocationRegExp = /^(.*):\/(.*)$/;


    /**
     * @memberOf R
     * Flux represents the data flowing from the backends (either local or remote).
     * To enable isomoprhic rendering, it should be computable either or in the server or in the client.
     * It represents the global state, including but not limited to:
     * - Routing information
     * - Session information
     * - Navigation information
     * - etc
     */
    var Flux = {
        createFlux: function createFlux(specs) {
            R.Debug.dev(function() {
                assert(_.isObject(specs), "R.createFlux(...): expecting an Object.");
                assert(_.has(specs, "bootstrapInClient") && _.isFunction(specs.bootstrapInClient), "R.createFlux(...): requires bootstrapInClient(Window): Function");
                assert(_.has(specs, "bootstrapInServer") && _.isFunction(specs.bootstrapInServer), "R.createFlux(...): requires bootstrapInServer(http.IncomingMessage): Function");
            });
            var FluxInstance = function() { R.Flux.FluxInstance.call(this); };
            _.extend(FluxInstance.prototype, R.Flux.FluxInstance.prototype, specs);
            return FluxInstance;
        },
        PropType: function validateFlux(props, propName, componentName) {
            var flux = props.flux;
            var valid = null;
            R.Debug.dev(function() {
                try {
                    assert(_.isObject(flux) && flux._isFluxInstance_, "R.Root.createClass(...): expecting a R.Flux.FluxInstance.");
                }
                catch(err) {
                    valid = err;
                }
            });
            return valid;
        },
        FluxInstance: function FluxInstance() {
            this._stores = {};
            this._eventEmitters = {};
            this._dispatchers = {};
        },
        Mixin: {
            _FluxMixinSubscriptions: null,
            _FluxMixinListeners: null,
            getInitialState: function getInitialState() {
                var subscriptions = this.getFluxStoreSubscriptions(this.props);
                if(this.getFlux().shouldInjectFromStores()) {
                    return _.object(_.map(subscriptions, R.scope(function(stateKey, location) {
                        var r = abstractLocationRegExp.exec(location);
                        assert(r !== null, "R.Flux.getInitialState(...): incorrect location ('" + this.displayName + "', '" + location + "', '" + stateKey + "')");
                        var storeName = r[1];
                        var storeKey = r[2];
                        return [stateKey, this.getFluxStore(storeName).get(storeKey)];
                    }, this)));
                }
                else {
                    return _.object(_.map(subscriptions, function(stateKey) {
                        return [stateKey, null];
                    }));
                }
            },
            componentWillMount: function componentWillMount() {
                R.Debug.dev(R.scope(function() {
                    assert(this.getFlux && _.isFunction(this.getFlux), "R.Flux.Mixin.componentWillMount(...): requires getFlux(): R.Flux.FluxInstance.");
                    assert(this._AsyncMixinHasAsyncMixin, "R.Flux.Mixin.componentWillMount(...): requires R.Async.Mixin.");
                }, this));
                this._FluxMixinListeners = {};
                this._FluxMixinSubscriptions = {};
                this._FluxMixinResponses = {};
                if(!this.getFluxStoreSubscriptions) {
                    this.getFluxStoreSubscriptions = this._FluxMixinDefaultGetFluxStoreSubscriptions;
                }
                if(!this.getFluxEventEmittersListeners) {
                    this.getFluxEventEmittersListeners = this._FluxMixinDefaultGetFluxEventEmittersListeners;
                }
                if(!this.fluxStoreWillUpdate) {
                    this.fluxStoreWillUpdate = this._FluxMixinDefaultFluxStoreWillUpdate;
                }
                if(!this.fluxStoreDidUpdate) {
                    this.fluxStoreDidUpdate = this._FluxMixinDefaultFluxStoreDidUpdate;
                }
                if(!this.fluxEventEmitterWillEmit) {
                    this.fluxEventEmitterWillEmit = this._FluxMixinDefaultFluxEventEmitterWillEmit;
                }
                if(!this.fluxEventEmitterDidEmit) {
                    this.fluxEventEmitterDidEmit = this._FluxMixinDefaultFluxEventEmitterDidEmit;
                }
            },
            componentDidMount: function componentDidMount() {
                this._FluxMixinUpdate(this.props);
            },
            componentWillReceiveProps: function componentWillReceiveProps(props) {
                this._FluxMixinUpdate(props);
            },
            componentWillUnmount: function componentWillUnmount() {
                this._FluxMixinClear();
            },
            getFluxStore: function getFluxStore(name) {
                return this.getFlux().getStore(name);
            },
            prefetchFluxStores: function* prefetchFluxStores() {
                var subscriptions = this.getFluxStoreSubscriptions(this.props);
                var curCount = count;
                var state = {};
                yield _.map(subscriptions, R.scope(function(stateKey, location) {
                    return new Promise(R.scope(function(resolve, reject) {
                        var r = abstractLocationRegExp.exec(location);
                        if(r === null) {
                            return reject(new Error("R.Flux.prefetchFluxStores(...): incorrect location ('" + this.displayName + "', '" + location + "', '" + stateKey + "')"));
                        }
                        else {
                            var storeName = r[1];
                            var storeKey = r[2];
                            co(function*() {
                                state[stateKey] = yield this.getFluxStore(storeName).fetch(storeKey);
                            }).call(this, function(err) {
                                if(err) {
                                    return reject(R.Debug.extendError(err, "Couldn't prefetch subscription ('" + stateKey + "', '" + location + "')"));
                                }
                                else {
                                    return resolve();
                                }
                            });
                        }
                    }, this));
                }, this));
                this.getFlux().startInjectingFromStores();
                var surrogateComponent = new this.__ReactOnRailsSurrogate(this.context, this.props, state);
                surrogateComponent.componentWillMount();
                this.getFlux().stopInjectingFromStores();
                var renderedComponent = surrogateComponent.render();
                var childContext = (surrogateComponent.getChildContext ? surrogateComponent.getChildContext() : this.context);
                surrogateComponent.componentWillUnmount();
                yield React.Children.mapTree(renderedComponent, function(childComponent) {
                    return new Promise(function(resolve, reject) {
                        if(!_.isObject(childComponent)) {
                            return resolve();
                        }
                        var childType = childComponent.type;
                        if(!_.isObject(childType) || !childType.__ReactOnRailsSurrogate) {
                            return resolve();
                        }
                        var surrogateChildComponent = new childType.__ReactOnRailsSurrogate(childContext, childComponent.props);
                        if(!surrogateChildComponent.componentWillMount) {
                            R.Debug.dev(function() {
                                console.error("Component doesn't have componentWillMount. Maybe you forgot R.Component.Mixin? ('" + surrogateChildComponent.displayName + "')");
                            });
                        }
                        surrogateChildComponent.componentWillMount();
                        co(function*() {
                            yield surrogateChildComponent.prefetchFluxStores();
                            surrogateChildComponent.componentWillUnmount();
                        }).call(this, function(err) {
                            if(err) {
                                return reject(R.Debug.extendError(err, "Couldn't prefetch child component"));
                            }
                            else {
                                return resolve();
                            }
                        });
                    });
                });
            },
            getFluxEventEmitter: function getFluxEventEmitter(name) {
                return this.getFlux().getEventEmitter(name);
            },
            getFluxDispatcher: function getFluxDispatcher(name) {
                return this.getFlux().getDispatcher(name);
            },
            dispatch: function* dispatch(location, params) {
                var r = abstractLocationRegExp.exec(location);
                assert(r !== null, "R.Flux.dispatch(...): incorrect location ('" + this.displayName + "')");
                var entry = {
                    dispatcherName: r[1],
                    action: r[2],
                };
                return yield this.getFluxDispatcher(entry.dispatcherName).dispatch(entry.action, params);
            },
            _FluxMixinDefaultGetFluxStoreSubscriptions: function getFluxStoreSubscriptions(props) {
                return {};
            },
            _FluxMixinDefaultGetFluxEventEmittersListeners: function getFluxEventEmittersListeners(props) {
                return {};
            },
            _FluxMixinDefaultFluxStoreWillUpdate: function fluxStoreWillUpdate(storeName, storeKey, newVal, oldVal) {
                return void 0;
            },
            _FluxMixinDefaultFluxStoreDidUpdate: function fluxStoreDidUpdate(storeName, storeKey, newVal, oldVal) {
                return void 0;
            },
            _FluxMixinDefaultFluxEventEmitterWillEmit: function fluxEventEmitterWillEmit(eventEmitterName, eventName, params) {
                return void 0;
            },
            _FluxMixinDefaultFluxEventEmitterDidEmit: function fluxEventEmitterDidEmit(eventEmitterName, eventName, params) {
                return void 0;
            },
            _FluxMixinClear: function _FluxMixinClear() {
                _.each(this._FluxMixinSubscriptions, this._FluxMixinUnsubscribe);
                _.each(this._FluxMixinListeners, this.FluxMixinRemoveListener);
            },
            _FluxMixinUpdate: function _FluxMixinUpdate(props) {
                var currentSubscriptions = _.object(_.map(this._FluxMixinSubscriptions, function(entry) {
                    return [entry.location, entry.stateKey];
                }));
                var nextSubscriptions = this.getFluxStoreSubscriptions(props);
                _.each(currentSubscriptions, R.scope(function(stateKey, location) {
                    if(!nextSubscriptions[location] || nextSubscriptions[location] !== currentSubscriptions[location]) {
                        this._FluxMixinUnsubscribe(stateKey, location);
                    }
                }, this));
                _.each(nextSubscriptions, R.scope(function(stateKey, location) {
                    if(!currentSubscriptions[location] || currentSubscriptions[location] !== stateKey) {
                        this._FluxMixinSubscribe(stateKey, location);
                    }
                }, this));

                var currentListeners = _.object(_.map(this._FluxMixinListeners, function(entry) {
                    return [entry.location, entry.fn];
                }));
                var nextListeners = this.getFluxEventEmittersListeners(props);
                _.each(currentListeners, R.scope(function(fn, location) {
                    if(!nextListeners[location] || nextListeners[location] !== currentListeners[location]) {
                        this._FluxMixinRemoveListener(fn, location);
                    }
                }, this));
                _.each(nextListeners, R.scope(function(fn, location) {
                    if(!currentListeners[location] || currentListeners[location] !== fn) {
                        this._FluxMixinAddListener(fn, location);
                    }
                }, this));
            },
            _FluxMixinInject: function _FluxMixinInject(stateKey, location) {
                var r = abstractLocationRegExp.exec(location);
                assert(r !== null, "R.Flux._FluxMixinInject(...): incorrect location ('" + this.displayName + "', '" + location + "', '" + stateKey + "')");
                var entry = {
                    storeName: r[1],
                    storeKey: r[2],
                };
                R.Debug.dev(R.scope(function() {
                    assert(this.getFlux().shouldInjectFromStores(), "R.Flux.Mixin._FluxMixinInject(...): should not inject from Stores.");
                    assert(_.isPlainObject(entry), "R.Flux.Mixin._FluxMixinInject(...).entry: expecting Object.");
                    assert(_.has(entry, "storeName") && _.isString(entry.storeName), "R.Flux.Mixin._FluxMixinInject(...).entry.storeName: expecting String.");
                    assert(_.has(entry, "storeKey") && _.isString(entry.storeKey), "R.Flux.Mixin._FluxMixinInject(...).entry.storeKey: expecting String.");
                }, this));
                this.setState(R.record(stateKey, this.getFluxStore(entry.storeName).get(entry.storeKey)));
            },
            _FluxMixinSubscribe: function _FluxMixinSubscribe(stateKey, location) {
                var r = abstractLocationRegExp.exec(location);
                assert(r !== null, "R.Flux._FluxMixinSubscribe(...): incorrect location ('" + this.displayName + "', '" + location + "', '" + stateKey + "')");
                var entry = {
                    storeName: r[1],
                    storeKey: r[2],
                };
                R.Debug.dev(R.scope(function() {
                    assert(_.isPlainObject(entry), "R.Flux.Mixin._FluxMixinSubscribe(...).entry: expecting Object.");
                    assert(_.has(entry, "storeName") && _.isString(entry.storeName), "R.Flux.Mixin._FluxMixinSubscribe(...).entry.storeName: expecting String.");
                    assert(_.has(entry, "storeKey") && _.isString(entry.storeKey), "R.Flux.Mixin._FluxMixinSubscribe(...).entry.storeKey: expecting String.");
                }, this));
                var store = this.getFluxStore(entry.storeName);
                var subscription = store.sub(entry.storeKey, this._FluxMixinStoreSignalUpdate(stateKey, location));
                this._FluxMixinSubscriptions[subscription.uniqueId] = {
                    location: location,
                    stateKey: stateKey,
                    storeName: entry.storeName,
                    subscription: subscription,
                };
            },
            _FluxMixinStoreSignalUpdate: function _FluxMixinStoreSignalUpdate(stateKey, location) {
                return R.scope(function(val) {
                    if(!this.isMounted()) {
                        return;
                    }
                    var previousVal = this.state ? this.state[stateKey] : undefined;
                    if(_.isEqual(previousVal, val)) {
                        return;
                    }
                    this.fluxStoreWillUpdate(stateKey, location, val, previousVal);
                    this.setState(R.record(stateKey, val));
                    this.fluxStoreDidUpdate(stateKey, location, val, previousVal);
                }, this);
            },
            _FluxMixinAddListener: function _FluxMixinAddListener(fn, location) {
                var r = abstractLocationRegExp.exec(location);
                assert(r !== null, "R.Flux._FluxMixinAddListener(...): incorrect location ('" + this.displayName + "', '" + location + "')");
                var entry = {
                    eventEmitterName: r[1],
                    eventName: r[2],
                };
                R.Debug.dev(R.scope(function() {
                    assert(_.isPlainObject(entry), "R.Flux.Mixin._FluxMixinAddListener(...).entry: expecting Object.");
                    assert(_.has(entry, "eventEmitterName") && _.isString(entry.eventEmitterName), "R.Flux.Mixin._FluxMixinAddListener(...).entry.eventEmitterName: expecting String.");
                    assert(_.has(entry, "eventName") && _.isString(entry.eventName), "R.Flux.Mixin._FluxMixinAddListener(...).entry.eventName: expecting String.");
                    assert(_.has(entry, "fn") && _.isFunction(fn), "R.Flux.Mixin._FluxMixinAddListener(...).entry.fn: expecting Function.");
                }, this));
                var eventEmitter = this.getFluxEventEmitter(entry.eventEmitterName);
                var listener = eventEmitter.addListener(entry.eventName, this._FluxMixinEventEmitterEmit(entry.eventEmitterName, entry.eventName, entry.fn));
                this._FluxMixinListeners[listener.uniqueId] = {
                    location: location,
                    fn: fn,
                    eventEmitterName: entry.eventEmitterName,
                    listener: listener,
                };
            },
            _FluxMixinEventEmitterEmit: function _FluxMixinEventEmitterEmit(eventEmitterName, eventName, fn) {
                return R.scope(function(params) {
                    if(!this.isMounted()) {
                        return;
                    }
                    this.fluxEventEmitterWillEmit(eventEmitterName, eventName, params);
                    fn(params);
                    this.fluxEventEmitterDidEmit(eventEmitterName, eventName, params);
                }, this);
            },
            _FluxMixinUnsubscribe: function _FluxMixinUnsubscribe(entry, uniqueId) {
                R.Debug.dev(R.scope(function() {
                    assert(_.has(this._FluxMixinSubscriptions, uniqueId), "R.Flux.Mixin._FluxMixinUnsubscribe(...): no such subscription.");
                }, this));
                var subscription = entry.subscription;
                var storeName = entry.storeName;
                this.getFluxStore(storeName).unsub(subscription);
                delete this._FluxMixinSubscriptions[uniqueId];
            },
            _FluxMixinRemoveListener: function _FluxMixinRemoveListener(entry, uniqueId) {
                R.Debug.dev(R.scope(function() {
                    assert(_.has(this._FluxMixinListeners, uniqueId), "R.Flux.Mixin._FluxMixinRemoveListener(...): no such listener.");
                }, this));
                var listener = entry.listener;
                var eventEmitterName = entry.eventEmitterName;
                this.getFluxEventEmitter(eventEmitterName).removeListener(listener);
                delete this._FluxMixinListeners[uniqueId];
            },
        },
    };

    _.extend(Flux.FluxInstance.prototype, /** @lends R.Flux.FluxInstance.prototype */{
        _isFluxInstance_: true,
        _stores: null,
        _eventEmitters: null,
        _dispatchers: null,
        _shouldInjectFromStores: false,
        bootstrapInClient: _.noop,
        bootstrapInServer: _.noop,
        destroyInClient: _.noop,
        destroyInServer: _.noop,
        shouldInjectFromStores: function shouldInjectFromStores() {
            return this._shouldInjectFromStores;
        },
        startInjectingFromStores: function startInjectingFromStores() {
            R.Debug.dev(R.scope(function() {
                assert(!this._shouldInjectFromStores, "R.Flux.FluxInstance.startInjectingFromStores(...): should not be injecting from Stores.");
            }, this));
            this._shouldInjectFromStores = true;
        },
        stopInjectingFromStores: function stopInjectingFromStores() {
            R.Debug.dev(R.scope(function() {
                assert(this._shouldInjectFromStores, "R.Flux.FluxInstance.stopInjectingFromStores(...): should be injecting from Stores.");
            }, this));
            this._shouldInjectFromStores = false;
        },
        serialize: function serialize() {
            return R.Base64.encode(JSON.stringify(_.mapValues(this._stores, function(store) {
                return store.serialize();
            })));
        },
        unserialize: function unserialize(str) {
            _.each(JSON.parse(R.Base64.decode(str)), R.scope(function(serializedStore, name) {
                R.Debug.dev(R.scope(function() {
                    assert(_.has(this._stores, name), "R.Flux.FluxInstance.unserialize(...): no such Store. (" + name + ")");
                }, this));
                this._stores[name].unserialize(serializedStore);
            }, this));
        },
        getStore: function getStore(name) {
            R.Debug.dev(R.scope(function() {
                assert(_.has(this._stores, name), "R.Flux.FluxInstance.getStore(...): no such Store. (" + name + ")");
            }, this));
            return this._stores[name];
        },
        registerStore: function registerStore(name, store) {
            R.Debug.dev(R.scope(function() {
                assert(store._isStoreInstance_, "R.Flux.FluxInstance.registerStore(...): expecting a R.Store.StoreInstance. (" + name + ")");
                assert(!_.has(this._stores, name), "R.Flux.FluxInstance.registerStore(...): name already assigned. (" + name + ")");
            }, this));
            this._stores[name] = store;
        },
        getEventEmitter: function getEventEmitter(name) {
            R.Debug.dev(R.scope(function() {
                assert(_.has(this._eventEmitters, name), "R.Flux.FluxInstance.getEventEmitter(...): no such EventEmitter. (" + name + ")");
            }, this));
            return this._eventEmitters[name];
        },
        registerEventEmitter: function registerEventEmitter(name, eventEmitter) {
            assert(R.isClient(), "R.Flux.FluxInstance.registerEventEmitter(...): should not be called in the server.");
            R.Debug.dev(R.scope(function() {
                assert(eventEmitter._isEventEmitterInstance_, "R.Flux.FluxInstance.registerEventEmitter(...): expecting a R.EventEmitter.EventEmitterInstance. (" + name + ")");
                assert(!_.has(this._eventEmitters, name), "R.Flux.FluxInstance.registerEventEmitter(...): name already assigned. (" + name + ")");
            }, this));
            this._eventEmitters[name] = eventEmitter;
        },
        getDispatcher: function getDispatcher(name) {
            R.Debug.dev(R.scope(function() {
                assert(_.has(this._dispatchers, name), "R.Flux.FluxInstance.getDispatcher(...): no such Dispatcher. (" + name + ")");
            }, this));
            return this._dispatchers[name];
        },
        registerDispatcher: function registerDispatcher(name, dispatcher) {
            assert(R.isClient(), "R.Flux.FluxInstance.registerDispatcher(...): should not be called in the server. (" + name + ")");
            R.Debug.dev(R.scope(function() {
                assert(dispatcher._isDispatcherInstance_, "R.Flux.FluxInstance.registerDispatcher(...): expecting a R.Dispatcher.DispatcherInstance (" + name + ")");
                assert(!_.has(this._dispatchers, name), "R.Flux.FluxInstance.registerDispatcher(...): name already assigned. (" + name + ")");
            }, this));
            this._dispatchers[name] = dispatcher;
        },
        destroy: function destroy() {
            if(R.isClient()) {
                this.destroyInClient();
            }
            if(R.isServer()) {
                this.destroyInServer();
            }
            _.each(this._stores, function(store) {
                store.destroy();
            });
            this._stores = null;
            _.each(this._eventEmitters, function(eventEmitter) {
                eventEmitter.destroy();
            });
            this._eventEmitters = null;
            _.each(this._dispatchers, function(dispatcher) {
                dispatcher.destroy();
            });
            this._dispatchers = null;
        },
    });

    return Flux;
};
