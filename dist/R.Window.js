module.exports = function(R) {
    var _ = require("lodash");
    var assert = require("assert");

    var defaultParams = {
        width: 1280,
        height: 720,
        scrollTop: 0,
        scrollLeft: 0,
    };

    var Window = {
        createPlugin: function createPlugin(storeName, dispatcherName, eventEmitterName, params) {
            params = params || {};
            _.defaults(params, defaultParams);
            return R.App.createPlugin({
                displayName: "Window",
                installInClient: function installInClient(flux, window) {
                    flux.getDispatcher(dispatcherName).addActionListener("/Window/scrollTo", regeneratorRuntime.mark(function scrollTo(params) {
                        return regeneratorRuntime.wrap(function scrollTo$(context$4$0) {
                            while (1) switch (context$4$0.prev = context$4$0.next) {
                            case 0:
                                R.Debug.dev(function() {
                                    assert(_.isObject(params), "R.Window.Plugin.scrollTo.params: expecting Object.");
                                    assert(_.has(params, "top") && _.isNumber(params.top), "R.Window.Plugin.scrollTo.params.top: expecting Number.");
                                    assert(_.has(params, "left") && _.isNumber(params.left), "R.Window.Plugin.scrollTo.params.left: expecting Number.");
                                });
                                window.scrollTo(params.top, params.left);
                                context$4$0.next = 4;
                                return _.defer;
                            case 4:
                            case "end":
                                return context$4$0.stop();
                            }
                        }, scrollTo, this);
                    }));
                    window.addEventListener("scroll", function() {
                        flux.getStore(storeName).set("/Window/scrollTop", window.scrollTop);
                        flux.getStore(storeName).set("/Window/scrollLeft", window.scrollLeft);
                        flux.getEventEmitter(eventEmitterName).emit("/Window/scroll", {
                            scrollTop: window.scrollTop,
                            scrollLeft: window.scrollLeft,
                        });
                    });
                    window.addEventListener("resize", function() {
                        flux.getStore(storeName).set("/Window/height", window.innerHeight);
                        flux.getStore(storeName).set("/Window/width", window.innerWidth);
                        flux.getEventEmitter(eventEmitterName).emit("/Window/resize", {
                            height: window.innerHeight,
                            width: window.innerWidth,
                        });
                    });
                    flux.getStore(storeName).set("/Window/height", window.innerHeight);
                    flux.getStore(storeName).set("/Window/width", window.innerWidth);
                    flux.getStore(storeName).set("/Window/scrollTop", window.scrollTop);
                    flux.getStore(storeName).set("/Window/scrollLeft", window.scrollLeft);
                },
                installInServer: function installInServer(flux, req) {
                    flux.getStore(storeName).set("/Window/height", params.height);
                    flux.getStore(storeName).set("/Window/width", params.width);
                    flux.getStore(storeName).set("/Window/scrollTop", params.scrollTop);
                    flux.getStore(storeName).set("/Window/scrollLeft", params.scrollLeft);
                },
            });
        },
    };

    return Window;
};
