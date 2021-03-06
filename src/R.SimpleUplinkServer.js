module.exports = function(R) {
    var io = require("socket.io");
    var _ = require("lodash");
    var assert = require("assert");
    var co = require("co");
    var EventEmitter = require("events").EventEmitter;
    var bodyParser = require("body-parser");

    var SimpleUplinkServer = {
        createServer: function createServer(specs) {
            R.Debug.dev(function() {
                assert(specs.store && _.isArray(specs.store), "R.SimpleUplinkServer.createServer(...).specs.store: expecting Array.");
                assert(specs.events && _.isArray(specs.events), "R.SimpleUplinkServer.createServer(...).specs.events: expecting Array.");
                assert(specs.actions && _.isPlainObject(specs.actions), "R.SimpleUplinkServer.createServer(...).specs.actions: expecting Object.");
                assert(specs.sessionCreated && _.isFunction(specs.sessionCreated), "R.SimpleUplinkServer.createServer(...).specs.sessionCreated: expecting Function.");
                assert(specs.sessionDestroyed && _.isFunction(specs.sessionDestroyed), "R.SimpleUplinkServer.createServer(...).specs.sessionDestroyed: expecting Function.");
                assert(specs.sessionTimeout && _.isNumber(specs.sessionTimeout), "R.SimpleUplinkServer.createServer(...).specs.sessionTimeout: expecting Number.");
            });
            var SimpleUplinkServerInstance = function SimpleUplinkServerInstance() {
                SimpleUplinkServer.SimpleUplinkServerInstance.call(this);
                this._specs = specs;
                this._pid = R.guid("SimpleUplinkServer");
            };
            _.extend(SimpleUplinkServerInstance.prototype, SimpleUplinkServer.SimpleUplinkServerInstance.prototype, specs);
            return SimpleUplinkServerInstance;
        },
        SimpleUplinkServerInstance: function SimpleUplinkServerInstance() {
            this._store = {};
            this._hashes = {};
            this._storeRouter = new R.Router();
            this._storeRouter.def(_.constant({
                err: "Unknown store key",
            }));
            this._storeEvents = new EventEmitter();
            this._eventsRouter = new R.Router();
            this._eventsRouter.def(_.constant({
                err: "Unknown event name",
            }));
            this._eventsEvents = new EventEmitter();
            this._actionsRouter = new R.Router();
            this._actionsRouter.def(_.constant({
                err: "Unknown action",
            }));
            this._sessions = {};
            this._sessionsEvents = new EventEmitter();
            this._connections = {};

            this._linkSession = R.scope(this._linkSession, this);
            this._unlinkSession = R.scope(this._unlinkSession, this);
        },
        _SimpleUplinkServerInstanceProtoProps: /** @lends R.SimpleUplinkServer.SimpleUplinkServerInstance.prototype */{
            _specs: null,
            _pid: null,
            _prefix: null,
            _app: null,
            _io: null,
            _store: null,
            _storeEvents: null,
            _storeRouter: null,
            _eventsRouter: null,
            _eventsEvents: null,
            _actionsRouter: null,
            _sessions: null,
            _sessionsEvents: null,
            _connections: null,
            bootstrap: null,
            sessionCreated: null,
            sessionDestroyed: null,
            sessionTimeout: null,
            setStore: function setStore(key, val) {
                return R.scope(function(fn) {
                    try {
                        var previousVal = this._store[key] || {};
                        var previousHash = this._hashes[key] || R.hash(JSON.stringify(previousVal));
                        var diff = R.diff(previousVal, val);
                        var hash = R.hash(JSON.stringify(val));
                        this._store[key] = val;
                        this._hashes[key] = hash;
                        this._storeEvents.emit("set:" + key, {
                            k: key,
                            d: diff,
                            h: previousHash,
                        });
                    }
                    catch(err) {
                        return fn(R.Debug.extendError(err, "R.SimpleUplinkServer.setStore('" + key + "', '" + val + "')"));
                    }
                    _.defer(function() {
                        fn(null, val);
                    });
                }, this);
            },
            getStore: function getStore(key) {
                return R.scope(function(fn) {
                    var val;
                    try {
                        R.Debug.dev(R.scope(function() {
                            if(!_.has(this._store, key)) {
                                console.warn("R.SimpleUplinkServer(...).getStore: no such key (" + key + ")");
                            }
                        }, this));
                        val = this._store[key];
                    }
                    catch(err) {
                        return fn(R.Debug.extendError(err, "R.SimpleUplinkServer.getStore('" + key + "')"));
                    }
                    _.defer(function() {
                        fn(null, val);
                    });
                }, this);
            },
            emitEvent: function emitEvent(eventName, params) {
                this._eventsEvents.emit("emit:" + eventName, params);
            },
            emitDebug: function emitDebug(guid, params) {
                R.Debug.dev(R.scope(function() {
                    if(this._sessions[guid]) {
                        this._sessions[guid].emit("debug", params);
                    }
                }, this));
            },
            emitLog: function emitLog(guid, params) {
                if(this._sessions[guid]) {
                    this._sessions[guid].emit("log", params);
                }
            },
            emitWarn: function emitLog(guid, params) {
                if(this._sessions[guid]) {
                    this._sessions[guid].emit("warn", params);
                }
            },
            emitError: function emitLog(guid, params) {
                if(this._sessions[guid]) {
                    this._sessions[guid].emit("err", params);
                }
            },
            _extractOriginalPath: function _extractOriginalPath() {
                return arguments[arguments.length - 1];
            },
            _bindStoreRoute: function _bindStoreRoute(route) {
                this._storeRouter.route(route, this._extractOriginalPath);
            },
            _bindEventsRoute: function _bindEventsRoute(route) {
                this._eventsRouter.route(route, this._extractOriginalPath);
            },
            _bindActionsRoute: function _bindActionsRoute(handler, route) {
                this._actionsRouter.route(route, _.constant(R.scope(handler, this)));
            },
            installHandlers: function* installHandlers(app, prefix) {
                assert(this._app === null, "R.SimpleUplinkServer.SimpleUplinkServerInstance.installHandlers(...): app already mounted.");
                this._app = app;
                this._prefix = prefix || "/uplink/";
                var server = require("http").Server(app);
                this._io = io(server).of(prefix);
                this._app.get(this._prefix + "*", R.scope(this._handleHttpGet, this));
                this._app.post(this._prefix + "*", bodyParser.json(), R.scope(this._handleHttpPost, this));
                this._io.on("connection", R.scope(this._handleSocketConnection, this));
                this._handleSocketDisconnection = R.scope(this._handleSocketDisconnection, this);
                this._sessionsEvents.addListener("expire", R.scope(this._handleSessionExpire, this));
                _.each(this._specs.store, R.scope(this._bindStoreRoute, this));
                _.each(this._specs.events, R.scope(this._bindEventsRoute, this));
                _.each(this._specs.actions, R.scope(this._bindActionsRoute, this));
                this.bootstrap = R.scope(this._specs.bootstrap, this);
                yield this.bootstrap();
                return server;
            },
            _handleHttpGet: function _handleHttpGet(req, res, next) {
                co(function*() {
                    var path = req.path.slice(this._prefix.length - 1); // keep the leading slash
                    var key = this._storeRouter.match(path);
                    R.Debug.dev(function() {
                        console.warn("<<< fetch", path);
                    });
                    return yield this.getStore(key);
                }).call(this, function(err, val) {
                    if(err) {
                        if(R.Debug.isDev()) {
                            return res.status(500).json({ err: err.toString(), stack: err.stack });
                        }
                        else {
                            return res.status(500).json({ err: err.toString() });
                        }
                    }
                    else {
                        return res.status(200).json(val);
                    }
                });
            },
            _handleHttpPost: function _handleHttpPost(req, res) {
                co(function*() {
                    var path = req.path.slice(this._prefix.length - 1); // keep the leading slash
                    var handler = this._actionsRouter.match(path);
                    assert(_.isObject(req.body), "body: expecting Object.");
                    assert(req.body.guid && _.isString(req.body.guid), "guid: expecting String.");
                    assert(req.body.params && _.isPlainObject(req.body.params), "params: expecting Object.");
                    if(!_.has(this._sessions, req.body.guid)) {
                        this._sessions[guid] = new R.SimpleUplinkServer.Session(guid, this._storeEvents, this._eventsEvents, this._sessionsEvents, this.sessionTimeout);
                        yield this.sessionCreated(guid);
                    }
                    var params = _.extend({}, { guid: req.body.guid }, req.body.params);
                    R.Debug.dev(function() {
                        console.warn("<<< action", path, params);
                    });
                    return yield handler(params);
                }).call(this, function(err, val) {
                    if(err) {
                        if(R.Debug.isDev()) {
                            return res.status(500).json({ err: err.toString(), stack: err.stack });
                        }
                        else {
                            return res.status(500).json({ err: err.toString() });
                        }
                    }
                    else {
                        res.status(200).json(val);
                    }
                });
            },
            _handleSocketConnection: function _handleSocketConnection(socket) {
                var connection = new R.SimpleUplinkServer.Connection(this._pid, socket, this._handleSocketDisconnection, this._linkSession, this._unlinkSession);
                this._connections[connection.uniqueId] = connection;
            },
            _handleSocketDisconnection: function _handleSocketDisconnection(uniqueId) {
                var guid = this._connections[uniqueId].guid;
                if(guid && this._sessions[guid]) {
                    this._sessions[guid].detachConnection();
                }
                delete this._connections[uniqueId];
            },
            _linkSession: function* _linkSession(connection, guid) {
                if(!this._sessions[guid]) {
                    this._sessions[guid] = new R.SimpleUplinkServer.Session(guid, this._storeEvents, this._eventsEvents, this._sessionsEvents, this.sessionTimeout);
                    yield this.sessionCreated(guid);
                }
                return this._sessions[guid].attachConnection(connection);
            },
            _unlinkSession: function _unlinkSession(connection, guid) {
                return R.scope(function(fn) {
                    try {
                        if(this._sessions[guid]) {
                            this._sessions[guid].terminate();
                        }
                    }
                    catch(err) {
                        return fn(R.Debug.extendError("R.SimpleUplinkServerInstance._unlinkSession(...)"));
                    }
                    return fn(null);
                }, this);
            },
            _handleSessionExpire: function _handleSessionExpire(guid) {
                R.Debug.dev(R.scope(function() {
                    assert(_.has(this._sessions, guid), "R.SimpleUplinkServer._handleSessionExpire(...): no such session.");
                }, this));
                delete this._sessions[guid];
                co(function*() {
                    yield this.sessionDestroyed(guid);
                }).call(this, R.Debug.rethrow("R.SimpleUplinkServer._handleSessionExpire(...)"));
            },
        },
        Connection: function Connection(pid, socket, handleSocketDisconnection, linkSession, unlinkSession) {
            this._pid = pid;
            this.uniqueId = _.uniqueId("R.SimpleUplinkServer.Connection");
            this._socket = socket;
            this._handleSocketDisconnection = handleSocketDisconnection;
            this._linkSession = linkSession;
            this._unlinkSession = unlinkSession;
            this._bindHandlers();
        },
        _ConnectionProtoProps: /** @lends R.SimpleUplinkServer.Connection.prototype */{
            _socket: null,
            _pid: null,
            uniqueId: null,
            guid: null,
            _handleSocketDisconnection: null,
            _linkSession: null,
            _unlinkSession: null,
            _subscribeTo: null,
            _unsubscribeFrom: null,
            _listenTo: null,
            _unlistenFrom: null,
            _disconnected: null,
            _bindHandlers: function _bindHandlers() {
                this._socket.on("handshake", R.scope(this._handleHandshake, this));
                this._socket.on("subscribeTo", R.scope(this._handleSubscribeTo, this));
                this._socket.on("unsubscribeFrom", R.scope(this._handleUnsubscribeFrom, this));
                this._socket.on("listenTo", R.scope(this._handleListenTo, this));
                this._socket.on("unlistenFrom", R.scope(this._handleUnlistenFrom, this));
                this._socket.on("disconnect", R.scope(this._handleDisconnect, this));
                this._socket.on("unhandshake", R.scope(this._handleUnHandshake, this));
            },
            emit: function emit(name, params) {
                R.Debug.dev(function() {
                    console.warn("[C] >>> " + name, params);
                });
                this._socket.emit(name, params);
            },
            _handleHandshake: function _handleHandshake(params) {
                if(!_.has(params, "guid") || !_.isString(params.guid)) {
                    this.emit("err", { err: "handshake.params.guid: expected String."});
                }
                else if(this.guid) {
                    this.emit("err", { err: "handshake: session already linked."});
                }
                else {
                    co(function*() {
                        this.guid = params.guid;
                        var s = yield this._linkSession(this, this.guid);
                        this.emit("handshake-ack", {
                            pid: this._pid,
                            recovered: s.recovered,
                        });
                        this._subscribeTo = s.subscribeTo;
                        this._unsubscribeFrom = s.unsubscribeFrom;
                        this._listenTo = s.listenTo;
                        this._unlistenFrom = s.unlistenFrom;
                    }).call(this, R.Debug.rethrow("R.SimpleUplinkServer.Connection._handleHandshake(...)"));
                }
            },
            _handleUnHandshake: function _handleUnHandshake() {
                if(!this.guid) {
                    this.emit("err", { err: "unhandshake: no active session."});
                }
                else {
                    co(function*() {
                        this._subscribeTo = null;
                        this._unsubscribeFrom = null;
                        this._listenTo = null;
                        this._unlistenFrom = null;
                        var s = yield this._unlinkSession(this, this.guid);
                        this.emit("unhandshake-ack");
                        this.guid = null;
                    }).call(this, R.Debug.rethrow("R.SimpleUplinkServer.Connection._handleUnHandshake(...)"));
                }
            },
            _handleSubscribeTo: function _handleSubscribeTo(params) {
                if(!_.has(params, "key") || !_.isString(params.key)) {
                    this.emit("err", { err: "subscribeTo.params.key: expected String." });
                }
                else if(!this._subscribeTo) {
                    this.emit("err", { err: "subscribeTo: requires handshake." });
                }
                else {
                    this._subscribeTo(params.key);
                }
            },
            _handleUnsubscribeFrom: function _handleUnsubscribeFrom(params) {
                if(!_.has(params, "key") || !_.isString(params.key)) {
                    this.emit("err", { err: "unsubscribeFrom.params.key: expected String." });
                }
                else if(!this._unsubscribeFrom) {
                    this.emit("err", { err: "unsubscribeFrom: requires handshake." });
                }
                else {
                    this._unsubscribeFrom(params.key);
                }
            },
            _handleListenTo: function _handleListenTo(params) {
                if(!_.has(params, "eventName") || !_.isString(params.eventName)) {
                    this.emit("err", { err: "listenTo.params.eventName: expected String." });
                }
                else if(!this._listenTo) {
                    this.emit("err", { err: "listenTo: requires handshake." });
                }
                else {
                    this.listenTo(params.eventName);
                }
            },
            _handleUnlistenFrom: function _handleUnlistenFrom(params) {
                if(!_.has(params, "eventName") || !_.isString(params.eventName)) {
                    this.emit("err", { err: "unlistenFrom.params.eventName: expected String." });
                }
                else if(!this.unlistenFrom) {
                    this._emit("err", { err: "unlistenFrom: requires handshake." });
                }
                else {
                    this.unlistenFrom(params.eventName);
                }
            },
            _handleDisconnect: function _handleDisconnect() {
                this._handleSocketDisconnection(this.uniqueId, false);
            },
        },
        Session: function Session(guid, storeEvents, eventsEvents, sessionsEvents, timeout) {
            this._guid = guid;
            this._storeEvents = storeEvents;
            this._eventsEvents = eventsEvents;
            this._sessionsEvents = sessionsEvents;
            this._messageQueue = [];
            this._timeoutDuration = timeout;
            this._expire = R.scope(this._expire, this);
            this._expireTimeout = setTimeout(this._expire, this._timeoutDuration);
            this._subscriptions = {};
            this._listeners = {};
        },
        _SessionProtoProps: /** @lends R.SimpleUplinkServer.Session.prototype */{
            _guid: null,
            _connection: null,
            _subscriptions: null,
            _listeners: null,
            _storeEvents: null,
            _eventsEvents: null,
            _sessionsEvents: null,
            _messageQueue: null,
            _expireTimeout: null,
            _timeoutDuration: null,
            attachConnection: function attachConnection(connection) {
                var recovered = (this._connection !== null);
                this.detachConnection();
                this._connection = connection;
                _.each(this._messageQueue, function(m) {
                    connection.emit(m.name, m.params);
                });
                this._messageQueue = null;
                clearTimeout(this._expireTimeout);
                return {
                    recovered: recovered,
                    subscribeTo: R.scope(this.subscribeTo, this),
                    unsubscribeFrom: R.scope(this.unsubscribeFrom, this),
                    listenTo: R.scope(this.listenTon, this),
                    unlistenFrom: R.scope(this.unlistenFrom, this),
                };
            },
            detachConnection: function detachConnection() {
                if(this._connection === null) {
                    return;
                }
                else {
                    this._connection = null;
                    this._messageQueue = [];
                    this._expireTimeout = setTimeout(this._expire, this._timeoutDuration);
                }
            },
            terminate: function terminate() {
                this._expire();
            },
            subscribeTo: function subscribeTo(key) {
                R.Debug.dev(R.scope(function() {
                    assert(!_.has(this._subscriptions, key), "R.SimpleUplinkServer.Session.subscribeTo(...): already subscribed.");
                }, this));
                this._subscriptions[key] = this._signalUpdate();
                this._storeEvents.addListener("set:" + key, this._subscriptions[key]);
            },
            unsubscribeFrom: function unsubscribeFrom(key) {
                R.Debug.dev(R.scope(function() {
                    assert(_.has(this._subscriptions, key), "R.SimpleUplinkServer.Session.unsubscribeFrom(...): not subscribed.");
                }, this));
                this._storeEvents.removeListener("set:" + key, this._subscriptions[key]);
                delete this._subscriptions[key];
            },
            _emit: function _emit(name, params) {
                R.Debug.dev(function() {
                    console.warn("[S] >>> " + name, params);
                });
                if(this._connection !== null) {
                    this._connection.emit(name, params);
                }
                else {
                    this._messageQueue.push({
                        name: name,
                        params: params,
                    });
                }
            },
            _signalUpdate: function _signalUpdate() {
                return R.scope(function(patch) {
                    this._emit("update", patch);
                }, this);
            },
            _signalEvent: function _signalEvent(eventName) {
                return R.scope(function(params) {
                    this._emit("event", { eventName: eventName, params: params });
                }, this);
            },
            _expire: function _expire() {
                _.each(_.keys(this._subscriptions), R.scope(this.unsubscribeFrom, this));
                _.each(_.keys(this._listeners), R.scope(this.unlistenFrom, this));
                this._sessionsEvents.emit("expire", this._guid);
            },
            listenTo: function listenTo(eventName) {
                R.Debug.dev(R.scope(function() {
                    assert(!_.has(this._listeners, key), "R.SimpleUplinkServer.Session.listenTo(...): already listening.");
                }, this));
                this._listeners[eventName] = this._signalEvent(eventName);
                this._eventsEvents.addListener("emit:" + eventName, this._listeners[eventName]);
            },
            unlistenFrom: function unlistenFrom(eventName) {
                R.Debug.dev(R.scope(function() {
                    assert(_.has(this._listeners, eventName), "R.SimpleUplinkServer.Session.unlistenFrom(...): not listening.");
                }, this));
                this._eventsEvents.removeListener("emit:" + eventName, this._listeners[eventName]);
                delete this._listeners[eventName];
            },
        },
    };

    _.extend(SimpleUplinkServer.SimpleUplinkServerInstance.prototype, SimpleUplinkServer._SimpleUplinkServerInstanceProtoProps);
    _.extend(SimpleUplinkServer.Connection.prototype, SimpleUplinkServer._ConnectionProtoProps);
    _.extend(SimpleUplinkServer.Session.prototype, SimpleUplinkServer._SessionProtoProps);

    return SimpleUplinkServer;
};
