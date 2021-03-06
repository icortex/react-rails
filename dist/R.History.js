module.exports = function(R) {
    var url = require("url");
    var co = require("co");
    var assert = require("assert");
    var _ = require("lodash");
    var React = R.React;

    var History = {
        createPlugin: function createPlugin(storeName, dispatcherName) {
            return R.App.createPlugin({
                displayName: "History",
                updateStoreToHref: function updateStoreToHref(flux, href) {
                    flux.getStore(storeName).set("/History/pathname", url.parse(href).pathname);
                },
                installInClient: function installInClient(flux, window) {
                    flux.getDispatcher(dispatcherName).addActionListener("/History/navigate", R.scope(function navigate(params) {
                        return R.scope(function(fn) {
                            R.Debug.dev(function() {
                                assert(params.pathname && _.isString(params.pathname), "/History/navigate: params.pathname: expecting String.");
                            });
                            var href = url.format(_.extend(url.parse(window.location.href), { pathname: params.pathname }));
                            window.history.pushState(null, null, href);
                            this.updateStoreToHref(flux, href);
                            _.defer(fn);
                        }, this);
                    }, this));
                    window.addEventListener("popstate", R.scope(function() {
                        this.updateStoreToHref(flux, window.location.href);
                    }, this));
                    this.updateStoreToHref(flux, window.location.href);
                },
                installInServer: function installInServer(flux, req) {
                    this.updateStoreToHref(flux, url.parse(req.url).pathname);
                },
            });
        },
        createLinkClass: function createLinkClass(specs) {
            R.Debug.dev(function() {
                assert(specs.dispatcherName && _.isString(specs.dispatcherName), "R.History.createClass(...).specs.dispatcherName: expected String.");
            });
            return React.createClass({
                displayName: "HistoryLink",
                mixins: [R.Component.Mixin],
                propTypes: {
                    children: React.PropTypes.any.isRequired,
                    pathname: React.PropTypes.string.isRequired,
                },
                handleClick: function handleClick(event) {
                    event.preventDefault();
                    co(regeneratorRuntime.mark(function callee$3$0() {
                        return regeneratorRuntime.wrap(function callee$3$0$(context$4$0) {
                            while (1) switch (context$4$0.prev = context$4$0.next) {
                            case 0:
                                context$4$0.next = 2;
                                return this.getFluxDispatcher(specs.dispatcherName).dispatch("/History/navigate", { pathname: this.props.pathname });
                            case 2:
                            case "end":
                                return context$4$0.stop();
                            }
                        }, callee$3$0, this);
                    })).call(this);
                },
                render: function render() {
                    return React.DOM.a({
                        className: "HistoryLink",
                        href: this.props.pathname,
                        onClick: this.handleClick,
                        children: this.props.children,
                    });
                },
            });
        },
    };

    return History;
};
